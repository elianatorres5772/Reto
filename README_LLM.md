# Clave LLM: Claude (Anthropic)

El chat del agente (ventana modal) usa la API `/api/chat`. Con `LLM_API_KEY`, Claude clasifica la intención de cada mensaje y elige la evidencia para responder consultas. Sin clave, se usan palabras clave y todo lo demás funciona igual. El flujo documental por botones nunca llama al modelo.

## Configurar

1. Crea `.env` junto a `package.json`, solo si no existe:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

2. Abre `.env` y pega tu clave de Anthropic después de `LLM_API_KEY=`. La clave se obtiene en https://console.anthropic.com/settings/keys. La API de Claude se factura aparte de una suscripción a Claude.ai. Deja `LLM_PROVIDER=anthropic` y `LLM_MODEL=claude-opus-5-5`.
3. Guarda y reinicia el servidor con `pnpm run dev`.
4. Abre el chat y escribe una consulta libre, por ejemplo: `¿Qué soportes le faltan a este caso?`. Si la clave funciona, la respuesta cita la evidencia de las herramientas. Si falla, el chat muestra el motivo (clave rechazada, límite de solicitudes, timeout) y la sesión sigue disponible.

`GET /api/health` informa el proveedor, el modelo y si hay clave cargada, no si la clave es válida. No compartas la clave ni subas `.env` al repositorio (`.gitignore` lo excluye). Para publicar, define `LLM_API_KEY` como variable secreta del servicio de hosting.

## Cómo se usa el modelo

[src/llm/anthropic.ts](src/llm/anthropic.ts) implementa `LlmAdapter.enviar(mensajes, herramientas, opciones)` con el SDK oficial `@anthropic-ai/sdk`:

- **Salida JSON con esquema:** se usa `output_config.format` con `type: "json_schema"`. La respuesta siempre cumple el esquema de intención o de selección de evidencia, y además se vuelve a validar con zod.
- **Esfuerzo bajo** (`output_config.effort: "low"`): clasificar y elegir evidencia es una tarea corta. Claude Opus 5.5 siempre razona, y ese razonamiento cuenta dentro de `LLM_MAX_OUTPUT_TOKENS` (4000 por defecto).
- **Herramientas descritas, no ejecutadas por el modelo:** se envían las cinco herramientas con `tool_choice: "none"`. El modelo conoce sus contratos, pero la aplicación decide qué se ejecuta, y la puerta de confirmación sigue en el servidor.
- **Respaldo ante rechazos:** si un clasificador de seguridad declina la solicitud, la API la reintenta en otro modelo (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- **Errores claros:** timeout, clave rechazada y límite de solicitudes se convierten en mensajes en español, sin la clave ni trazas.

## Límites

| Variable | Defecto | Uso |
|---|---|---|
| `AGENT_MAX_ITERATIONS` | 25 | Llamadas a herramientas y al modelo por turno. |
| `LLM_MAX_OUTPUT_TOKENS` | 4000 | `max_tokens` por llamada, incluido el razonamiento. |
| `LLM_MAX_SESSION_TOKENS` | 100000 | Presupuesto reservado por sesión. |
| `LLM_MAX_DAILY_TOKENS` | 1000000 | Presupuesto del proceso por día UTC. |
| `LLM_TIMEOUT_MS` | 30000 | Timeout por llamada. |

Para usar OpenAI en lugar de Claude, define `LLM_PROVIDER=openai` y `LLM_MODEL=gpt-4.1-mini`; el adaptador de OpenAI sigue disponible con el mismo contrato.
