# Guía práctica para ejecutar la preparación documental

La pantalla ya no es un chat. Permite tomar una solicitud recibida del cliente, completar el formulario desde el maestro y reunir los soportes para revisión y firma. No necesitas clave de inteligencia artificial para este proceso.

## 1. Preparar el computador

Instala Node.js 22.13 o superior desde https://nodejs.org; se recomienda Node 24 LTS. Instala pnpm una sola vez:

```powershell
npm install --global pnpm@11.19.0
```

Abre la carpeta del proyecto en Visual Studio Code y elige **Terminal → Nueva terminal**. Debes estar en la carpeta que contiene `package.json`. Copia un comando a la vez y pulsa Enter.

## 2. Descargar los cambios

Si tienes una copia con Git:

```powershell
git pull origin main
```

Si aparece que `origin` no existe, agrega el repositorio y vuelve a ejecutar el pull:

```powershell
git remote add origin https://github.com/elianatorres5772/Reto.git
git pull origin dev
```

Si descargaste un ZIP, no puedes usar `git pull`; descarga una copia nueva o clona el repositorio en una carpeta diferente con `git clone -b dev https://github.com/elianatorres5772/Reto.git`. Conserva tus archivos locales antes de reemplazar una carpeta.

## 3. Instalar e iniciar

```powershell
pnpm install --frozen-lockfile
```

Espera a que termine. Después:

```powershell
pnpm run dev
```

Deja la terminal abierta y visita **http://localhost:3000**. Si ves la interfaz anterior, actualiza el navegador con **Ctrl + F5**. El servidor debe reiniciarse después de descargar cambios.

## 4. Preparar una solicitud

1. En **Solicitud recibida**, selecciona el cliente. También puedes pulsar una tarjeta de la lista.
2. Revisa remitente, fecha y formato; abre **Ver correo y requisitos recibidos**.
3. Pulsa **Preparar documentos**. El aplicativo lee los campos, busca los datos en el maestro y genera el formulario.
4. Revisa las tablas de campos y soportes. Los faltantes no se inventan; los identificadores extranjeros se señalan para revisión.
5. Puedes descargar el formulario antes de armar el paquete.
6. Lee la pregunta y pulsa **Sí, preparar paquete** para reunir formulario, soportes disponibles, checklist y borrador de correo. **Cancelar preparación del paquete** conserva el formulario sin generar el ZIP.
7. Descarga **paquete-borrador.zip**. Ábrelo y revisa los documentos antes de solicitar la firma del representante legal.

La preparación termina con la descarga. El aplicativo no firma ni envía. Un paquete con soportes vencidos/ausentes se presenta con pendientes y no está listo para firma. Las fechas originales del reto pueden producir ese bloqueo; no es una falla.

En el caso de Panamá se descarga `valores-portal.md`, para copiar los datos manualmente en el portal. No se solicita clave del portal ni se accede al sitio.

## 5. Ejecutar las verificaciones

Para detener el aplicativo, pulsa **Ctrl + C** en su terminal. Conserva los documentos descargados antes del demo, porque limpia `out/`.

```powershell
pnpm run check
```

Comprueba TypeScript, módulo, pruebas internas y demo. Las pruebas internas cubren herramientas, seguridad, el componente conversacional conservado y el nuevo flujo documental. Para el demo con Bun:

```powershell
pnpm exec bun run demo.ts
```

El demo técnico mantiene la simulación exigida por el contrato original; esa opción no existe en la pantalla documental. Para evaluar las fechas originales de las solicitudes: `pnpm run demo:historico`.

Para comprobar la pantalla con un navegador automático, instala Chromium una vez:

```powershell
pnpm exec playwright install chromium
```

Después:

```powershell
pnpm run test:e2e
```

No necesitas arrancar el aplicativo antes de estas pruebas. Usan copias temporales y no requieren LLM. Si todas pasan, el resultado esperado de la suite documental es **12 passed**. Para abrir el reporte:

```powershell
pnpm run test:e2e:report
```

Para compilar el aplicativo:

```powershell
pnpm run build
```

Para ejecutar check y E2E juntos:

```powershell
pnpm run check:all
```

No hay que instalar Cucumber, Serenity/JS ni MCP. No existe el comando `test:browsers` que se retiró.

## 6. Problemas frecuentes

| Situación | Qué hacer |
|---|---|
| PowerShell bloquea `pnpm.ps1` | Usa `pnpm.cmd`; por ejemplo `pnpm.cmd run dev`. |
| El puerto 3000 está ocupado | Revisa si ya tienes una terminal ejecutando el servidor. Detén ese proceso con Ctrl + C. |
| Sigue apareciendo el chat | Ejecuta pull, instalación y reinicio; recarga con Ctrl + F5. |
| Aparece conexión interrumpida | Revisa el estado que se recupera; no autorices repetidamente un paquete sin comprobar el resultado. |
| La sesión expiró | Recarga la página y prepara de nuevo la solicitud. |
| La descarga del navegador falla | Copia el error anterior a `ELIFECYCLE`; revisa conectividad y certificados sin desactivar TLS. |
| Hay soportes vencidos o campos faltantes | Revisa el checklist; son pendientes de negocio, no datos que el agente pueda inventar. |

Consulta [EXPLICACION_CODIGO.md](EXPLICACION_CODIGO.md) para el código y [PASOS_PENDIENTES_DEL_RETO.md](PASOS_PENDIENTES_DEL_RETO.md) para publicar el aplicativo.
