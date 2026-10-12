# Solución · Agente conversacional "Registro como Proveedor"

## 1. Problema en una frase

La analista administrativa transcribe a mano, en cada solicitud de registro como proveedor, datos que ya existen en el repositorio maestro y busca los soportes uno por uno. Eso causa retrabajo, errores en datos sensibles (NIT, cuenta bancaria), dependencia de una persona y días de espera que retrasan la facturación.

## 2. Arquitectura

```mermaid
flowchart LR
    Chat[web/ · chat modal<br/>historial, herramientas, confirmación] -->|POST /api/chat NDJSON| Server[src/server.ts<br/>HTTP, sesiones, límites]
    Docs[web/ · flujo documental<br/>botones] -->|/api/workflow/*| Server
    Server --> Agent[src/agent/<br/>ciclo del agente + puerta de confirmación]
    Server --> Workflow[src/workflow/<br/>flujo documental]
    Agent -->|tool calling| LLM[src/llm/adapter.ts → anthropic.ts<br/>Claude]
    Agent --> Tools[src/tools/proveedor.ts<br/>5 herramientas zod]
    Workflow --> Tools
    Tools --> Engine[src/tools/engine.ts<br/>mapeo, reglas, Excel/PDF/ZIP]
    Engine --> Fixtures[(fixtures/ · solo lectura)]
    Engine --> Out[(out/ · formularios, paquete, log.jsonl)]
```

| Responsabilidad | Dónde vive |
|---|---|
| **Comportamiento** (system prompt) | `agent/prompt.md`, leído en cada llamada al modelo. |
| **Conocimiento** del proceso | `src/knowledge/registro-proveedor.md`, enviado al modelo como `process_knowledge`. |
| **Ejecución** | `src/tools/proveedor.ts` (contrato público: `description`, `args` zod con `.describe()`, `execute(args, ctx)` que devuelve un JSON en texto y nunca lanza) y `src/tools/engine.ts` (reglas y archivos). |
| HTTP y sesiones | `src/server.ts`. No contiene reglas de negocio: un cambio de reglas no lo toca. |

Las herramientas no importan el servidor: `demo.ts` y `modulo/` las usan directamente. Las reglas por país, el glosario y las vigencias viven en el motor y en los fixtures, no en el servidor ni en el prompt.

## 3. Ciclo del agente

Cada mensaje del chat ejecuta un turno en `src/agent/orchestrator.ts`. Con `LLM_API_KEY` y Claude, **Claude conduce el turno con tool calling**:

1. **Mensaje.** El servidor agrega a la conversación el mensaje de la usuaria con el caso activo. El system prompt es `agent/prompt.md` más `src/knowledge/registro-proveedor.md`.
2. **Modelo.** Claude recibe las cinco herramientas (`proveedor_<export>`) y decide qué llamar. Cada `tool_use` se valida con zod antes de ejecutarse. Argumentos inválidos o una herramienta desconocida vuelven al modelo como error (`is_error`).
3. **Herramientas.**
   - El servidor completa `campos` y `mapeo` con los resultados de la sesión, así que el modelo no puede alterar un mapeo.
   - El modelo recibe un resumen con etiquetas, estados, fuentes y rutas, sin valores del maestro (CA2). Así no puede afirmar un número de cuenta que nunca vio.
   - Cada llamada se muestra en el chat (nombre, argumentos y resultado) y queda en `out/log.jsonl` y `out/<caso>/log.jsonl` (CA4).
4. **Respuesta.** Cuando Claude deja de pedir herramientas, su texto es el resumen del turno: ruta, campos llenos y faltantes, `listo_para_firma`, soportes a actualizar y una pregunta.
5. **Tope.** Cada llamada al modelo o a una herramienta consume una iteración. Al llegar a `AGENT_MAX_ITERATIONS` (25), el turno se corta, se conserva lo obtenido y cada `tool_use` pendiente recibe un resultado para que la conversación siga siendo válida (CA1). La conversación solo se agrega (append-only), para conservar el razonamiento del modelo entre llamadas.
6. **Errores (CA5).** Un error del proveedor (timeout, clave rechazada, límite de solicitudes) se muestra en el chat en lenguaje claro. Si ocurre en la primera llamada, el turno continúa con las palabras clave, y la sesión no muere.

**Confirmación humana (CA3, RN4).** `proveedor_armar_paquete` y `proveedor_simular_envio` tienen efecto, así que cuando Claude las pide no se ejecutan:
- El servidor registra una pregunta explícita, ligada a la acción, el caso y el artefacto, y termina el turno con el aviso resaltado en el chat.
- Solo si el **siguiente** mensaje es afirmativo («sí», «confirmo»…), el servidor ejecuta la acción y se lo informa al modelo en su próximo turno.
- Un mensaje intermedio, una cita o un cambio de caso anulan la pregunta.
- El motor de herramientas vuelve a verificar el permiso (`src/agent/confirmation.ts`), y el `confirmado` que mande el modelo no autoriza nada.
- Un paquete que no está listo para firma nunca se propone para envío.

**Sin clave, o con un proveedor sin tool calling (OpenAI):** el turno usa el modo de intención. Las palabras clave o el modelo eligen una intención de una lista cerrada (`preparar`, `simular`…), que ejecuta una secuencia fija de herramientas. Para consultas libres, el modelo solo elige evidencia de los resultados. Las mismas confirmaciones aplican.

Secuencia del envío: «procesa…» genera el formulario y pregunta por el paquete. «envía» sin paquete pide confirmar el paquete. El «sí» lo arma; si `listo_para_firma`, pregunta por el envío, y el segundo «sí» escribe solo `ENVIO-SIMULADO.md`.

## 4. Elección del modelo

- **Proveedor y modelo:** Anthropic, Claude Opus 5.5 (`claude-opus-5-5`), con el SDK oficial `@anthropic-ai/sdk` en [src/llm/anthropic.ts](src/llm/anthropic.ts).
  - **Salida JSON con esquema** (`output_config.format`, tipo `json_schema`): la intención y la selección de evidencia siempre cumplen el esquema, que luego se valida otra vez con zod.
  - **Esfuerzo:** `medium` en el ciclo con herramientas y `low` en el modo de intención (tarea corta).
  - **Caché de prompts:** el prefijo que se repite en cada llamada del ciclo (herramientas, prompt, conocimiento y turnos previos) se cachea con `cache_control`.
  - **Respaldo ante rechazos de seguridad** con `fallbacks: "default"`.
  - Elegimos el modelo más capaz por defecto. Para bajar costo se puede cambiar `LLM_MODEL` a `claude-haiku-5-5` sin tocar código; no se midió si la calidad se mantiene.
- **Cambio de proveedor:** `LlmAdapter.enviar(mensajes, herramientas, opciones)` aísla el proveedor, y `LLM_PROVIDER` elige el adaptador al crear la sesión, sin tocar el ciclo. Están implementados Anthropic (por defecto) y OpenAI (`gpt-4.1-mini`).
- **Control de gasto:**
  - El runtime reserva un presupuesto conservador por llamada (bytes UTF-8 de la carga más la salida máxima), contra `LLM_MAX_SESSION_TOKENS` por sesión y `LLM_MAX_DAILY_TOKENS` por proceso y día UTC.
  - Se cuentan también las llamadas fallidas.
  - El timeout al proveedor (`LLM_TIMEOUT_MS`) se muestra como error claro.
  - `CHAT_RATE_LIMIT` limita los POST por IP.
- **Costo estimado por caso:** se estima, no se midió, porque no hubo clave disponible durante la construcción.
  - Fórmula: `(tokens_entrada × precio_entrada + tokens_salida × precio_salida) / 1.000.000`.
  - Un caso típico hace una clasificación por mensaje con frase libre, más una selección de evidencia por consulta.
  - Procesar un caso con tool calling son unas 4 o 5 llamadas al modelo (leer, mapear, generar y resumen), y cada una reenvía la conversación. Estimación: ≈ 60.000 tokens de entrada (en su mayoría lecturas de caché, a 0,1× la tarifa) y ≈ 3.000 de salida, razonamiento incluido. A las tarifas de Claude Opus 5.5 (USD 4 / USD 20 por millón; caché USD 0,20) da **≈ USD 0,10–0,30 por caso**, según cuánto aproveche la caché. Con Claude Haiku 5.5 sería menos de USD 0,01. Hay que verificar las tarifas vigentes antes de publicar.
  - Las órdenes reconocidas por palabras clave y el flujo documental no consumen tokens.

## 5. Diseño del portal web (§7.4)

**Hoy.** El caso de Panamá responde «Formato no soportado: portal web» y genera `out/pa-logistica-istmo/valores-portal.md` con etiqueta, valor, estado y fuente, listos para copiar. No inicia sesión ni dice haber cargado nada.

**Estrategia de automatización.** Navegador controlado por el agente (Playwright) en una sesión aislada por operador:
- Selectores por etiqueta y rol accesible.
- Pruebas por versión del portal.
- Pausa ante un layout desconocido.

El agente solo **rellenaría campos y adjuntaría soportes**, con una vista previa antes de cada cambio. Descarté RPA de escritorio por ser frágil y costosa de mantener. Una extensión de navegador queda como alternativa si el cliente bloquea navegadores automatizados.

**Límites.** CAPTCHA, MFA, cambios de estructura y términos del cliente que prohíban automatizar. Ante cualquiera de ellos, el agente se detiene y cede el control al humano, sin intentar eludirlos.

**Credenciales:**
- Nunca están en el repositorio, el prompt, el modelo ni los logs.
- Las ingresa el operador directamente en el navegador del portal, o se toman de un gestor corporativo de secretos fuera del alcance del modelo.
- Se desactivan grabaciones en las pantallas de autenticación y las cookies se destruyen al terminar.

**Reparto:**

| Agente | Humano |
|---|---|
| Prepara los valores, navega a los formularios, rellena campos y adjunta soportes. | Ingresa credenciales, resuelve MFA y CAPTCHA, revisa la vista previa y pulsa «Enviar». |

## 6. Decisiones y trade-offs

| Decisión | Alternativa descartada y por qué |
|---|---|
| Claude conduce el turno con tool calling, pero el servidor completa `campos` y `mapeo` y ejecuta las acciones con efecto solo tras la confirmación. | **El modelo pasa el mapeo completo como argumento** (el contrato literal de §6.2): costaría miles de tokens por llamada y permitiría alterar valores. **Secuencias fijas sin tool calling** (la versión anterior): más barata y predecible, pero el modelo no decide el flujo. Se conserva como modo sin clave. |
| Respuestas armadas con evidencia de herramientas. | **Prosa libre del modelo:** podría introducir nombres, cuentas o vigencias sin fuente. |
| Puerta de confirmación en el servidor, por acción, caso y artefacto. | **Confiar en el `confirmado` que manda el modelo o el navegador:** permitiría saltarse la confirmación. |
| Palabras clave cuando no hay clave LLM. | **Exigir clave para usar el chat:** la defensa y `demo.ts` no deberían depender de un proveedor externo. |
| Chat como ventana modal sobre un flujo documental por botones. | **Solo chat:** para la tarea repetitiva de la analista, los botones son más rápidos; el chat cubre la conversación y la demo del PRD. |
| Formularios reconstruidos desde los mapas JSON. | **Rellenar binarios originales:** no fueron entregados. El Excel respeta hoja y celda; el PDF respeta el orden. |
| `FECHA_EVALUACION` visible y nunca futura. | **Editar vigencias en los fixtures:** los fixtures no se modifican, y una fecha futura serviría para ocultar vencimientos. |
| HTML y JS sin framework en el front. | **SPA con build:** no aporta nada al reto y añade dependencias. |

## 7. Supuestos

- **Glosario:** las equivalencias se aplican por coincidencia exacta de etiqueta. Una etiqueta sin equivalencia o sin valor en el maestro es `faltante`; nunca se inventa.
- **Identificador tributario (RN1):**
  - En EC, PE, PA y HN el campo se llena con el NIT colombiano y queda `requiere_confirmacion` con confianza 0,7, la nota «identificador extranjero» y el equivalente del país (RUC o RTN).
  - Las etiquetas ambiguas («Identificación tributaria») también requieren confirmación.
  - Un mapeo explícito del glosario tiene confianza 1.
- **Soportes (RN3):**
  - Un soporte vencido, ausente del índice o sin archivo bloquea `listo_para_firma`. Un campo faltante no lo bloquea, pero aparece en el checklist.
  - Un paquete bloqueado no se propone para envío.
- **Fechas:** la vigencia se evalúa contra la fecha UTC de ejecución, o contra `FECHA_EVALUACION` si se define.
- **Datos bancarios (RN2):** solo se escriben donde la plantilla los pide y nunca en `borrador-correo.md`.
- **Repositorio maestro:** se admite tanto `fixtures/reto-01/repositorio/` (estructura del PRD) como la estructura entregada (`maestro.json` y `soportes/` en la raíz).
- **Plantillas y demo:**
  - Una plantilla corrupta, ausente o con un mapa inválido no detiene el caso: el mapeo devuelve el reporte de soportes y un aviso, y solo se bloquea el formulario.
  - `out/` es efímero: `demo.ts` lo limpia al iniciar.

## 8. Cobertura

| Historia / requisito | Estado | Evidencia · qué falta para producción |
|---|---|---|
| HU-1 Leer la solicitud | Hecho | Campos, país, cliente, formato, soportes y equivalentes por país. |
| HU-2 Mapear al maestro | Hecho | Tres estados con ruta en el maestro, glosario y confianza. Falta validación legal de equivalencias reales. |
| HU-3 Excel (P0) y PDF (P1) | Hecho | Hoja y celda del mapa; PDF ordenado. Faltan las plantillas binarias originales del cliente. |
| HU-3 Portal (P2) | Hecho (alcance P2) | «Formato no soportado» y `valores-portal.md`. Diseño en §5. |
| HU-4 Paquete para firma | Hecho | Formulario, soportes, checklist presentes / vencidos / ausentes, borrador de correo, resumen en el chat, pregunta explícita y `ENVIO-SIMULADO.md` tras confirmación. |
| HU-5 Manejo de errores | Hecho | `{ ok, data }` / `{ ok: false, error }`, nunca lanza. Una plantilla corrupta conserva el reporte de soportes. Caso inexistente y formato no soportado con mensaje claro. |
| Front de chat (§6.1) | Hecho | Modal con historial, «pensando», tarjetas de herramientas y confirmación resaltada. |
| Ciclo del agente con LLM (§6.1, CA1–CA5) | Hecho | Claude con tool calling: tope de 25 iteraciones, confirmación en el servidor, log, errores claros y resultados resumidos sin valores sensibles. Probado con un modelo simulado en el formato de la API (`tests/agent-loop.test.ts`, `tests/prd.test.ts`); falta una corrida con clave real. |
| API (§6.4) | Hecho | `/api/chat`, `/api/sessions/:id`, `/api/health`. |
| `demo.ts` sin modelo | Hecho | Cuatro casos, cinco herramientas, sin clave. |
| Link público (§9.3) | Pendiente | Docker y Render listos. Falta crear el servicio con una cuenta de hosting. |
| Bonus `modulo/` | Hecho | Prompt, conocimiento y herramientas generados desde las mismas fuentes; `module:check` evita que diverjan. |

Para producción también falta: autenticación y cuotas por usuario, persistencia cifrada, contadores de gasto compartidos y plantillas reales del cliente.

## 9. Uso de IA

- **Codex.** Inspección de los fixtures, contratos zod, motor de herramientas, pruebas, primera versión del front y documentación.
- **Claude Code.** Revisión del cumplimiento contra el PRD y la estructura de §6.5, y además:
  - mover el servidor a `src/server.ts` y el front a `web/`;
  - recuperar el chat como modal;
  - hacer que el guion de §11 funcione sin clave (palabras clave y encadenado de paquete y envío);
  - `FECHA_EVALUACION`;
  - el adaptador de Claude (`src/llm/anthropic.ts`) con el SDK oficial y salida JSON con esquema;
  - el ciclo con tool calling (`src/agent/loop.ts` y `orchestrator.ts`) y sus pruebas;
  - la paleta #6dfd8c y la cabecera sin imagen de fondo;
  - reporte parcial con plantilla corrupta y checklist en tres secciones;
  - pruebas unitarias, HTTP y E2E del guion;
  - este documento y el README.

**Propuestas descartadas:**
- Dejar que el modelo redacte respuestas o devuelva valores: lo reemplazamos por selección de evidencia.
- Integrar correo real: es un no-objetivo del PRD.
- Desplazar la vigencia de los fixtures para la demo: se prefirió una fecha simulada, visible y validada.
- Que el modelo pase `campos` y `mapeo` completos como argumentos: el servidor los completa desde la sesión.

El historial de Git muestra cada cambio.

## 10. Riesgos de producción y mitigación

| Riesgo | Mitigación |
|---|---|
| El modelo «completa» un campo faltante. | Las herramientas son la única fuente de valores. El modelo solo elige intención o evidencia, y el prompt prohíbe valores fuera del mapeo. |
| Gasto descontrolado de la clave. | Topes por turno, sesión y día, límite por IP y tope de gasto en la cuenta del proveedor. Con varias réplicas, contadores centralizados. |
| Datos sensibles (cuentas, identificaciones). | Datos ficticios hoy. En producción: minimizar lo que va al proveedor, acuerdos de tratamiento, cifrado, retención y permisos por empresa. Los logs ya excluyen valores bancarios y claves. |
| Sesiones y archivos en memoria y disco local. | Se pierden al reiniciar (el plan gratuito duerme). Usar almacenamiento persistente y cifrado, y backups. |
| Plantillas reales peores que los fixtures. | Validación de formatos, límites de tamaño, pruebas con documentos representativos y el reporte parcial ya implementado. |
| Validez legal de equivalencias y vigencias. | Revisión humana obligatoria y un dueño del dato para el maestro y los soportes. |
| Portales con CAPTCHA o MFA. | El humano opera el portal; el agente prepara los valores (§5). |

## Dependencias justificadas

| Dependencia | Necesidad |
|---|---|
| zod | Argumentos, salidas, fixtures y contratos de herramientas (obligatorio por el PRD). |
| @anthropic-ai/sdk | SDK oficial de Claude: tipos, errores tipados, timeout y reintentos. |
| zod-to-json-schema | Derivar los esquemas que ve el modelo desde los mismos esquemas zod. |
| ExcelJS | Escribir el XLSX respetando hoja y celda. |
| pdf-lib | Generar el PDF con etiqueta y valor en orden. |
| fflate | ZIP del paquete. |
| dotenv | Leer `.env` en el backend. |
| TypeScript, tipos de Node, tsx | Tipado estricto y ejecución de fuentes. |
| Playwright | Pruebas E2E del chat y del flujo documental. |
| Bun (local) | Verificar el comando de demo del PRD sin instalarlo globalmente. |

`pnpm-workspace.yaml` fija `exceljs>uuid` en 11.1.1 para sustituir una versión transitiva vulnerable.
