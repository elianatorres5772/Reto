# Clave LLM: Claude (Anthropic)

El chat del agente (ventana modal) usa la API `/api/chat`. Con `LLM_API_KEY`, **Claude conduce cada turno con tool calling**: decide qué herramientas llamar, ve sus resultados y redacta el resumen. Sin clave, se usan palabras clave y todo lo demás funciona igual. El flujo documental por botones nunca llama al modelo.

## Configurar

1. Crea `.env` junto a `package.json`, solo si no existe:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

2. Abre `.env` y pega tu clave de Anthropic después de `LLM_API_KEY=`. La clave se obtiene en https://console.anthropic.com/settings/keys. La API de Claude se factura aparte de una suscripción a Claude.ai. Deja `LLM_PROVIDER=anthropic` y `LLM_MODEL=claude-opus-5-5`.
3. Guarda y reinicia el servidor con `pnpm run dev`.
4. Abre el chat y escribe una consulta libre, por ejemplo: `¿Qué soportes le faltan a este caso?`. Si la clave funciona, verás las tarjetas de las herramientas que Claude decidió llamar y luego su resumen. Si falla, el chat muestra el motivo (clave rechazada, límite de solicitudes, timeout) y la sesión sigue disponible.

`GET /api/health` informa el proveedor, el modelo y si hay clave cargada, no si la clave es válida. No compartas la clave ni subas `.env` al repositorio (`.gitignore` lo excluye). Para publicar, define `LLM_API_KEY` como variable secreta del servicio de hosting.

## Cómo se usa el modelo

[src/llm/anthropic.ts](src/llm/anthropic.ts) implementa `LlmAdapter.conversar` (ciclo con herramientas) y `LlmAdapter.enviar` (modo de intención) con el SDK oficial `@anthropic-ai/sdk`:

- **Ciclo con herramientas** (`conversar`): Claude recibe las cinco herramientas con `tool_choice: auto` y esfuerzo `medium`, y la conversación se reenvía sin cambios (append-only), incluido su razonamiento. El prefijo repetido se cachea con `cache_control`. Detalle en [SOLUCION.md](SOLUCION.md) §3.
- **Salida JSON con esquema** (modo de intención, `enviar`): se usa `output_config.format` con `type: "json_schema"`. La respuesta siempre cumple el esquema de intención o de selección de evidencia, y además se vuelve a validar con zod.
- **Esfuerzo bajo** (`output_config.effort: "low"`): clasificar y elegir evidencia es una tarea corta. Claude Opus 5.5 siempre razona, y ese razonamiento cuenta dentro de `LLM_MAX_OUTPUT_TOKENS` (4000 por defecto).
- **Acciones con efecto:** cuando Claude pide armar el paquete o simular el envío, el servidor pregunta a la usuaria y termina el turno. Solo ejecuta la acción si ella confirma en su siguiente mensaje.
- **Respaldo ante rechazos:** si un clasificador de seguridad declina la solicitud, la API la reintenta en otro modelo (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- **Errores claros:** timeout, clave rechazada y límite de solicitudes se convierten en mensajes en español, sin la clave ni trazas.

## Límites

| Variable | Defecto | Uso |
|---|---|---|
| `AGENT_MAX_ITERATIONS` | 25 | Llamadas a herramientas y al modelo por turno. |
| `LLM_MAX_OUTPUT_TOKENS` | 4000 | `max_tokens` por llamada, incluido el razonamiento. |
| `LLM_MAX_SESSION_TOKENS` | 500000 | Presupuesto reservado por sesión. |
| `LLM_MAX_DAILY_TOKENS` | 5000000 | Presupuesto del proceso por día UTC. |
| `LLM_TIMEOUT_MS` | 30000 | Timeout por llamada. |

Para usar OpenAI en lugar de Claude, define `LLM_PROVIDER=openai` y `LLM_MODEL=gpt-4.1-mini`. Ese adaptador no implementa el ciclo con herramientas, así que usa el modo de intención.
