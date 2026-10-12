# Agente conversacional · Registro como proveedor

Agente en TypeScript que lee la solicitud de un cliente, llena el formulario de registro como proveedor desde el repositorio maestro (Excel o PDF; para portal web, valores para copiar) y arma el paquete para la firma del representante legal. Nunca firma ni envía: antes de cualquier envío pide confirmación explícita, y "enviar" solo escribe `out/<caso>/ENVIO-SIMULADO.md`.

**Link de prueba:** https://registro-proveedor-cvqp.onrender.com/ (acceso público, sin clave). Plan gratuito de Render: si estuvo inactivo, la primera visita tarda cerca de un minuto en despertar.

## Levantar en local (un comando)

Requiere Node 22.13+ y pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile && pnpm run dev
```

Abre `http://localhost:3000` y pulsa **Conversar con el agente**. Alternativa con Docker: `docker compose up --build` (crea antes `.env` a partir de `.env.example`).

Con una clave de Claude (`LLM_API_KEY`), Claude conduce cada turno con tool calling: decide qué herramientas llamar y redacta el resumen. No hace falta una clave para probarlo: sin clave, el agente entiende órdenes en lenguaje natural por palabras clave y todas las herramientas funcionan.

## Variables de entorno

Todas son opcionales y están en [.env.example](.env.example), sin valores secretos.

| Variable | Uso |
|---|---|
| `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL` | Clave de Anthropic y modelo (Claude `claude-opus-5-5` por defecto; `LLM_PROVIDER=openai` sigue disponible). La clave solo vive en el backend; se oculta en logs y respuestas. Ver [Clave de Claude](#clave-de-claude). |
| `AGENT_MAX_ITERATIONS`, `LLM_MAX_SESSION_TOKENS`, `LLM_MAX_DAILY_TOKENS`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_TIMEOUT_MS` | Tope de iteraciones por turno (25), presupuesto de tokens por sesión y por día, y timeout al proveedor. |
| `FECHA_EVALUACION` | Fecha `YYYY-MM-DD` (no futura) con la que se evalúan las vigencias de los soportes. Vacía: fecha UTC actual. Ver [Guion de la demo](#guion-de-la-demo). |
| `PORT`, `HOST`, `PUBLIC_ORIGIN`, `CHAT_RATE_LIMIT` | Puerto, interfaz (`0.0.0.0` en contenedores), origen HTTPS exacto al publicar y límite de POST por minuto e IP. |

## Clave de Claude

1. Copia `.env.example` a `.env` y pega tu clave de https://console.anthropic.com/settings/keys en `LLM_API_KEY=`.
2. Reinicia con `pnpm run dev`. `GET /api/health` debe mostrar `"configured":true` y `"mode":"llm-tools"`.

Con la clave, Claude (`claude-opus-5-5`, SDK oficial `@anthropic-ai/sdk`) recibe las cinco herramientas y decide qué llamar en cada turno.
- El servidor completa `campos` y `mapeo` con los resultados de la sesión y le envía al modelo resultados resumidos, sin valores del maestro.
- Armar el paquete y simular el envío solo se ejecutan con la confirmación del turno siguiente.
- Si el proveedor falla (timeout, clave rechazada, límite de solicitudes), el chat lo explica en lenguaje claro y continúa con palabras clave.

Detalle en [SOLUCION.md](SOLUCION.md) §3 y §4.

## Guion de la demo

En el chat, sesión nueva (PRD §11):

1. `Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.`
   → Se ven las llamadas a `proveedor_leer_solicitud`, `proveedor_mapear_campos` y `proveedor_generar_formulario`. Luego llega un resumen con la ruta `out/ec-corp-andina/formulario.pdf`, los campos llenos y faltantes, los que requieren confirmación, `listo_para_firma` y los soportes a actualizar. El turno termina con una pregunta resaltada.
2. `envía` → el agente pide confirmar el armado del paquete. Tras «sí», lo arma. Si está listo para firma, pide una segunda confirmación y solo entonces escribe `ENVIO-SIMULADO.md`. Si tiene soportes vencidos o ausentes, no propone el envío e indica qué actualizar (RN3).

Con los fixtures, la cámara de comercio vence el 2026-09-30, así que después de esa fecha ningún caso queda listo para firma. Para mostrar el envío simulado, arranca con `FECHA_EVALUACION=2026-08-25`; la fecha activa se muestra en la cabecera del chat y en `/api/health`. Con esa fecha, `co-industrias-delta` llega hasta `ENVIO-SIMULADO.md`. `ec-corp-andina` sigue bloqueado porque le falta `certificado_cumplimiento_tributario`, que no existe en el repositorio de soportes.

Otras órdenes que entiende sin LLM: `leer`, `mapear`, `formulario`, `paquete`, `simular`, `resumen`, `ayuda`. Al mencionar otro caso en el mensaje, el agente cambia a ese caso.

El botón **☾ Modo oscuro / ☀ Modo claro** de la cabecera cambia el tema; por defecto sigue la preferencia del sistema y recuerda la elección.

La pantalla principal ofrece además un **flujo documental** guiado por botones (solicitud → preparar documentos → autorizar paquete → descargas), sobre las mismas herramientas.

## `demo.ts` (herramientas sin modelo)

```sh
pnpm exec bun run demo.ts      # o: pnpm run demo
```

Recorre todos los casos de `fixtures/reto-01/casos/`, llama directamente a las cinco herramientas (incluidas las confirmaciones) e imprime un resumen por caso. No usa ninguna clave. **Limpia `out/` al iniciar**, así que no lo ejecutes con un servidor cuyos documentos quieras conservar. `pnpm run demo:historico` evalúa cada caso a la fecha de su solicitud y lo declara en la salida.

## API

Las sesiones se crean anónimamente con `POST /api/session` y viajan en la cabecera `X-Session-Id`. Viven en memoria y caducan tras una hora de inactividad.

| Método y ruta | Entrada / respuesta |
|---|---|
| `POST /api/chat` | `{caso_id, message}` → NDJSON con eventos `thinking`, `tool_call` (nombre y argumentos), `tool_result`, `message`, `confirmation` (`pending` / `confirmed` / `cancelled`), `case_selected` y `done`. |
| `GET /api/sessions/:id` | Historial completo de la conversación. |
| `GET /api/health` | `{ ok, provider, model, configured, mode, fecha_evaluacion }`, sin exponer claves. |
| `GET /api/cases` | Casos disponibles. |
| `GET /api/artifacts/:id` | Descarga un documento generado en la misma sesión. |
| `POST /api/workflow/select` · `/prepare` · `/confirm`, `GET /api/workflow` | Flujo documental por botones (NDJSON con eventos `state`, `error`, `done`). |

## Salidas y auditoría

- `out/<caso>/formulario.xlsx` o `formulario.pdf`; para portal, `valores-portal.md`.
- `out/<caso>/paquete/`: formulario, soportes exigidos disponibles, `checklist.md` (soportes presentes / vencidos / ausentes, campos faltantes y equivalencias por revisar), `borrador-correo.md` (sin datos bancarios) y `manifiesto.json`, más el ZIP.
- `out/<caso>/ENVIO-SIMULADO.md` solo tras confirmación explícita.
- Toda llamada a herramienta queda en `out/log.jsonl` y `out/<caso>/log.jsonl` con `{ ts, sessionId, herramienta, ok, resumen }`.

Las plantillas binarias originales no fueron entregadas: Excel y PDF se reconstruyen desde `plantilla-celdas.json` y `plantilla-campos.json`. Datos y soportes son ficticios.

## Verificar

```sh
pnpm run check                                   # typecheck, módulo, pruebas y demo
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e                                # navegador: chat modal y flujo documental
pnpm run build
```

## Publicar

`render.yaml` y el `Dockerfile` dejan el servicio listo para Render:

1. En https://render.com, **New → Blueprint**, repositorio `elianatorres5772/Reto`, rama `dev`.
2. Render pide `LLM_API_KEY` (clave de Claude; opcional) y `FECHA_EVALUACION` (`2026-08-25` para la defensa).
3. Plan Free y **Apply**. Cuando esté **Live**, comprueba `<URL>/api/health` y anota la URL arriba como link de prueba.

`PUBLIC_ORIGIN` no hace falta; Render asigna `PORT`. El plan gratuito se duerme tras unos minutos sin uso y la primera visita tarda cerca de un minuto; al reiniciar se pierden sesiones y `out/`.

## Estructura

```
agent/prompt.md                     comportamiento (system prompt)
src/server.ts                       API HTTP y sesiones
src/agent/                          ciclo del agente, confirmación humana, uso del LLM
src/llm/adapter.ts, anthropic.ts    interfaz del proveedor e implementación (Claude; openai.ts como alternativa)
src/tools/proveedor.ts              herramientas (cada export → proveedor_<export>)
src/knowledge/registro-proveedor.md conocimiento del proceso
web/                                front: chat modal y flujo documental
fixtures/                           entregados por Periferia (sin modificar)
modulo/                             bonus: agente empaquetado (pnpm run module:check)
tests/                              pruebas unitarias, HTTP y E2E (pnpm run check, pnpm run test:e2e)
demo.ts, SOLUCION.md
```

Planteamiento, decisiones, cobertura y uso de IA: [SOLUCION.md](SOLUCION.md).
