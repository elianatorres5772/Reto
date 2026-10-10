# Entorno cloud reproducible

Usa el checkout existente `/workspace/reto1`; cada tarea está aislada. No se necesitan worktrees.

El borrador cloud actualizado guarda `install_script` con `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run module:check` y `pnpm run build`. Todos se ejecutaron en esta máquina. Node debe ser 22.22.2+ de la rama 22 o 24.15+ de la rama 24; pnpm está fijado en 11.19.0. La caché/estado y store quedan dentro de node_modules, con integridad del lockfile.

`start_skill` registra arranque con `pnpm run dev`, verificaciones de health/catálogo y el flujo de pruebas, build, módulo y Bun. Advierte que el demo limpia `out/` y debe ejecutarse antes de arrancar un servidor cuyos documentos se quieran conservar. La fecha predeterminada es UTC actual; el histórico es explícito. Las E2E utilizan Chromium instalado y servidores propios aislados.

La clave opcional `LLM_API_KEY` ya está declarada para `api.openai.com`; no se duplicó la declaración ni se introdujo un valor. No había una vinculación guardada ni una clave en el proceso. Los comandos funcionan sin ella; las preguntas naturales requieren una clave de API propia y conexión real. La presencia de `configured:true` no prueba autenticación.

Guardar el borrador no ejecuta instrucciones, no aplica cambios de red ni publica un snapshot. El usuario puede revisar/publicar desde ajustes del entorno. Las sesiones y procesos no sobreviven a nuevas máquinas; deben reiniciarse. `.env`, node_modules, documentos y sesiones no van al repositorio.

El contenedor Docker se compiló usando los secretos temporales de proxy/CA del entorno y resolución de host del proxy para el constructor. No se copian secretos al repo/imagen ni se deshabilitan verificaciones. Esta configuración específica de red no se guarda como dato del aplicativo. El deploy público y la clave real se activan en la cuenta del proveedor según `DESPLIEGUE.md`.
