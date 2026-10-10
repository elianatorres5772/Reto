# Validación ejecutada

| Verificación | Resultado observado |
|---|---|
| Instalación reproducible | npm ci con package-lock y caché en /tmp completado |
| TypeScript estricto | npm run typecheck: sin errores |
| Suite automatizada | 17 pruebas pasadas; 0 fallidas, canceladas u omitidas |
| Demo Node | 4 casos; cinco herramientas ejecutadas por caso; bloqueos esperados verificados |
| Demo Bun | bun run demo.ts completado sin clave LLM |
| HTTP funcional | Inicio de servidor, preparación, confirmación, ZIP, descarga aislada, entrada inválida y origen externo verificados |
| Servidor actual | npm run dev iniciado; health ok y catálogo con cuatro casos |
| Auditoría npm | 0 vulnerabilidades después del override de uuid |
| Adjuntos originales | 21 archivos comparados byte a byte con las descargas: iguales |
| Frontend | JavaScript validado sintácticamente; markup servido por HTTP y flujo del backend verificado |

La suite HTTP inicia y detiene su propio servidor. Los errores esperados (INCOMPLETE y PORTAL_MANUAL) son comportamientos verificados, no pruebas fallidas ni omitidas.

No se ejecutó una prueba visual en navegador ni una llamada real autenticada a OpenAI. El adaptador LLM se verificó con respuestas controladas. La consulta de conectividad a api.openai.com recibió rechazo del proxy antes del cambio de configuración; el dominio y una credencial personal opcional se añadieron al borrador cloud. Guardar ese borrador no modifica ni publica por sí solo la instancia actual. El modo sin LLM está validado y funciona.

La evaluación histórica del demo permite verificar el caso CO con soportes vigentes a la fecha de solicitud. La UI usa fecha actual UTC; los soportes expirados bloquean simulación. No se validó firma, envío real ni registro en un portal porque estas operaciones no forman parte del aplicativo de demostración.
