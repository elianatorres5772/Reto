# Paso a paso para cerrar los pendientes del reto

Esta guía explica cómo conectar una clave real de OpenAI, publicar el chat y dejar evidencia de las comprobaciones pendientes. Está pensada para Windows, Visual Studio Code y PowerShell. El código ya está subido; estos pasos se realizan con tus cuentas de OpenAI y alojamiento.

**Completar la guía no equivale por sí solo a aprobar las comprobaciones:** registra el resultado real de cada prueba. Actualmente no se ha confirmado una URL pública ni una consulta autenticada al LLM. El arranque en menos de dos minutos en un entorno limpio tampoco está acreditado.

## 1. Actualizar tu copia del proyecto

Abre Visual Studio Code, elige **Archivo → Abrir carpeta** y selecciona la carpeta que contiene `package.json`. Después abre **Terminal → Nueva terminal**. Copia un comando a la vez y pulsa Enter.

```powershell
git remote -v
```

Debe aparecer `origin` apuntando a `https://github.com/elianatorres5772/reto1.git`. Si no aparece ningún remoto, agrega el enlace:

```powershell
git remote add origin https://github.com/elianatorres5772/reto1.git
```

Si `origin` existe pero tiene una dirección equivocada, corrígela:

```powershell
git remote set-url origin https://github.com/elianatorres5772/reto1.git
```

Ahora descarga los cambios:

```powershell
git pull origin main
```

El comando es **`git pull`**, no `git puli`. Si aparecen conflictos o cambios locales que impiden actualizar, conserva tus archivos y resuelve el mensaje antes de continuar; no uses comandos para borrar tus cambios.

Si aparece «not a git repository», probablemente abriste un ZIP o una carpeta diferente. Puedes trabajar con el ZIP actualizado, pero no permite `git pull`. Para tener una copia con Git, abre una terminal en una carpeta fuera del proyecto y ejecuta `git clone https://github.com/elianatorres5772/reto1.git`; después abre la nueva carpeta `reto1` en Visual Studio Code.

Comprueba las herramientas:

```powershell
node --version
pnpm --version
```

Necesitas Node 24.15 o superior de la rama 24 (Node 24 LTS) y pnpm 11.19.0. Si no están instalados, sigue [COMANDOS_PASO_A_PASO.md](COMANDOS_PASO_A_PASO.md). Instala las dependencias del proyecto:

```powershell
pnpm install --frozen-lockfile
```

**Resultado esperado:** el comando termina sin errores y puedes volver a escribir en la terminal.

## 2. Obtener y configurar una clave real del LLM

1. Entra a https://platform.openai.com/api-keys con tu cuenta.
2. Comprueba que tu proyecto de API tenga facturación o saldo disponible y acceso a `gpt-4.1-mini`. Una suscripción de ChatGPT no incluye automáticamente saldo de API.
3. Crea una clave y guárdala de forma privada. Configura también un límite de gasto en tu cuenta de API. Las preguntas reales pueden generar cargos.
4. En la terminal del proyecto, ejecuta lo siguiente. Crea `.env` solo si no existe, para conservar una configuración anterior:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

5. Abre `.env` desde el panel izquierdo de Visual Studio Code. Cambia `LLM_API_KEY=` por tu clave, después del signo igual. Comprueba estas otras líneas:

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=
```

6. Guarda con **Ctrl + S**. No pegues la clave en el chat ni la incluyas en capturas o documentos. `.env` está excluido de Git.

## 3. Comprobar una respuesta real de OpenAI

Si el aplicativo ya está ejecutándose, pulsa **Ctrl + C** en su terminal. Inícialo de nuevo para que lea la clave:

```powershell
pnpm run dev
```

1. Abre `http://localhost:3000` en el navegador.
2. Selecciona una solicitud y escribe **«¿Qué documentos exige esta solicitud?»** en el campo del chat. Usa esta pregunta en lenguaje natural: pulsar un botón de preparación no demuestra conexión al LLM.
3. Comprueba que aparece una respuesta respaldada por datos y fuentes de las herramientas y que no aparece un error de conexión.
4. Revisa en el panel de uso de tu proyecto de OpenAI que se haya registrado la solicitud, considerando que el registro puede tardar en aparecer. Haz la prueba sin otras aplicaciones usando esa misma clave para poder identificarla.
5. Registra fecha, modelo, pregunta y resultado. Puedes tomar una captura de la respuesta; evita incluir datos sensibles.

**Resultado esperado:** pregunta respondida con fuentes y actividad correspondiente en la cuenta de API. «LLM configurado» y `configured:true` solo indican presencia de una clave; no acreditan que funcione. Si aparece una respuesta de información insuficiente, prueba una pregunta sobre otro dato conocido y comprueba la actividad de API antes de dar esta verificación por completada.

Si falla, revisa la clave, el saldo, el acceso al modelo y la conexión a Internet. La guía [README_LLM.md](README_LLM.md) incluye los mensajes frecuentes. No publiques la clave para solicitar ayuda.

## 4. Publicar el chat en Render

Esta es la ruta propuesta porque el repositorio ya incluye `render.yaml` y `Dockerfile`. Revisa los precios y condiciones vigentes antes de aceptar el servicio.

1. Entra a https://render.com y crea una cuenta o inicia sesión.
2. Conecta tu cuenta de GitHub y autoriza el acceso al repositorio `elianatorres5772/reto1`.
3. Elige **New → Blueprint** (o la opción equivalente para crear desde un Blueprint).
4. Selecciona el repositorio, la rama **main** y el archivo **render.yaml**. Revisa el servicio Docker propuesto.
5. Cuando pida `LLM_API_KEY`, introduce tu clave en el campo seguro de variables de entorno de Render. No subas tu `.env`.
6. `PUBLIC_ORIGIN` es la dirección pública del servicio. Si aún no la conoces, deja ese valor vacío durante el primer despliegue; cuando Render muestre la URL, abre las variables del servicio y guárdala allí. Si el formulario exige un valor, crea primero el servicio con el valor provisional y corrígelo antes de probar el chat.
7. Espera a que el despliegue termine. Copia la dirección HTTPS real asignada por Render. Configura `PUBLIC_ORIGIN` con esa dirección exacta, **sin barra final ni rutas**, por ejemplo `https://tu-servicio.onrender.com`. El ejemplo no es una URL publicada del proyecto.
8. Guarda las variables y permite que Render reinicie o despliegue de nuevo. Mantén `HOST=0.0.0.0`, ya incluido en el Blueprint. Render administra el puerto del servicio.
9. Abre la URL asignada y comprueba que se ve el chat. Abre también esa dirección agregando `/api/health` al final: debe mostrar `ok:true` y `configured:true`.

**Resultado esperado:** una dirección HTTPS real que otra persona pueda abrir. El estado saludable del servidor todavía no prueba la conexión al LLM: realiza también el paso 5.

El servicio gratuito puede entrar en reposo y perder archivos al reiniciar. Descarga los documentos necesarios y revisa las condiciones actuales del plan. [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) explica persistencia y Docker.

## 5. Probar el aplicativo publicado

Haz estas pruebas en la **URL pública**, preferiblemente en una ventana privada del navegador:

| Acción | Qué debes comprobar |
|---|---|
| Seleccionar una solicitud y preguntar «¿Qué documentos exige esta solicitud?» | Respuesta con fuentes, herramientas visibles y actividad de API real. |
| Pulsar **Preparar borrador** en un caso Excel o PDF | Formulario descargable, resumen de campos y estado de soportes. |
| Responder **No, cancelar** a la confirmación del paquete | No se ejecuta el empaquetado. |
| Preparar de nuevo y responder **Sí, confirmo** | Se genera el paquete y aparece una segunda pregunta para simular el envío. |
| Descargar el ZIP | Se abre y contiene formulario, soportes disponibles, checklist, borrador de correo y manifiesto. |
| Confirmar la simulación en el turno siguiente | Si los soportes están completos y vigentes, genera `ENVIO-SIMULADO.md`; si no lo están, muestra un bloqueo controlado. |
| Seleccionar el caso de portal y preparar el borrador | Genera `valores-portal.md` para gestión manual. |
| Preguntar por un dato que no está en la solicitud ni en el maestro | Indica que no tiene información respaldada, sin inventar valores. |

Los fixtures incluyen soportes que vencen con el tiempo. Un bloqueo por soporte vencido o ausente es correcto; **no cambies las fechas ni los documentos originales para forzar un éxito**. Las pruebas automatizadas usan copias temporales para cubrir el camino exitoso. Ninguna simulación envía correo, firma o registra un proveedor en un portal real.

## 6. Medir el arranque en un entorno limpio

Esta comprobación requiere un computador o entorno nuevo, con las herramientas básicas instaladas pero sin las dependencias del proyecto, sin `dist/` ni instalaciones previas del aplicativo. Reutilizar el computador preparado no demuestra este requisito.

1. Descarga una copia nueva del repositorio y configura `.env` como en el paso 2. Registra el equipo, sistema operativo, conexión y versiones de Node y pnpm.
2. En la terminal de esa copia, ejecuta:

```powershell
$inicioReto = Get-Date
pnpm install --frozen-lockfile
```

3. Si la instalación falla, corrige el problema y repite la medición en otro entorno limpio; un intento incompleto no cuenta como éxito. Si termina correctamente, ejecuta:

```powershell
pnpm run dev
```

4. Deja esa terminal abierta. Abre una segunda terminal de PowerShell en Visual Studio Code y ejecuta:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

5. Al recibir `ok:true`, anota la hora. Abre el chat y verifica que carga el catálogo y puede leer una solicitud. Registra también la hora de esa comprobación funcional.
6. Detén el servidor con **Ctrl + C** en la primera terminal y calcula el tiempo total transcurrido:

```powershell
((Get-Date) - $inicioReto).TotalSeconds
```

Ese total incluye tu interacción y la comprobación funcional; es una medición conservadora de instalación más arranque. Registra por separado la hora en que respondió `/api/health` si quieres distinguir arranque y revisión manual. No excluyas la descarga de dependencias sin indicarlo. El despliegue inicial de Render y despertar un servicio en reposo son mediciones distintas.

**Resultado esperado:** evidencia reproducible de menos de 120 segundos, si ese es el criterio que se evalúa. Si tarda más, registra el resultado y deja el requisito pendiente; no lo marques aprobado solo porque el aplicativo funciona.

## 7. Registrar y entregar la evidencia

Crea una copia de esta tabla en un documento llamado `docs/EVIDENCIA_FINAL.md` y reemplaza cada «Pendiente» por el resultado observado:

| Comprobación | Fecha | Evidencia o resultado |
|---|---|---|
| URL pública accesible | Pendiente | URL real y captura del chat. |
| LLM real desde la URL pública | Pendiente | Modelo, pregunta, respuesta con fuentes y comprobación de uso de API. |
| Confirmaciones y descarga | Pendiente | Resultado de aceptar/cancelar y archivos descargados. |
| Bloqueo por soportes | Pendiente | Caso probado y motivo del bloqueo. |
| Arranque en entorno limpio | Pendiente | Equipo, versiones, tiempos y procedimiento. |

Actualiza en `README.md` el apartado **Link público de prueba** con la URL real verificada. Actualiza `docs/VALIDACION.md` con los resultados y sus fechas; conserva cualquier limitación que siga pendiente. No añadas claves, archivos `.env` ni documentos privados como evidencia.

Para subir únicamente estos documentos, ejecuta desde la carpeta del proyecto:

```powershell
git add README.md docs/VALIDACION.md docs/EVIDENCIA_FINAL.md
git diff --cached
git commit -m "Registrar publicación y validación final del reto"
git push origin HEAD:main
```

`git diff --cached` permite revisar el texto que vas a subir. Si abre una vista larga, pulsa **q** para salir. Comprueba que no haya una clave antes de continuar. Si GitHub rechaza el push por permisos o protección de la rama, realiza la actualización mediante una rama y un pull request con una cuenta autorizada.

**Puedes declarar cerrados estos pendientes cuando cada comprobación tenga evidencia positiva.** Mantén separados los resultados locales, las pruebas con LLM simulado y las pruebas autenticadas del servicio publicado.
