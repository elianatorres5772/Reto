# Entorno cloud reutilizable

Usa el checkout existente `/workspace/reto1`; cada tarea cloud ya está aislada. No crees worktrees salvo petición explícita del usuario.

El borrador cloud guarda `install_script` para instalar con `npm ci --cache /tmp/reto1-npm-cache --no-audit --no-fund` y ejecutar `npm run typecheck`, desde `/workspace/reto1`. El lockfile conserva integridad de paquetes; `--no-audit` solo evita una llamada de auditoría durante instalación, no desactiva la verificación de los paquetes. La auditoría se ejecutó por separado.

`start_skill` registra el arranque mediante `npm run dev`, los checks health/catálogo y `npm run check`, la diferencia entre evaluación histórica y actual y la necesidad de reiniciar procesos y sesiones en nuevas tareas. El demo y el chat por comandos funcionan sin credenciales. Bun está disponible en `node_modules/.bin`; puedes usar `npm exec -- bun run demo.ts`.

El clasificador opcional requiere salida a `api.openai.com` y `LLM_API_KEY`. Se añadió ese dominio al borrador, conservando los presets, y se declaró una credencial personal opcional sin valor. Configura la clave de forma segura en ajustes del entorno o en `.env` local; no la escribas en el repositorio ni en chat.

El guardado del borrador fue confirmado. Para reutilizar el snapshot en nuevas tareas, revisa y guarda los cambios en ajustes del entorno y publica el entorno desde la interfaz del producto. Guardar instrucciones no las ejecuta, no aplica la red a la instancia actual ni demuestra una restauración en una tarea nueva. GitHub contiene código y documentación; no contiene el snapshot, las sesiones, .env, node_modules o outputs.
