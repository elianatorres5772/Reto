# Paso a paso para publicar y validar la entrega documental

El aplicativo es un agente conversacional (chat en ventana modal) con un flujo documental complementario por botones. No necesitas clave LLM: sin clave, el chat entiende órdenes por palabras clave. El PRD original y la nueva instrucción del usuario se distinguen en [docs/FLUJO_DOCUMENTAL.md](docs/FLUJO_DOCUMENTAL.md).

## 1. Actualizar y arrancar

En Visual Studio Code abre la carpeta del proyecto y **Terminal → Nueva terminal**. Si el servidor está funcionando, detenlo con Ctrl + C.

```powershell
git pull origin main
pnpm install --frozen-lockfile
pnpm run dev
```

Si falta `origin`, sigue [COMANDOS_PASO_A_PASO.md](COMANDOS_PASO_A_PASO.md). Abre `http://localhost:3000` y recarga con Ctrl + F5 si aún ves el chat anterior.

## 2. Comprobar la preparación

1. Selecciona una solicitud y revisa su correo.
2. Pulsa **Preparar documentos** y espera lectura, mapeo y formulario.
3. Comprueba que los datos tengan fuente y que los ausentes estén pendientes.
4. Revisa los soportes y sus vigencias. Los vencidos/ausentes deben bloquear firma.
5. Cancela el paquete y comprueba que se conserve el formulario.
6. Prepara de nuevo y responde **Sí, preparar paquete**.
7. Descarga el ZIP y revisa formulario, soportes disponibles, checklist, manifiesto y borrador de correo.
8. Comprueba que la entrega deja pendiente la firma humana. En el chat, con `FECHA_EVALUACION=2026-08-25`, prueba el guion del README: «envía» → «sí» → «sí» genera solo `ENVIO-SIMULADO.md` para `co-industrias-delta`.

Para Panamá debe generarse `valores-portal.md` para copia manual. No se accede al portal. No cambies fechas originales para forzar el estado listo para firma; los tests emplean copias temporales para probar éxito.

## 3. Publicar en Internet

Sigue [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): entra a Render, conecta el repositorio y crea el servicio desde `render.yaml`. No requiere clave LLM; para probar Claude, agrega `LLM_API_KEY` como variable secreta. Espera y copia la URL HTTPS real. Comprueba `/api/health` y repite el paso 2 desde esa URL, idealmente en ventana privada.

No hay una URL publicada automáticamente por tener Dockerfile o Blueprint. El hosting requiere tu cuenta y aceptar sus condiciones. Registra la URL real verificada en README.

## 4. Medir arranque en un entorno limpio

En un equipo nuevo con Node/pnpm instalados, usa una copia recién descargada, sin `node_modules` ni `dist`. Registra versiones, sistema, red y hora de inicio.

```powershell
$inicioReto = Get-Date
pnpm install --frozen-lockfile
pnpm run dev
```

Cuando el servidor arranque, abre otra terminal y comprueba:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Anota la hora de la respuesta y comprueba que puedes leer una solicitud. Detén el servidor en la primera terminal con Ctrl + C y calcula:

```powershell
((Get-Date) - $inicioReto).TotalSeconds
```

El tiempo incluye instalación y comprobación manual. Registra por separado el instante del health si distingues esas fases; no excluyas descargas sin indicarlo. Si supera 120 segundos, conserva el resultado y deja pendiente ese criterio en lugar de declararlo cumplido.

## 5. Registrar evidencia

Crea `docs/EVIDENCIA_FINAL.md` con fecha, URL, caso probado, cancelación/autorización, archivos descargados, pendientes detectados y tiempos del entorno limpio. Actualiza `docs/VALIDACION.md` solo con resultados ejecutados y limitaciones restantes. No incluyas claves ni documentos privados.

```powershell
git add README.md docs/VALIDACION.md docs/EVIDENCIA_FINAL.md
git diff --cached
git commit -m "Registrar publicación y validación documental"
git push origin HEAD:main
```

La conexión a un LLM real sigue sin acreditarse para el componente conversacional conservado. Es una comprobación técnica opcional separada, descrita en [README_LLM.md](README_LLM.md), y no bloquea la preparación documental actual.
