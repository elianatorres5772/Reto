# Pruebas E2E de navegador

Playwright controla Chromium headless y usa la aplicación HTTP real. Los escenarios normales no simulan respuestas de herramientas, ni requieren LLM, ni acceden a portales. Cada test tiene un contexto de navegador y una sesión nuevos. La suite rechaza errores JavaScript y llamadas externas inesperadas.

## Ejecutar

```sh
npm ci --cache /tmp/reto1-npm-cache
npx playwright install --with-deps chromium
npm run test:e2e
```

Si el entorno ya tiene Chromium y las descargas están restringidas:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

`npm run check:all` ejecuta las verificaciones existentes y las E2E. La variable de navegador también aplica a ese comando. `npm run test:e2e:ui` abre el runner interactivo cuando hay un entorno gráfico; `npm run test:e2e:report` abre el reporte HTML. Los fallos conservan trazas y screenshots. Los reportes, descargas y resultados no se versionan. CI instala el Chromium compatible con la versión de Playwright fijada en el lockfile y publica los reportes por siete días.

## Aislamiento y datos de prueba

Playwright inicia dos servidores exclusivos en puertos 3101 y 3102; falla si ya están ocupados, sin reutilizar procesos ajenos. `server.ts` copia los fixtures a directorios temporales y arranca el mismo entrypoint de producción desde ellos. Los documentos generados también quedan en esos directorios y se limpian al detener el servidor. No cambia archivos de la aplicación ni fixtures originales.

- **Original (3101):** conserva los cuatro casos y sus fechas; prueba el bloqueo por vencimiento con el reloj real.
- **Preparado (3102):** extiende únicamente las vigencias del índice a 2099-12-31 para probar éxito en CO. También añade un caso sintético con plantilla corrupta. Estas vigencias son datos de prueba; no se presentan como validaciones de soportes reales.

El flujo usa la UI para generar el borrador, responder a cada pregunta y descargar documentos. Se verifican hashes, cuenta con cero inicial dentro del XLSX, lectura del PDF y contenido del ZIP. La simulación se comprueba como local y sin envío real. No se desactiva el gate de autorización.

## Cobertura: 15 escenarios

1. CO: preparación, confirmaciones separadas, descargas XLSX/ZIP y simulación.
2. Rechazo explícito de confirmación.
3. Turno intermedio que cancela la confirmación.
4. Un «sí» citado no autoriza.
5. Cambio de caso invalida la pregunta.
6. Un permiso consumido no se reutiliza.
7. Ecuador: dato opcional desconocido, PDF y soporte faltante.
8. Honduras: referencia desconocida y bloqueo de simulación.
9. Fixtures originales: soportes vencidos y bloqueo a fecha actual.
10. Panamá: gestión manual, sin archivos ni llamadas externas.
11. Plantilla corrupta: error controlado y siguiente turno funcional.
12. Indicador de procesamiento y acciones deshabilitadas durante una petición.
13. Pérdida de conexión y recuperación de la sesión.
14. Contenido HTML del usuario se representa como texto, sin ejecutar código.
15. Aislamiento de descargas entre navegadores y rechazo sin sesión.

Las únicas intervenciones sobre la red son una pausa controlada antes de continuar una petición real para observar el indicador, y un aborto único para probar recuperación. No reemplazan el backend ni sus contratos. En los demás escenarios el tráfico completo llega al servidor real.

Los puertos 3101/3102 deben estar libres. El caso de vencimiento original presupone una fecha actual posterior a 2026-09-30; es consistente con el reto y el entorno actual. La suite cubre Chromium de escritorio; no afirma cobertura de Firefox, WebKit, dispositivos móviles o una revisión visual manual.
