# Pruebas BDD con Cucumber, Serenity/JS, Playwright y Screenplay

Esta suite añade 11 escenarios de negocio en español a las 19 pruebas Playwright existentes. Ejecuta el navegador y el backend reales. Las preguntas al LLM usan un proveedor simulado: no necesitan clave ni generan cargos.

## Ejecutar paso a paso en Windows

Abre la carpeta del proyecto en Visual Studio Code y elige **Terminal → Nueva terminal**. Necesitas Node **22.22.2 o superior de la rama 22**, o **24.15 o superior de la rama 24**; se recomienda Node 24 LTS. Serenity/JS exige estas versiones. pnpm sigue siendo 11.19.0.

Ejecuta un comando a la vez:

```powershell
pnpm install --frozen-lockfile
pnpm run test:browsers
pnpm run test:bdd
```

El primer comando instala las dependencias. El segundo descarga los navegadores compatibles con Serenity/JS y MCP; se necesita una vez por instalación o cuando cambien sus versiones. El tercero inicia automáticamente servidores temporales, ejecuta los escenarios y los detiene. No necesitas ejecutar `pnpm run dev` ni crear `.env`.

**Resultado esperado:** `11 scenarios (11 passed)` y `61 steps (61 passed)`. Si una prueba falla, el comando termina con error y no se declara aprobada. Tampoco se acepta una ejecución con cero escenarios o sin evidencia Serenity.

Para probar solamente las confirmaciones:

```powershell
pnpm run test:bdd:confirmaciones
```

Para elegir otra etiqueta:

```powershell
pnpm run test:bdd --tags @soportes
```

Las etiquetas disponibles incluyen `@confirmacion`, `@descarga`, `@datos`, `@soportes`, `@portal`, `@errores`, `@llm` y `@seguridad`.

## Ver los resultados

Después de cada ejecución, abre `reports/bdd/cucumber.html` en el navegador. En Windows puedes hacerlo desde la terminal:

```powershell
Start-Process .\reports\bdd\cucumber.html
```

Este reporte HTML de Cucumber funciona sin Java. El resumen está en `reports/bdd/summary.txt`, los resultados Cucumber en `cucumber.json` y la evidencia detallada Serenity/JS en `reports/bdd/serenity/`. Serenity toma capturas cuando falla una interacción de navegador. Los datos de estas pruebas son ficticios; los reportes pueden contener valores de los fixtures y no se suben a Git.

Para crear además el reporte HTML de Serenity BDD, instala **Java 21** y comprueba `java -version`. Después ejecuta:

```powershell
pnpm exec serenity-bdd update
pnpm run report:bdd
Start-Process .\reports\bdd\html\index.html
```

`update` prepara el generador de reportes; `report:bdd` convierte los JSON de Serenity en documentación navegable con las tareas del actor. Java solo es necesario para este reporte adicional. No desactives TLS si falla una descarga: revisa tu conexión o certificados.

## Cómo se aplica Screenplay

| Elemento | Implementación |
|---|---|
| Actor | `Analista de proveedores`, nuevo en cada escenario. |
| Ability | `BrowseTheWebWithPlaywright`: contexto de navegador independiente. |
| Tasks | `AbrirElChat`, `SeleccionarSolicitud`, `EnviarMensaje`. |
| Interactions | Introducir texto, seleccionar, enviar, esperar el final del turno y descargar. |
| Questions | `ResultadoDe`, `VecesEjecutada`, `ConfirmacionVisible`. |
| Assertions | `Ensure` de Serenity y validaciones de integridad, contenido y contratos. |
| UI | `screenplay/ui.ts` centraliza los selectores. |
| Steps | `steps/registro.steps.ts` traduce Gherkin a tareas y comprobaciones. |

Los resultados visibles de herramientas se validan con los mismos contratos Zod del backend. Las tareas no implementan las reglas de negocio del agente; ejercitan el aplicativo. Las interacciones específicas de streaming y descargas usan la página nativa de Playwright dentro de Screenplay y quedan registradas como actividades del actor.

El formatter y los componentes Serenity usan las entradas CommonJS `/lib/index.js` para ser compatibles con el reporter Serenity BDD, que en esta versión se distribuye en CommonJS. El proyecto y las pruebas siguen escritos en TypeScript y el runner carga los archivos con `tsx`. El formatter es el único que escribe en stdout; el resumen Cucumber va a un archivo para evitar que sustituya al adapter y se pierda la evidencia.

## Qué valida cada escenario

1. Preparación, dos confirmaciones separadas, ZIP con SHA-256 y documentos de revisión, simulación sin correo real.
2. Rechazo de confirmación.
3. Turno intermedio que invalida el permiso.
4. Un «sí» citado que no autoriza.
5. Soporte ausente que bloquea simulación y permite continuar la sesión.
6. Evaluación de soportes originales con fecha UTC actual.
7. Campo faltante que permanece nulo y no bloquea por sí solo la firma.
8. Portal con instrucciones manuales y sin empaquetado automático.
9. Plantilla corrupta con error controlado y recuperación del chat.
10. Consulta natural que responde con datos respaldados por herramientas.
11. Referencia de evidencia inventada por el modelo que el servidor rechaza.

Los servidores usan puertos **3151, 3152 y 3153**, distintos de los E2E originales. Rechazan puertos ocupados y nunca reutilizan un servidor de desarrollo con claves reales. Se impide tráfico externo desde el navegador y se comprueba que no haya errores JavaScript. Cada servidor trabaja sobre copias temporales de fixtures; solo las copias preparadas tienen vigencias futuras para probar el camino exitoso. Los archivos versionados y los documentos de tu servidor de desarrollo se conservan.

## MCP de Playwright

MCP permite que una herramienta compatible controle el navegador mediante un protocolo. Cucumber ejecuta la suite con Serenity/JS y su driver Playwright; **no necesita un LLM ni usa MCP como runner de Gherkin**. Hay una comprobación adicional que sí inicia un servidor MCP y usa sus herramientas por stdio:

```powershell
pnpm run test:mcp
```

Comprueba navegación, preparación, permiso antes del paquete, segundo permiso antes de simular y `envio_real:false`. La evidencia queda en `reports/mcp/evidence.json`. El cliente TypeScript utiliza `@modelcontextprotocol/sdk`; el servidor es `@playwright/mcp`. No se simula el protocolo ni el navegador.

El smoke usa `browser_navigate`, `browser_run_code_unsafe` y `browser_snapshot`. El código ejecutado es fijo y está versionado en `scripts/mcp-smoke.ts`; nunca proviene de un mensaje del chat. El servidor MCP tiene capacidad de ejecutar código: úsalo desde una herramienta de desarrollo de confianza, con datos de prueba y transporte local. El launcher no transmite las variables de la clave LLM al servidor MCP.

La configuración `.mcp.json` está preparada para clientes que acepten `mcpServers`. Abre la raíz del repositorio en tu cliente, agrega o importa esa configuración y conecta el servidor `playwright`. Para clientes con otro formato, usa estos mismos valores en sus ajustes MCP:

```json
{
  "command": "pnpm",
  "args": ["run", "--silent", "mcp:playwright"]
}
```

El directorio de trabajo debe ser la raíz de `reto1` y el cliente debe poder encontrar pnpm en su PATH. En Windows, si el cliente no puede iniciar `pnpm`, usa `pnpm.cmd` como comando. Reinicia el cliente después de guardar la configuración si lo requiere. No hay un MCP de navegador conectado directamente a este chat; la comprobación se realiza con el cliente local incluido y no supone que la configuración se haya instalado automáticamente en tu editor.

`--silent` evita que los mensajes de pnpm se mezclen con el protocolo JSON-RPC por stdio.

## Linux, cloud y CI

Para descargar los navegadores y sus dependencias de sistema en Linux:

```sh
pnpm run test:browsers --with-deps
```

Si el entorno cloud ya tiene Chromium y no necesitas descargarlo:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:bdd
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium PLAYWRIGHT_MCP_NO_SANDBOX=1 pnpm run test:mcp
```

`PLAYWRIGHT_MCP_NO_SANDBOX=1` se usa únicamente en contenedores de pruebas aislados cuyo sandbox de Chromium no esté disponible. No lo configures por defecto en tu computador ni para navegar con datos reales.

`test:browsers` instala las revisiones separadas del navegador de `playwright-core` 1.63 (compatible con Serenity/JS) y de la dependencia de Playwright que fija el paquete MCP. No fuerza una versión incompatible mediante overrides. Las 19 pruebas originales siguen usando `@playwright/test` y su instalación `pnpm exec playwright install --with-deps chromium`.

GitHub Actions ejecuta BDD, la comprobación MCP y el generador HTML Serenity en un job adicional y guarda `reports/` como artefacto. `pnpm run check:all` incluye las comprobaciones previas, los E2E originales, BDD y MCP; instala primero los navegadores de ambas suites. El demo incluido en `check` limpia `out/`: detén el servidor de desarrollo y conserva tus descargas antes de usarlo.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| Versión de Node incompatible | Actualiza a Node 24 LTS, cierra y vuelve a abrir Visual Studio Code. |
| Executable doesn't exist | Ejecuta `pnpm run test:browsers`; para E2E originales instala también su navegador. |
| Puerto de pruebas ocupado | Cierra una ejecución anterior que use 3151–3153 y repite. No cierres procesos que no reconozcas. |
| Java no disponible | Usa el HTML Cucumber o instala Java 21 para `report:bdd`. |
| Un escenario falla | Revisa HTML, resumen y captura; un fallo no se convierte en éxito reintentándolo sin corregir su causa. |

Estas pruebas no acreditan por sí solas una conexión a OpenAI real ni la disponibilidad de la URL pública. Esas comprobaciones siguen el procedimiento de [PASOS_PENDIENTES_DEL_RETO.md](../../PASOS_PENDIENTES_DEL_RETO.md).
