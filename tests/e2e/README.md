# Pruebas E2E de preparación documental

La suite actual reemplaza los escenarios de UI conversacional anteriores por **12 escenarios de preparación documental**. Usa Playwright con TypeScript, backend real y navegador Chromium. No hay llamadas a LLM ni simulación de envío desde la pantalla.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e
```

En Windows basta `pnpm exec playwright install chromium`. Si cloud ya dispone de Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e
```

`pnpm run check:all` añade las verificaciones internas y demo. Este último limpia `out/`: conserva tus documentos y detén el servidor de desarrollo antes de ejecutarlo. Para ver el reporte usa `pnpm run test:e2e:report`; errores conservan trazas y capturas.

## Escenarios

1. Solicitud de correo → campos con fuente → XLSX correcto → permiso → ZIP con integridad y firma pendiente, sin envío (flujo documental).
2. Cancelación de paquete, formulario conservado y nueva autorización.
3. Cambio de solicitud invalida el permiso anterior.
4. Ecuador: PDF, RUC a revisar, campo y soporte ausentes, estado bloqueado.
5. Honduras: referencias desconocidas, RTN a revisar y soportes preparados vigentes.
6. Fixtures originales con soportes vencidos: borrador descargable y bloqueo para firma.
7. Panamá: valores descargables para gestión manual del portal.
8. Plantilla corrupta conserva correo, error controlado y recuperación con otro caso.
9. Progreso y bloqueo de acciones durante la preparación.
10. Interrupción de red y recuperación sin repetir automáticamente la operación.
11. Descargas, autorización y estado aislados por sesión; rechazo sin sesión.
12. Pantalla móvil sin desbordamiento horizontal y controles accesibles.

Playwright inicia dos servidores temporales en 3101 y 3102; no reutiliza procesos ajenos. El original conserva las fechas reales. El preparado extiende vigencias solo en copias temporales a 2099 y crea un caso con plantilla corrupta para probar éxito y recuperación. Las modificaciones no llegan a los fixtures versionados. Las salidas temporales se limpian al finalizar.

Cada test obtiene un contexto de navegador nuevo. El harness detecta errores JavaScript y bloquea tráfico externo. Los valores y metadatos del estado se validan con `src/contracts/workflow.ts`; XLSX/PDF se leen con bibliotecas y el ZIP se descomprime y comprueba por SHA-256. Las pausas y abortos de red solo verifican estados de espera/recuperación, sin sustituir respuestas de herramientas.

Las pruebas del adaptador LLM y del componente conversacional conservado siguen en los tests internos. La suite actual acredita Chromium de escritorio y un tamaño móvil, no cobertura completa de navegadores ni auditoría exhaustiva de accesibilidad.
