# Guía práctica para ejecutar el aplicativo

Esta guía explica cómo poner en funcionamiento el chat y comprobar que trabaja correctamente. No necesitas escribir código ni tener una clave de inteligencia artificial para comenzar.

Los datos del proyecto son ficticios. El aplicativo genera borradores y simula procesos: no envía correos, no firma documentos ni registra proveedores en portales reales.

## 1. Antes de empezar

Si trabajas en el entorno cloud de este proyecto, las herramientas y el proyecto ya están instalados. Continúa en el paso 2.

Si trabajas en tu computador:

1. Instala **Node.js 24.15 o superior de la rama 24 (Node 24 LTS)** desde https://nodejs.org. Node.js permite ejecutar el aplicativo; su instalador incluye npm, que usaremos una sola vez para instalar pnpm. pnpm será la herramienta para los demás comandos.
2. Abre una terminal y ejecuta `npm install --global pnpm@11.19.0` para instalar pnpm. Es el único paso que utiliza npm. Si pide permisos de administrador y no los tienes, solicita ayuda a quien administre el equipo.
3. Descarga el proyecto desde https://github.com/elianatorres5772/reto1: pulsa **Code**, después **Download ZIP** y extrae el ZIP. También puedes usar la carpeta del proyecto si ya la tienes.
4. Abre la carpeta que contiene `package.json`, `README.md` y `src`. Si descargaste el ZIP, normalmente se llama `reto1-main`.
5. Abre una **terminal** en esa carpeta. La terminal es una ventana para escribir comandos. En Windows puedes hacer clic derecho dentro de la carpeta y seleccionar **Abrir en Terminal**. Otra opción, en cualquier sistema, es abrir esa carpeta con Visual Studio Code y elegir **Terminal → Nueva terminal**.

Copia un comando a la vez, pégalo en la terminal y pulsa **Enter**. Espera a que termine antes de ejecutar el siguiente. No copies los símbolos de los recuadros ni los mensajes de resultado.

## 2. Ubicarte en la carpeta correcta

En el entorno cloud escribe:

```bash
cd /workspace/reto1
```

En tu computador, si abriste la terminal dentro de la carpeta del proyecto, ya estás en el lugar correcto y no necesitas ese comando. La ruta `/workspace/reto1` corresponde al entorno cloud, no a tu computador.

Para comprobar que Node.js y pnpm están disponibles, ejecuta estos comandos por separado:

```bash
node --version
```

```bash
pnpm --version
```

**Qué debes ver:** un número de versión después de cada comando. Node.js debe ser versión 24.15 o superior de la rama 24 (Node 24 LTS) y pnpm debe mostrar 11.19.0. Si aparece «comando no encontrado» o «no se reconoce», instala Node.js y pnpm como indica el paso 1, y cierra y vuelve a abrir la terminal.

## 3. Instalar las herramientas del proyecto

En tu computador ejecuta:

```bash
pnpm install --frozen-lockfile
```

En el entorno cloud se utiliza el mismo comando. El proyecto guarda las descargas dentro de `node_modules/`, una carpeta permitida:

```bash
pnpm install --frozen-lockfile
```

**Qué hace:** descarga las herramientas que necesita el aplicativo, con las versiones registradas en el proyecto. Requiere acceso a Internet y puede tardar unos minutos. Ejecútalo la primera vez y después de recibir cambios en las dependencias; no hace falta hacerlo cada vez que abras el chat.

**Cómo saber que terminó:** vuelve a aparecer la línea donde puedes escribir un comando. Los avisos que empiezan por `WARN` no significan necesariamente que la instalación falló. Si aparece `ERR_PNPM`, revisa la sección de problemas frecuentes antes de continuar.

## 4. Iniciar y usar el chat

Ejecuta:

```bash
pnpm run dev
```

**Qué debes ver:** `Servidor iniciado en puerto 3000.`

Deja esta terminal abierta mientras usas el aplicativo. Es normal que el comando no termine: está manteniendo el chat en funcionamiento.

**En tu computador:** abre el navegador y escribe `http://127.0.0.1:3000` en la barra de direcciones. Usa HTTP, no HTTPS. Esta dirección funciona en el computador donde ejecutaste el comando.

**En el entorno cloud:** el servidor se ejecuta en la máquina remota. Escribir esa dirección en el navegador de tu computador no abre automáticamente el servidor cloud. Este entorno no ofrece un enlace de vista previa para localhost; puedes ejecutar las comprobaciones de los pasos siguientes desde su terminal.

Para usar el chat:

1. Selecciona una solicitud en la lista **Solicitud**.
2. Pulsa **Leer solicitud** para revisar sus datos o **Ver campos** para revisar el mapeo.
3. Pulsa **Preparar borrador**. El chat muestra las herramientas que utilizó.
4. Abre una tarjeta de herramienta pulsando su título para ver los resultados o descargar el formulario.
5. Cuando pregunte si deseas preparar el paquete, revisa lo mostrado y pulsa **Sí, confirmo**, o **No, cancelar**. La respuesta debe darse en el siguiente turno; otro mensaje cancela la autorización.
6. Si confirmaste el paquete, abre su tarjeta para descargar el ZIP.
7. Pulsa **Simular envío**. Esta acción solicita una confirmación nueva y puede bloquearse si faltan soportes o están vencidos.

También puedes escribir en el chat: `leer`, `mapear`, `formulario`, `preparar`, `paquete`, `simular`, `resumen` o `ayuda`. Estos textos se escriben **en el chat**, no en la terminal.

**Situaciones esperadas:** Ecuador tiene un soporte faltante; Honduras tiene referencias comerciales pendientes; Panamá requiere gestión manual del portal. Los soportes vencidos también bloquean la simulación. Estos bloqueos protegen el proceso y no significan que el aplicativo esté dañado.

## 5. Comprobar el funcionamiento sin usar el chat

Si dejaste el chat abierto, abre una **segunda terminal** dentro de la misma carpeta. No escribas estos comandos en la terminal donde el servidor sigue ejecutándose.

### Ejecutar la demostración de los cuatro casos

```bash
pnpm run demo
```

**Qué hace:** ejecuta directamente las cinco herramientas para cada caso, sin necesitar una clave de inteligencia artificial.

**Qué debes ver:** un resumen con `casos_ejecutados: 4`. Es normal ver bloqueos como `INCOMPLETE` y `PORTAL_MANUAL` para casos que requieren información o gestión humana.

La demostración y el chat evalúan los soportes a la fecha UTC actual. Para comparar con las fechas originales puedes ejecutar `pnpm run demo:historico`; ese modo lo anuncia y no acredita vigencia de hoy. La demostración limpia la carpeta `out/`: detén el servidor y descarga tus documentos antes de ejecutarla.

### Ejecutar las pruebas del funcionamiento interno

```bash
pnpm test
```

**Qué hace:** comprueba datos, documentos, permisos, errores y comunicación con el servidor.

**Qué debes ver:** en esta versión, 25 pruebas aprobadas (`pass 25`) y ninguna fallida (`fail 0`).

### Comprobar el código, las pruebas y la demostración juntos

```bash
pnpm run check
```

**Qué hace:** realiza las tres comprobaciones en orden. Si alguna falla, detiene las siguientes y muestra el error.

## 6. Ejecutar pruebas automáticas que usan un navegador

Estas pruebas, llamadas **E2E**, abren un navegador automáticamente y usan el chat como lo haría una persona. Comprueban confirmaciones, descargas, errores y bloqueos. No necesitas iniciar el chat del paso 4: las pruebas inician y detienen sus propios servidores.

### En tu computador: preparar el navegador una vez

En Windows o macOS:

```bash
pnpm exec playwright install chromium
```

En Linux:

```bash
pnpm exec playwright install --with-deps chromium
```

**Qué hace:** instala el navegador de las pruebas. La variante de Linux también instala componentes del sistema y puede pedir la contraseña de administrador. Necesita Internet. Si no tienes permisos, solicita ayuda a quien administre el equipo.

Después ejecuta:

```bash
pnpm run test:e2e
```

### En este entorno cloud: usar el navegador que ya está instalado

No necesitas descargarlo. Ejecuta:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e
```

Este comando es específico de Linux y de este entorno; no lo copies en una terminal de Windows.

**Qué debes ver:** `19 passed`. Significa que los 19 escenarios E2E fueron aprobados. Es normal no ver una ventana de navegador: las pruebas lo utilizan en segundo plano.

Las pruebas trabajan con copias temporales de los datos. No cambian las solicitudes originales y no realizan envíos reales.

### Ver el informe de las pruebas

En tu computador ejecuta:

```bash
pnpm run test:e2e:report
```

Abre el informe en el navegador o usa la dirección que indique la terminal. Permite revisar qué se probó y los detalles de los fallos. Para cerrar el visor, pulsa **Ctrl + C** en esa terminal.

El archivo del informe también queda en `playwright-report/index.html`. En cloud, el comando no crea una vista previa pública; los resultados resumidos pueden consultarse en la terminal.

## 7. Ejecutar todas las comprobaciones con un solo comando

Después de completar la instalación y preparar el navegador de pruebas, ejecuta:

**En tu computador:**

```bash
pnpm run check:all
```

**En este entorno cloud:**

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run check:all
```

Comprueba el código TypeScript, las 25 pruebas internas, la demostración y los 19 escenarios E2E. No requiere clave de inteligencia artificial. Si un paso falla, los siguientes no se ejecutan.

## 8. Detener y volver a iniciar el aplicativo

Para detener el chat, vuelve a la terminal donde ejecutaste `pnpm run dev` y pulsa **Ctrl + C**. No escribas esas palabras como un comando: mantén presionada la tecla Ctrl y pulsa C.

Para volver a iniciarlo, desde la carpeta del proyecto ejecuta otra vez:

```bash
pnpm run dev
```

Al reiniciar el servidor o recargar la página se inicia una sesión nueva. Descarga los documentos que quieras conservar antes de cerrar tu sesión. Los archivos generados se guardan en `out/`; no se suben a GitHub.

## 9. Problemas frecuentes

| Mensaje o situación | Qué hacer |
|---|---|
| No se reconoce `node` o `pnpm` | Instala Node.js y pnpm según el paso 1 y vuelve a abrir la terminal. |
| No encuentra `package.json` | Abre la terminal dentro de la carpeta del proyecto, no dentro de `src` ni en la carpeta del ZIP sin extraer. |
| PowerShell bloquea `pnpm.ps1` | En Windows, prueba `pnpm.cmd` en lugar de `pnpm`. Por ejemplo: `pnpm.cmd run dev`. Para la instalación inicial de pnpm puedes usar `npm.cmd install --global pnpm@11.19.0`. |
| Falló una descarga o aparece `Domain forbidden` | Revisa la conexión o la política de red. Para E2E en este cloud utiliza el Chromium ya instalado, como indica el paso 6. |
| «Executable doesn't exist» al probar el navegador | Instala Chromium con el comando del paso 6 o usa la variante cloud si estás en este entorno. |
| El puerto 3000 está ocupado o aparece `EADDRINUSE` | Puede que el chat ya esté abierto. Usa esa instancia o detén tu ejecución anterior con Ctrl + C antes de iniciar otra. No cierres procesos que no reconozcas. |
| Las E2E indican que 3101 o 3102 están ocupados | Detén una ejecución anterior de las pruebas y vuelve a intentarlo. Estos puertos son exclusivos de la suite. |
| La simulación informa datos o soportes pendientes | Revisa los resultados de las herramientas. No es un fallo técnico; la aplicación exige información completa y vigente. |
| Ya no puedes descargar un documento después de recargar | La sesión cambió. Vuelve a preparar el borrador y confirma nuevamente. |
| Aparecen pruebas fallidas | Consulta el informe y comparte el nombre de la prueba y el mensaje de error con la persona responsable del proyecto. No compartas claves ni archivos `.env`. |

## 10. Inteligencia artificial opcional

Para usar el proyecto y ejecutar todas las pruebas **no hace falta configurar una clave**. Los botones y los comandos del chat funcionan sin ella.

Si quieres que el chat reconozca solicitudes escritas con otras palabras, pide a la persona responsable que configure `LLM_API_KEY` en el archivo local `.env` o en los ajustes seguros del entorno cloud. Este archivo no se sube a GitHub. Nunca escribas la clave en el chat, en esta guía ni en archivos del proyecto que se publiquen.

## Resumen para el uso habitual

| Lo que quieres hacer | Comando desde la carpeta del proyecto |
|---|---|
| Iniciar el chat | `pnpm run dev` |
| Detener el chat | Ctrl + C en su terminal |
| Ejecutar la demostración | `pnpm run demo` |
| Ejecutar pruebas internas | `pnpm test` |
| Comprobar código, pruebas y demo | `pnpm run check` |
| Ejecutar pruebas con navegador en tu computador | `pnpm run test:e2e` |
| Ejecutar pruebas con navegador en este cloud | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e` |
| Ejecutar todas las comprobaciones en tu computador | `pnpm run check:all` |
| Ejecutar todas las comprobaciones en este cloud | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run check:all` |
| Ver el informe E2E en tu computador | `pnpm run test:e2e:report` |

Para el primer uso, sigue los pasos en orden. En usos posteriores, normalmente basta con abrir la carpeta, ejecutar `pnpm run dev` y abrir el chat.

Para activar preguntas con inteligencia artificial y saber dónde pegar la clave, sigue [README_LLM.md](README_LLM.md). La clave va en `.env`, no en este documento ni en el chat.


## Documentos y explicación del código

Para conocer todo el código y los cambios desde el primer push, abre [EXPLICACION_CODIGO.md](EXPLICACION_CODIGO.md). Para publicar y obtener un link real, consulta [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md). La configuración de Render no significa que ya exista un sitio público.

Los documentos quedan en `out/<caso>/`. Ahí puedes encontrar el formulario, la carpeta `paquete`, su checklist y borrador de correo. Solo una simulación autorizada y sin soportes bloqueantes crea `ENVIO-SIMULADO.md`. El archivo `valores-portal.md` sirve para copiar los valores manualmente en Panamá.

En Honduras, las referencias comerciales faltantes se muestran para revisión, pero no bloquean por sí solas «listo para firma». Los soportes vencidos o ausentes sí lo bloquean. Después de confirmar el paquete, el chat pregunta por la simulación; otro «sí» en el turno inmediato siguiente autoriza esa nueva acción.

## Pruebas nuevas con Cucumber, Serenity/JS y MCP

En una instalación nueva, descarga los navegadores una vez:

```powershell
pnpm run test:browsers
```

Después ejecuta estos comandos por separado:

```powershell
pnpm run test:bdd
pnpm run test:mcp
```

El primero comprueba 11 escenarios de negocio con el patrón Screenplay; el segundo controla un navegador mediante MCP y comprueba los permisos del flujo. Inician y detienen sus propios servidores: no necesitas arrancar el aplicativo ni configurar una clave LLM. En el segundo, debes ver «MCP aprobado»; en el primero, «11 scenarios (11 passed)».

Para ver el reporte Cucumber:

```powershell
Start-Process .\reports\bdd\cucumber.html
```

La guía [tests/bdd/README.md](tests/bdd/README.md) explica las pruebas, las etiquetas, el reporte adicional de Serenity con Java y la conexión MCP desde un editor.
