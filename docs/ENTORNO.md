# Entorno cloud reutilizable

Usa el checkout existente `/workspace/reto1`; cada tarea cloud ya está aislada. No crees worktrees salvo petición explícita del usuario.

El borrador cloud guarda `install_script` para instalar con `pnpm install --frozen-lockfile` y ejecutar `pnpm run typecheck`, desde `/workspace/reto1`. El lockfile de pnpm conserva las versiones e integridad de los paquetes. La auditoría se ejecuta por separado con `pnpm audit`. El proyecto fija pnpm 11.19.0 y requiere Node 22.13+. Las carpetas de descarga y estado quedan dentro de node_modules para funcionar en el sandbox cloud.

`start_skill` registra el arranque mediante `pnpm run dev`, los checks health/catálogo y `pnpm run check`, la diferencia entre evaluación histórica y actual y la necesidad de reiniciar procesos y sesiones en nuevas tareas. El demo y el chat por comandos funcionan sin credenciales. Bun está disponible en `node_modules/.bin`; puedes usar `pnpm exec bun run demo.ts`.

El clasificador opcional requiere salida a `api.openai.com` y `LLM_API_KEY`. Se añadió ese dominio al borrador, conservando los presets, y se declaró una credencial personal opcional sin valor. Configura la clave de forma segura en ajustes del entorno o en `.env` local; no la escribas en el repositorio ni en chat.

El guardado del borrador fue confirmado. Para reutilizar el snapshot en nuevas tareas, revisa y guarda los cambios en ajustes del entorno y publica el entorno desde la interfaz del producto. Guardar instrucciones no las ejecuta, no aplica la red a la instancia actual ni demuestra una restauración en una tarea nueva. GitHub contiene código y documentación; no contiene el snapshot, las sesiones, .env, node_modules o outputs.

Para ejecutar E2E en este entorno usa `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e`. Playwright inicia y detiene sus servidores y limpia los fixtures temporales. Para todos los checks usa esa misma variable con `pnpm run check:all`. En una máquina sin Chromium instalado, instala primero el navegador con `pnpm exec playwright install --with-deps chromium`; las descargas pueden necesitar permitir los dominios oficiales de Playwright. La configuración CI realiza ese paso.
