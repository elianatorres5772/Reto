# Clave LLM: configuración opcional del componente conservado

**La pantalla de preparación documental no utiliza el LLM y funciona sin clave.** Identifica los campos de los mapas JSON, consulta el maestro, genera formularios y reúne soportes mediante herramientas deterministas.

Se conserva el adaptador OpenAI y la API `/api/chat` del desarrollo anterior para compatibilidad técnica con el PRD original, pruebas internas e integraciones. No existe un campo de preguntas ni un chatbot en la interfaz actual. Configurar una clave no activa ese campo ni cambia el flujo documental.

Si una integración técnica necesita usar ese componente:

1. Crea `.env` junto a `package.json`, solo si no existe:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

2. Abre `.env` en Visual Studio Code y coloca tu clave después de `LLM_API_KEY=`. Mantén `LLM_PROVIDER=openai` y `LLM_MODEL=gpt-4.1-mini`, o un modelo compatible al que tengas acceso.
3. Guarda y reinicia el servidor con `pnpm run dev`.

Obtén la clave en https://platform.openai.com/api-keys. La plataforma API requiere saldo o facturación independiente de una suscripción de ChatGPT. No compartas claves ni subas `.env` al repositorio.

`GET /api/health` informa si hay clave cargada, no si la conexión autenticada funciona. Para comprobar el componente opcional, crea una sesión y usa `/api/chat` con `X-Session-Id` y JSON `{caso_id,message}` mediante un cliente de API; no se necesita esta comprobación para preparar documentos desde la pantalla.

Los límites `LLM_MAX_SESSION_TOKENS`, `LLM_MAX_DAILY_TOKENS`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_TIMEOUT_MS` y `AGENT_MAX_ITERATIONS` se mantienen para ese componente. Las claves se leen solo en backend; no se incorporan a frontend, archivos de salida o auditoría. La entrega documental no consume tokens.
