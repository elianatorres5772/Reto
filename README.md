# Registro como proveedor · Preparación documental

Aplicativo TypeScript para automatizar la transcripción de solicitudes de clientes al formulario de registro como proveedor. La pantalla de trabajo muestra solicitudes recibidas, correo, campos del maestro, soportes, documentos y autorización del paquete. El botón **Conversar con el agente** abre el chat del agente en una ventana modal. Firma y envío real siempre son humanos.

## Chat del agente

En el chat se ve el historial, el indicador «El agente está pensando…», cada llamada a herramienta (nombre, argumentos y resultado resumido, con descargas) y un aviso resaltado cuando el agente pide confirmación. Sin `LLM_API_KEY`, el agente reconoce órdenes en lenguaje natural por palabras clave («procesa el caso…», «envía», «paquete», «ayuda»). Guion de la defensa (PRD §11):

1. `Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.` → lectura, mapeo y formulario, un resumen con la ruta `out/ec-corp-andina/`, los faltantes, `listo_para_firma` y los soportes a actualizar, y al final una pregunta.
2. `envía` → pide confirmar el armado del paquete; tras «sí» lo arma. Si está listo para firma, pide una segunda confirmación y escribe solo `out/<caso>/ENVIO-SIMULADO.md`. Si tiene soportes vencidos o ausentes (RN3), no propone el envío e indica qué actualizar.

**Fecha de evaluación simulada.** Las vigencias se evalúan con la fecha UTC actual. Con los fixtures, la cámara de comercio vence el 2026-09-30, así que después de esa fecha ningún caso queda listo para firma. Para mostrar el envío simulado, arranca con `FECHA_EVALUACION=2026-08-25` (en `.env` o en el entorno del hosting). Formato `YYYY-MM-DD` y nunca futura; con un valor inválido el servidor no arranca. La fecha activa se ve en `GET /api/health` (`fecha_evaluacion`) y en la cabecera del chat. Con esa fecha, `co-industrias-delta` llega hasta `ENVIO-SIMULADO.md`. `ec-corp-andina` sigue bloqueado porque le falta `certificado_cumplimiento_tributario`, que no existe en el repositorio de soportes.

| Método y ruta | Entrada / función |
|---|---|
| `POST /api/chat` | Cabecera `X-Session-Id`; cuerpo `{caso_id, message}`. Responde NDJSON con eventos `thinking`, `tool_call`, `tool_result`, `message`, `confirmation` (`pending`/`confirmed`/`cancelled`), `case_selected` y `done`. |
| `GET /api/sessions/:id` | Historial completo de la sesión (misma cabecera `X-Session-Id`). |

## Ejecutar

Requiere Node 22.13+ y pnpm 11.19.0. Desde la carpeta del proyecto:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Abre `http://localhost:3000`. No necesitas clave LLM para leer solicitudes, completar campos, generar documentos y preparar el paquete.

1. Selecciona una **Solicitud recibida** de la lista. Se muestra el correo del cliente, país, fecha, formato, adjuntos y soportes exigidos.
2. Pulsa **Preparar documentos**. Se identifican campos, se cruzan con el maestro y se genera el Excel/PDF solicitado en un solo proceso.
3. Revisa valores y fuentes, campos faltantes, equivalencias tributarias y soportes vigentes/ausentes/vencidos.
4. Responde la pregunta de autorización con **Sí, preparar paquete** o cancela. El permiso corresponde a esa sesión, caso y formulario, y es de un solo uso.
5. Descarga el formulario y el ZIP con soportes, checklist, manifiesto y borrador de correo. La revisión, firma y decisión de envío quedan al humano.

Un soporte ausente, vencido o sin archivo bloquea `listo_para_firma`; aun así se ofrece el paquete borrador para revisar pendientes. Un campo faltante no se inventa ni bloquea por sí solo ese estado, conforme a RN3. Las equivalencias fiscales requieren revisión humana. Para portales se genera `valores-portal.md` para copia manual y no se empaqueta ni se accede al sitio.

## Alcance de las entradas

Los correos están representados en `fixtures/reto-01/casos/<caso>/solicitud.json`, junto a sus mapas de plantilla y requisitos de soportes. El repositorio maestro, glosario e índice son de solo lectura. Se conservan los adjuntos originales del reto. No hay conexión a una bandeja de correo real, ni recepción de Excel/PDF arbitrarios por upload.

Las plantillas binarias originales no fueron proporcionadas: Excel y PDF se reconstruyen desde `plantilla-celdas.json` y `plantilla-campos.json`. Se informa esta limitación en la pantalla y los documentos. Los datos y soportes son ficticios.

## Arquitectura

Monolito modular por capas: **pantalla de solicitudes → HTTP → controlador documental → herramientas Zod → fixtures / out**. `src/contracts/workflow.ts` define estados y operaciones; `src/workflow/registration.ts` controla la secuencia y la autorización. El servidor no implementa reglas tributarias, mapeo ni generación de documentos.

Se mantienen el adaptador LLM, el prompt `agent/prompt.md`, las cinco herramientas públicas del PRD y la API conversacional anterior para compatibilidad técnica y demo. La nueva interfaz no llama al LLM, a `/api/chat` ni a la herramienta de simulación. La petición posterior del usuario de sustituir el chat modifica explícitamente el requisito de interfaz conversacional del PRD original; no se afirma cumplimiento de ese requisito de UI.

## API del flujo documental

Todas las operaciones de flujo y descargas requieren `X-Session-Id`. Las sesiones se crean anónimamente y caducan tras una hora de inactividad; no sobreviven a reinicios.

| Método y ruta | Entrada / función |
|---|---|
| `POST /api/session` | Crea sesión y devuelve `session_id`. |
| `GET /api/cases` | Solicitudes disponibles. |
| `POST /api/workflow/select` | `{caso_id}`; lee el correo y descarta permisos anteriores. |
| `POST /api/workflow/prepare` | `{caso_id}`; lectura, mapeo, formulario y pregunta de autorización. |
| `POST /api/workflow/confirm` | `{caso_id,confirmation_id,confirmado}`; permiso explícito ligado a la pregunta vigente. |
| `GET /api/workflow` | Estado de preparación de la sesión. |
| `GET /api/artifacts/:id` | Descarga un documento que pertenece a la sesión. |
| `GET /api/health` | Salud del servidor; `configured` solo informa presencia de clave LLM opcional. |

Los POST del flujo devuelven NDJSON con eventos `state`, `error` y `done`. Cada estado contiene correo, mapeo, soportes, artefactos, progreso y confirmación. Las entradas y estados se validan con Zod. Los valores no se reciben del navegador; se obtienen por herramientas. Tras pérdida de conexión se consulta el estado antes de que el humano decida reintentar; no se repite automáticamente el empaquetado.

## Archivos y auditoría

`out/<caso>/formulario.xlsx` o `formulario.pdf`; para portal, `valores-portal.md`. El ZIP contiene formulario, soportes disponibles, `checklist.md`, `borrador-correo.md` y `manifiesto.json`. Hay auditoría técnica en `out/log.jsonl` y `out/<caso>/log.jsonl`, correlacionada por `sessionId` y sin valores bancarios ni claves.

Las descargas usan copias privadas en `out/.sesiones/` identificadas por UUID. Las rutas por caso representan la exportación más reciente. `.env`, `out/`, dependencias y reportes están excluidos de Git.

## Verificar

```sh
pnpm run check
pnpm exec bun run demo.ts
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e
pnpm run build
```

`check` valida TypeScript, sincronización del módulo, pruebas internas y demo. **El demo limpia `out/`**: detén el servidor y conserva tus documentos antes de ejecutarlo. Invoca las cinco herramientas originales, incluida la simulación local como verificación técnica, aunque la pantalla documental no la ofrece. `pnpm run demo:historico` evalúa las fechas originales de las solicitudes y lo declara.

Las pruebas E2E actuales verifican el nuevo flujo documental, descargas, permisos, errores, aislamiento y móvil. No necesitan LLM. Si Chromium ya está instalado en cloud: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e`. `pnpm run check:all` ejecuta check y E2E.

## Configuración y documentos

`HOST` y `PORT` son `127.0.0.1` y `3000` en local; usa `HOST=0.0.0.0` para contenedores. `PUBLIC_ORIGIN` es el origen HTTPS exacto si publicas. `CHAT_RATE_LIMIT` también limita los POST documentales. La clave `LLM_API_KEY` y límites `LLM_*` solo aplican a la API conversacional conservada, nunca son necesarios para esta pantalla.

**Link público de prueba: pendiente de activar y verificar.** La configuración Docker/Render no crea una URL automáticamente.

- [COMANDOS_PASO_A_PASO.md](COMANDOS_PASO_A_PASO.md): ejecución práctica.
- [docs/FLUJO_DOCUMENTAL.md](docs/FLUJO_DOCUMENTAL.md): especificación del flujo y diferencia con el PRD original.
- [EXPLICACION_CODIGO.md](EXPLICACION_CODIGO.md): módulos y evolución desde el primer push.
- [SOLUCION.md](SOLUCION.md): arquitectura, decisiones y portales.
- [docs/VALIDACION.md](docs/VALIDACION.md): comprobaciones y limitaciones.
- [tests/e2e/README.md](tests/e2e/README.md): pruebas del navegador.
- [PASOS_PENDIENTES_DEL_RETO.md](PASOS_PENDIENTES_DEL_RETO.md): publicación y evidencia final.
- [README_LLM.md](README_LLM.md): configuración opcional del adaptador conservado.
- [docs/PRD_RETO_01.md](docs/PRD_RETO_01.md): documento original sin modificaciones.

`modulo/` sigue reexportando las herramientas sin servidor HTTP. `pnpm run module:check` comprueba que prompt, conocimiento y herramientas coincidan con sus fuentes. Ver [modulo/README.md](modulo/README.md).
