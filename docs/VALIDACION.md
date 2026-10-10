# Validación ejecutada

| Verificación | Resultado observado |
|---|---|
| Instalación reproducible | pnpm install --frozen-lockfile con pnpm-lock.yaml y caché dentro de node_modules completado |
| TypeScript estricto | pnpm run typecheck: sin errores |
| Suite automatizada | 17 pruebas pasadas; 0 fallidas, canceladas u omitidas |
| Demo Node | 4 casos; cinco herramientas ejecutadas por caso; bloqueos esperados verificados |
| Demo Bun | bun run demo.ts completado sin clave LLM |
| HTTP funcional | Inicio de servidor, preparación, confirmación, ZIP, descarga aislada, entrada inválida y origen externo verificados |
| Servidor actual | pnpm run dev iniciado; health ok y catálogo con cuatro casos |
| Auditoría pnpm | 0 vulnerabilidades después del override de uuid |
| Adjuntos originales | 21 archivos comparados byte a byte con las descargas: iguales |
| Frontend E2E | 15 escenarios Playwright aprobados en Chromium real headless; 0 fallidos u omitidos |

La suite HTTP inicia y detiene su propio servidor. Los errores esperados (INCOMPLETE y PORTAL_MANUAL) son comportamientos verificados, no pruebas fallidas ni omitidas.

Se ejecutaron pruebas automatizadas en Chromium real; no se realizó revisión visual manual ni una llamada real autenticada a OpenAI. El adaptador LLM se verificó con respuestas controladas. La consulta de conectividad a api.openai.com recibió rechazo del proxy antes del cambio de configuración; el dominio y una credencial personal opcional se añadieron al borrador cloud. Guardar ese borrador no modifica ni publica por sí solo la instancia actual. El modo sin LLM está validado y funciona.

La evaluación histórica del demo permite verificar el caso CO con soportes vigentes a la fecha de solicitud. La UI usa fecha actual UTC; los soportes expirados bloquean simulación. No se validó firma, envío real ni registro en un portal porque estas operaciones no forman parte del aplicativo de demostración.

Las E2E usan el backend HTTP real en copias temporales de los fixtures. Ver [tests/e2e/README.md](../tests/e2e/README.md) para datos sintéticos, puertos, cobertura y comando de ejecución. Se ejecutaron con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e` porque la descarga del browser Playwright fue rechazada por la política de red. Esto no modifica la validación ni omite escenarios: se usó Chromium instalado en el entorno. CI configura la instalación del browser Playwright; su ejecución remota no se afirma aquí.

La migración a pnpm 11.19.0 fue verificada mediante instalación con lockfile congelado, `pnpm audit` y `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run check:all`. Node.js debe ser 22.13 o superior. El lockfile de npm fue sustituido por pnpm-lock.yaml; el override de uuid y los permisos de scripts de instalación están en pnpm-workspace.yaml.
