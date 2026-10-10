# Guía del código y su evolución desde el primer push

Esta guía explica el aplicativo completo: qué hace cada archivo, cómo se conectan sus funciones, qué se cambió desde el primer push y cómo comprobarlo. Se describe el código actual; los commits permiten consultar las versiones anteriores. Está pensada para preparar la defensa del proyecto y para que otra persona pueda mantenerlo.

## 1. Qué problema resuelve

Una analista recibe una solicitud de registro como proveedor. El sistema lee los campos y soportes pedidos, busca sus valores en un maestro ficticio, genera un formulario y prepara documentos para revisión y firma. La firma y el correo reales siguen siendo humanos. El chat permite dar comandos o hacer preguntas; las herramientas son las únicas fuentes de valores.

Cuatro ideas recorren todo el código:

1. **Contrato:** se comprueba la forma de cada entrada y salida con Zod.
2. **Procedencia:** cada valor tiene una fuente; los datos desconocidos no se inventan.
3. **Confirmación:** un permiso humano sirve para una acción concreta y se consume una vez.
4. **Separación:** el navegador muestra, el servidor transporta, el agente coordina y las herramientas trabajan con archivos.

## 2. Evolución real del repositorio

| Commit | Qué se incorporó y por qué |
|---|---|
| `53a9889` — primer push | Proyecto completo inicial: contratos, cinco herramientas, fixtures, agente, prompt, HTTP, chat, demo y documentación. Se trabajó con los requisitos R1–R5 y adjuntos, antes de recibir el PRD completo. |
| `de15ff0` | E2E con Playwright y Chromium, descargas y confirmaciones; integración en GitHub Actions. |
| `817921c` | Guía de comandos para personas sin experiencia técnica. |
| `bb76d0b` | Migración a pnpm, lockfile y comandos de CI/documentación. |
| `b1e43fe` | Diseño inspirado en la referencia: panel translúcido, avatar, burbujas y composición adaptable. |
| `f8c9cdb` | Paleta verde manzana y mejoras de contraste. |
| `ec76819` | Nuevo fondo preparado desde la referencia de la mujer con portátil. |
| `487619f` | Preguntas en lenguaje natural con selección de evidencia y guía de la clave LLM. |
| Actualización del PRD completo | Fachada con contratos exactos, estados tributarios, archivos de cierre, logs, adaptador, presupuestos, API de historial, módulo reutilizable, build y despliegue preparado. |

La guía no atribuye a los primeros commits requisitos que se añadieron después. Por ejemplo, inicialmente se bloqueaba la simulación por referencias comerciales faltantes; el PRD RN3 exige que los campos faltantes aparezcan en el checklist sin bloquear `listo_para_firma` por sí solos, y esa regla se corrigió.

Para revisar una versión anterior en Visual Studio Code sin reemplazar tus archivos:

```powershell
git log --oneline
git show 53a9889:src/tools/proveedor.ts
git diff 53a9889 HEAD -- src
```

`log` muestra cambios; `show` enseña un archivo de aquel commit; `diff` compara la primera implementación con la actual. No es necesario usar `reset` ni borrar trabajo local.

## 3. Mapa de archivos

```text
agent/prompt.md                  Reglas del modelo
src/contracts/proveedor.ts       Esquemas y contratos públicos/internos
src/knowledge/registro-proveedor.md  Conocimiento del proceso
src/tools/proveedor.ts           Fachada pública obligatoria
src/tools/engine.ts              Mapeo, documentos, soportes y permisos
src/tools/audit.ts               Escritura de auditoría
src/agent/orchestrator.ts        Coordinación de un turno
src/agent/confirmation.ts        Permisos humanos por turno
src/agent/answers.ts             Evidencia y respuestas verificables
src/agent/llm.ts                 Intenciones y consultas del agente
src/llm/adapter.ts               Interfaz independiente del proveedor
src/llm/openai.ts                Peticiones a OpenAI
src/llm/runtime.ts               Presupuestos y configuración del modelo
src/server/index.ts              API, sesiones y recursos estáticos
src/web/                        HTML, CSS, JavaScript y recursos locales
demo.ts                         Verificación sin LLM
scripts/                        Build de assets y módulo reutilizable
modulo/                         Integración con otras plataformas
tests/                          Pruebas internas y E2E
fixtures/reto-01/                Datos originales de solo lectura
```

Los documentos README, SOLUCION y `docs/` explican uso, decisiones y evidencia. `.github/workflows/ci.yml` automatiza validaciones en GitHub. Dockerfile, compose.yaml y render.yaml preparan ejecución en contenedor y hosting.

## 4. Contratos: `src/contracts/proveedor.ts`

Zod describe qué formas de datos acepta el sistema. `safeParse` permite devolver un error controlado, en lugar de detener toda la sesión. `.strict()` rechaza propiedades inesperadas en los objetos públicos.

| Esquema o tipo | Para qué sirve |
|---|---|
| `caseId` | Restringe nombres de casos; impide argumentos con rutas como `../../`. |
| `artifactId` | UUID de documento registrado en una sesión. |
| `date` | Valida formato y existencia real de la fecha; no acepta 30 de febrero. |
| `errorSchema`, `result`, `ToolResult` | Formato común de éxito o error tipado. |
| `solicitud` | Estructura del correo normalizado; valida país, correos, formato y adjuntos. |
| `field`, `plantilla` | Etiquetas y coordenadas XLSX u obligatoriedad de campos PDF/portal. |
| `support`, `supportStatus`, `supportEvaluation` | Índice de soportes, estado físico/vigencia y elegibilidad previa. |
| `maestroSchema` | Estructura completa del maestro; cuentas, NIT y códigos se conservan como texto. |
| `mappedField`, `mapping` | Valor, fuente, confianza, nota y los tres estados del mapeo. |
| `artifact` | UUID, nombre, tipo MIME, tamaño y hash SHA-256. |
| `generated`, `packageData`, `sent` | Salidas de formulario, paquete y simulación. |
| `contracts` | API interna del motor: `caso_id` y UUID ya registrados. |
| `publicContracts` | Entradas obligatorias del PRD: `caso`, `campos`, `mapeo` y `confirmado`. |
| `ToolName`, `CriticalAction`, `toolNames` | Nombres permitidos y distinción de acciones críticas. |

Existen dos capas de contratos por un motivo práctico: el modelo usa la forma del PRD, mientras que el motor identifica artefactos con UUID confiables. No se aceptan valores bancarios libres ni una ruta de descarga elegida por el modelo.

## 5. Herramientas públicas: `src/tools/proveedor.ts`

Cada export tiene una descripción breve, un objeto de esquemas `args` con `.describe()` y `execute(args, ctx)`. Devuelve un **string JSON**, no una excepción.

| Función / objeto | Comportamiento |
|---|---|
| `ToolContext` | Raíz del proyecto y sesión confiables; puede recibir motor y callback de autorización para integración. |
| `engine` | Reutiliza el motor de una sesión o crea uno en una caché acotada. |
| `releaseToolSession` | Libera la caché cuando termina una integración externa. |
| `failure` | Construye errores públicos sin claves ni rutas internas. |
| `defineTool` | Valida contexto, argumentos y salida, registra auditoría y serializa JSON. Captura fallos. |
| `leer_solicitud` | Devuelve solicitud, país, formato, campos y soportes pedidos. |
| `mapear_campos` | Comprueba que etiquetas/celdas sean las reales del caso antes de mapear. |
| `generar_formulario` | Compara el mapeo recibido con uno recalculado; rechaza modificaciones inventadas. |
| `armar_paquete` | Busca el formulario de ese caso y sesión; el motor exige permiso humano. |
| `simular_envio` | Exige `confirmado` y un permiso independiente; utiliza el paquete de la sesión. |
| `proveedorTools` | Registro de los cinco nombres que conoce el modelo. |
| `executePublic` | Invoca el objeto, deserializa y vuelve a validar para callers TypeScript. |

La caché solo sirve a quien invoca los objetos directamente. El HTTP y el demo proporcionan su motor explícito, de modo que su vida útil se controla desde esos componentes.

## 6. Motor: `src/tools/engine.ts`

`createProveedorTools` crea un motor aislado con registros de artefactos, reloj inyectable y callback de autorización. El reloj inyectable permite probar vencimientos sin editar fixtures. Internamente puede usar fallos controlados; `execute` los captura antes de retornar al agente.

### Lectura y seguridad de rutas

- `safePath` resuelve la ruta real y verifica que permanezca dentro de fixtures. También bloquea symlinks que apunten fuera.
- `json` lee un archivo y valida su contenido con el esquema correspondiente.
- `repositoryPath` admite los archivos en `repositorio/` del PRD o en la distribución plana original recibida.
- `readCase` valida el correo y exige que su ID coincida con la carpeta.
- La tabla fiscal y la función `ambiguous` identifican equivalentes de país y etiquetas fiscales que requieren revisión.

### Mapeo y soportes

`map` recorre la plantilla en orden. Para cada etiqueta busca una clave exacta en el glosario y sigue su ruta en el maestro. Usa comprobaciones de propiedades propias, evitando rutas inesperadas. Si no hay valor, lo deja nulo. Si hay fuente, conserva el valor original.

Los estados son `lleno`, `faltante` y `requiere_confirmacion`. Un NIT usado como RUC/RTN extranjero conserva el valor pero añade confianza 0,7 y «identificador extranjero». La confianza no es una probabilidad calculada por el LLM: es una regla determinista explícita. Un glosario exacto ordinario recibe confianza 1. Un dato ausente recibe 0.

`evaluateSupports` compara requisitos con el índice, revisa que no haya tipos duplicados, comprueba archivos y fechas y devuelve estados, ausentes y `listo_para_firma`. Lee soportes existentes para poder copiar los mismos bytes al paquete. Un soporte vence si su fecha es anterior al día de evaluación; la fecha límite es inclusiva. Un campo faltante no participa en ese cálculo.

### Artefactos y documentos

- `save` escribe la exportación canónica y una copia privada por sesión/UUID; calcula hash y tamaño y registra el documento.
- `route` devuelve la ruta lógica `out/<caso>/...`, sin revelar una ubicación interna absoluta.
- `record` exige que UUID, caso y tipo correspondan a la sesión.
- `authorize` consume el permiso desde el callback de confirmación; no utiliza un booleano aportado por el modelo como autoridad.

La lectura de solicitud permite continuar con el correo si la plantilla está corrupta, pero informa que no se pudieron leer campos. El mapeo o formulario de esa plantilla sí devuelven error controlado.

ExcelJS crea las hojas y escribe las etiquetas/valores en coordenadas indicadas. No convierte una cuenta a número. La hoja adicional de revisión identifica el borrador y la firma pendiente. pdf-lib crea páginas con campos ordenados. Para portal, se genera una tabla Markdown de valores y se declara formato no soportado.

El paquete comprueba el hash del formulario, reevalúa soportes, escribe copias en `paquete/` y genera checklist, correo sin datos bancarios y manifiesto. También crea un ZIP. Los archivos vencidos se incluyen para revisión, pero bloquean `listo_para_firma`. Los ausentes no se sustituyen por otro tipo de soporte.

La simulación revalida permiso y vigencia y escribe `ENVIO-SIMULADO.md`. No usa una biblioteca de correo ni accede a un portal. Firma y envío real siguen siendo falsos/pendientes en la salida.

`execute` valida argumentos, despacha al método correcto, transforma fallos en errores tipados, valida la salida y registra auditoría. `listCases` devuelve el catálogo; `download` sirve únicamente bytes de un UUID registrado. `latestForm` y `latestPackage` permiten a la fachada resolver artefactos sin pedir rutas al modelo.

## 7. Auditoría: `src/tools/audit.ts`

`writeAudit` escribe una línea JSON por registro en `out/log.jsonl` y en `out/<caso>/log.jsonl`. Incluye timestamp, sesión, herramienta, `ok` y resumen técnico. El resumen registra códigos y operaciones, no mensajes del usuario, cuentas ni cuerpos completos del proveedor. Se redacta cualquier aparición literal de la clave configurada.

La fachada registra las llamadas públicas y el motor también registra revalidaciones internas. Por eso el log puede tener más líneas que tarjetas visibles en el chat. Un fallo de escritura se devuelve como error; no se afirma que la auditoría se guardó si no fue posible.

## 8. Confirmación: `src/agent/confirmation.ts`

`ConfirmationGate` mantiene una pregunta pendiente, un permiso y un contador de turnos.

- `ask` registra pregunta, acción, caso y artefacto.
- `userTurn` avanza el turno y solo acepta una afirmación completa e inmediata. Un «sí» citado no sirve.
- `consume` entrega el permiso una vez y comprueba que corresponda al mismo artefacto y acción.
- `clear` elimina permisos y preguntas.
- `status` permite mostrar la pregunta pendiente.

Dos «sí» pueden ejecutar dos acciones solamente si hubo dos preguntas independientes: uno para el paquete y otro para la simulación. Repetir un «sí» sin nueva pregunta no reutiliza permisos.

## 9. Agente: `src/agent/orchestrator.ts`

`createSession` reúne motor, gate, historial, contexto de evidencia, adaptador y presupuestos. La sesión guarda el caso actual, último formulario/paquete y hasta cuatro preguntas previas del mismo caso.

`chat` procesa un turno. `busy` impide acciones simultáneas en esa sesión. Registra el mensaje del usuario, cuenta pasos y comprueba el caso. Si el usuario nombra otro caso, lo verifica mediante una herramienta y envía `case_selected` para actualizar el selector del navegador. Al cambiar de caso limpia permisos, artefactos activos y contexto conversacional.

Los helpers internos tienen responsabilidades pequeñas:

- `send`: agrega eventos al historial y los envía al transporte.
- `step`: cuenta pasos y detiene el turno al alcanzar el límite.
- `call`: muestra argumentos, ejecuta la fachada pública, muestra resultado y conserva evidencia exitosa.
- `ask`: formula la pregunta humana concreta y envía el estado visual de confirmación.

Si llega una afirmación válida, ejecuta solo la acción del permiso. Si no, elige una intención. Las consultas leen y mapean; preparar lee, mapea y genera, luego pregunta por el paquete. Después de empaquetar muestra soportes/faltantes/estado y pregunta por la simulación. Una ruta de portal genera valores copiables y termina sin proponer automatización del sitio.

Los errores se muestran con lenguaje claro. `finally` siempre libera `busy`, oculta el indicador y emite `done`. El ciclo sigue rutas acotadas; no ejecuta un bucle abierto de argumentos arbitrarios del modelo.

## 10. Evidencia: `src/agent/answers.ts`

`answerSchema` solo admite un estado y una lista de identificadores. `collectEvidence` transforma resultados de herramientas en elementos numerados con etiqueta, valor y fuente. Evita duplicar listas derivadas o mapeos ya disponibles para reducir el contexto del modelo.

`renderAnswer` rechaza IDs inexistentes, duplicados, listas vacías para `answered`, propiedades adicionales y texto libre. Luego construye la respuesta con los valores referenciados. Si falta información o la pregunta está fuera del alcance, usa una respuesta fija.

Esto evita publicar valores inventados, pero no garantiza que el modelo seleccione el dato más pertinente. Es una limitación reconocida; las tarjetas permiten revisar la fuente completa.

## 11. Intenciones y proveedor LLM

En `src/agent/llm.ts`, `localIntent` reconoce comandos exactos sin gastar tokens. `chooseIntent` usa el modelo para lenguaje natural y valida el enum. `answerQuestion` usa el contrato de selección de evidencia. `requestModel` lee prompt y conocimiento, genera esquemas JSON desde Zod y delega a un runtime; no contiene el prompt como literal largo.

`src/llm/adapter.ts` define `Message`, `ToolDefinition`, `ModelReply` y `LlmAdapter`. Es un contrato propio independiente de OpenAI. Una implementación alternativa puede inyectarse al crear la sesión.

`OpenAIAdapter.enviar` construye una petición HTTPS, usa la clave solo en Authorization, aplica timeout, valida respuesta y retorna datos o error controlado. Descarta cuerpos de error y trazas del proveedor. Recibe contratos de herramientas, pero `tool_choice:none` conserva la ejecución en el agente. La respuesta real sigue siendo JSON estructurado de intención/evidencia.

En `src/llm/runtime.ts`, `modelLimits` lee límites numéricos con valores seguros predeterminados. `createModelRuntime` reserva presupuesto antes de llamar al proveedor. La reserva incluye bytes UTF-8, margen y salida máxima; por eso es conservadora. Se acumula por sesión y en un contador diario del proceso. No devolver reservas evita que una API sin `usage` o una llamada fallida permita uso ilimitado. `lastError` permite explicar el bloqueo al chat.

El contador diario no se comparte entre réplicas y se pierde al reiniciar. El hosting y OpenAI deben tener límites adicionales si el aplicativo se usa en producción.

## 12. Servidor: `src/server/index.ts`

`dotenv/config` carga `.env` al iniciar. El servidor crea un catálogo y un mapa de sesiones con hora del último acceso. No imprime el entorno ni la clave.

- `scrub`: redacta la clave literal en cualquier JSON/NDJSON enviado.
- `json`: responde con código HTTP y JSON seguro.
- `body`: limita el tamaño de petición y convierte JSON sin lanzar al caller.
- `authorized`: busca la sesión del header y controla caducidad.
- `originAllowed`: verifica origen local/HTTPS o `PUBLIC_ORIGIN`; rechaza peticiones de navegador de otro sitio.
- `rateAllowed`: limita POST por minuto e IP sin confiar en headers enviados por el cliente.

La callback HTTP sirve solo una lista explícita de recursos web, crea sesiones, recibe chat, consulta historial, descarga UUID y entrega health/catálogo. Añade CSP y headers de seguridad. El historial solo puede consultarse con el token de su propia sesión. Los errores genéricos no publican stack ni ruta interna.

La API usa `X-Session-Id` como token de demo, no un sistema corporativo de autenticación. En producción necesita autorización real por usuario/empresa. Las sesiones son memoria: recargar crea otra y reiniciar las elimina.

## 13. Frontend: HTML, CSS, JavaScript y assets

`src/web/index.html` define selector de caso, historial, botones, aviso de datos ficticios, indicador, confirmación y formulario del mensaje. Los labels `Solicitud` y `Mensaje` permiten accesibilidad básica y selección estable en E2E.

`styles.css` define variables de color, fondo local y transparencias verde manzana, panel, burbujas, botones, tarjetas, confirmación, estados de foco, layouts de escritorio/móvil y movimiento reducido. El historial tiene scroll propio. El fondo fue reprocesado con IA desde la referencia; su origen se documenta. Los recursos no se descargan de servicios externos durante el chat.

Funciones de `chat.js`:

| Función | Responsabilidad |
|---|---|
| `$` | Buscar un elemento por ID. |
| `message` | Crear una burbuja usando `textContent`, sin ejecutar HTML del usuario. |
| `setBusy` | Indicador y bloqueo de controles mientras se procesa. |
| `artifacts` | Encontrar metadatos de documentos descargables en una salida. |
| `event` | Interpretar eventos, actualizar caso, herramientas, mensajes y confirmaciones. |
| `send` | Mandar mensaje, leer NDJSON por fragmentos y recuperar controles aun ante error. |
| `init` | Crear sesión, cargar casos, leer modo del backend y habilitar controles. |

Los listeners conectan formulario, botones, selector y sí/no con `send`. La descarga utiliza header de sesión, obtiene un Blob, crea un enlace temporal y libera su URL. El navegador nunca recibe la clave LLM. «LLM configurado» solo indica que hay una clave, no que la llamada autenticada ya funcionó.

## 14. Demo y scripts

`demo.ts` obtiene el catálogo, limpia `out/`, recorre todos los casos y ejecuta los cinco objetos públicos sin LLM. Conecta un gate y emula afirmaciones para comprobar autorización; antes verifica que la misma acción sin permiso sea rechazada. Usa fecha UTC actual, o la fecha del correo cuando recibe `--historico`. Compara elegibilidad y simulación y termina con código distinto de cero si el resultado no cumple.

No hay valores inventados para volver verdes los casos: soportes vencidos o ausentes son bloqueos esperados. La salida resumen usa rutas estables; UUID privados no se imprimen. Detén el servidor antes de correr el demo si necesitas sus documentos, porque limpia la misma carpeta de exportación.

`copy-assets.ts` copia web y conocimiento al build para que `node dist/server/index.js` pueda servirlos. `build-module.ts` genera el frontmatter y cuerpos del módulo desde las fuentes. En modo `--check`, compara sin escribir y falla si hay divergencia. Los exports de herramientas son reexportaciones, no otra implementación.

## 15. Fixtures y archivos de salida

Los JSON de caso describen correo, requisitos y mapa de plantilla. El glosario relaciona etiquetas con rutas del maestro. El índice de soportes describe tipo, archivo y vigencia. Los TXT son placeholders ficticios. `origen.json` conserva el registro histórico de cómo se agruparon adjuntos con nombres repetidos; su texto sobre ausencia del PRD corresponde al momento inicial, no a la situación actual.

Salida por caso:

```text
out/<caso>/
  formulario.xlsx o formulario.pdf
  valores-portal.md                solo portal
  paquete/
    formulario.*
    soportes/*.txt
    checklist.md
    borrador-correo.md
    manifiesto.json
  paquete-borrador.zip
  ENVIO-SIMULADO.md                 solo si se autorizó y no está bloqueado
  log.jsonl
```

`out/log.jsonl` contiene auditoría global. `out/.sesiones/` mantiene copias privadas para descargas. Las exportaciones canónicas representan la última preparación de un caso; para conservar documentos de una sesión usa sus descargas. Los archivos generados se ignoran en Git.

## 16. Pruebas y CI

| Archivo | Qué comprueba |
|---|---|
| `tests/tools.test.ts` | Contratos, rutas, symlinks, lectura, Excel/PDF, hash, ZIP, soportes, países, portal y aislamiento. |
| `tests/confirmation.test.ts` | Permisos inmediatos, citas, turnos intermedios, consumo y modelo sin autoridad. |
| `tests/answers.test.ts` | Respuestas con evidencia, referencias falsas, cambio de caso, fallos y ausencia de clave. |
| `tests/http.test.ts` | Backend real, stream, descarga, historial, health, origen y aislamiento de sesión. |
| `tests/prd.test.ts` | Forma pública del PRD, mapeo manipulado, archivos de cierre, logs, RN3, presupuestos, tope y timeout. |
| `tests/e2e/helpers.ts` | Chromium, sesión nueva, espera de turno, guardia de red y lectura de resultados validados. |
| `tests/e2e/server.ts` | Servidores aislados con copias de fixtures y limpieza al terminar. |
| `tests/e2e/mock-llm.ts` | Respuestas OpenAI controladas solo en el harness de pruebas; nunca importado por producción. |
| `tests/e2e/proveedor.spec.ts` | Uso real de UI, documentos, confirmaciones, errores, XSS y recuperación. |
| `tests/e2e/llm.spec.ts` | Consultas desde navegador, rechazo de respuesta inválida y prompt de defensa. |

El servidor preparado extiende vigencias solo en copias temporales para probar un camino exitoso. El original conserva fechas para probar bloqueo hoy. El servidor LLM utiliza el backend real con proveedor simulado. Ninguna prueba de esa suite requiere una clave o cobra consumo.

`playwright.config.ts` inicia los tres servidores, configura Chromium, dos workers, tiempos y reportes. `.github/workflows/ci.yml` instala versiones fijadas, ejecuta check/Bun y E2E y conserva reportes. Una ejecución local exitosa no demuestra que el workflow remoto ya se haya ejecutado.

## 17. Configuración y despliegue

- `package.json`: scripts y dependencias. `pnpm-lock.yaml` fija versiones.
- `pnpm-workspace.yaml`: override de uuid transitivo de ExcelJS, permisos de instalación y cachés en node_modules.
- `tsconfig.json`: TypeScript estricto; `tsconfig.build.json` compila solo `src/` a `dist/`.
- `.env.example`: nombres/configuración pública de ejemplo; `.env` queda ignorado.
- `.gitignore`: excluye secretos, dependencias, salida y reportes.
- `Dockerfile`: build con dependencias y compilación; runtime con dependencias de producción, usuario no privilegiado y healthcheck.
- `.dockerignore`: evita copiar `.env` y salidas al contexto de imagen.
- `compose.yaml`: ejecución local y volumen para documentos.
- `render.yaml`: Blueprint para crear un servicio; secretos se ingresan en la cuenta del proveedor.

El código y los archivos de despliegue no equivalen a una URL publicada. Se necesita activar hosting y hacer una pregunta con una clave propia. La evidencia de lo que realmente se ejecutó está en `docs/VALIDACION.md`.

## 18. Recorrido práctico completo

1. Ejecutas `pnpm run dev`: dotenv carga configuración y HTTP escucha.
2. El navegador pide sesión, catálogo y health.
3. Seleccionas CO y pulsas Preparar: el agente muestra lectura, mapeo y generación.
4. Las herramientas escriben formulario con valores del maestro y muestran faltantes/revisiones/soportes.
5. El agente pregunta por el paquete; respondes sí en el turno siguiente.
6. El gate concede permiso específico; el motor crea archivos de paquete y ZIP y audita.
7. El agente muestra el estado y pregunta por simulación.
8. Otra afirmación autoriza la simulación. Si hay soportes vencidos o ausentes, retorna error controlado; si no, escribe el archivo simulado.
9. Una pregunta al chat obtiene información de herramientas y referencias validadas. Nunca sustituye un permiso humano.
10. Las descargas utilizan la sesión; otra sesión no puede reutilizar el UUID.

Para explicar una decisión durante la defensa, combina esta guía, la sección correspondiente de SOLUCION y su prueba. Para explicar una línea concreta, abre su archivo actual y consulta el commit con Git. Esta guía cubre responsabilidades y flujo completo, pero la persona que presenta el reto debe revisar y comprender el código antes de defenderlo.
