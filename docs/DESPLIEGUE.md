# Publicar la preparación documental

El repositorio incluye Dockerfile, compose.yaml y render.yaml. La configuración no crea una URL por sí sola. El nuevo flujo documental funciona **sin clave LLM**.

## Local con Docker

Instala Docker Desktop. Crea `.env` si no existe, para satisfacer el archivo esperado por compose, sin poner una clave:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build
```

Abre `http://localhost:3000`, selecciona una solicitud, prepara documentos, revisa y autoriza el ZIP. Para detener: Ctrl + C y `docker compose down`. El volumen conserva documentos; no uses `down -v` si los necesitas.

La imagen compila TypeScript, sirve assets y ejecuta como usuario sin privilegios. Instala dependencias verificadas desde lockfile. Admite secretos BuildKit opcionales de proxy/CA para redes corporativas, sin desactivar TLS. No copia `.env` ni claves al build.

## Publicar con Render

1. Entra a https://render.com y conecta GitHub.
2. Crea un Blueprint desde `elianatorres5772/Reto`, rama `dev`, usando `render.yaml`.
   - Para la defensa, agrega la variable `FECHA_EVALUACION=2026-08-25` para que `co-industrias-delta` pueda llegar a `ENVIO-SIMULADO.md`. Se muestra en la cabecera del chat y en `/api/health`.
3. Revisa precios y condiciones actuales del plan antes de aceptar. No se solicita `LLM_API_KEY` para el flujo documental.
4. Espera el despliegue; copia la dirección HTTPS real que entrega el servicio.
5. En variables de entorno puedes configurar `PUBLIC_ORIGIN` con ese origen exacto, sin barra final. Conserva `HOST=0.0.0.0`; Render administra el puerto.
6. Abre `/api/health` y comprueba `ok:true`. Puede indicar modo sin LLM: es correcto para esta pantalla.
7. Prueba seleccionar solicitud, leer correo, preparar formulario, revisar pendientes, cancelar/autorizar y descargar ZIP.
8. Anota la URL verificada en README y los resultados en `docs/VALIDACION.md`.

El plan gratuito puede entrar en reposo y perder archivos al reiniciar. Descarga los documentos y verifica las condiciones actuales; producción requiere almacenamiento persistente. Las sesiones son anónimas, viven en memoria y no sobreviven a un reinicio. No se afirma URL activa ni publicación realizada desde este entorno.

La firma y el envío quedan al humano; soportes vencidos/ausentes bloquean firma y son un resultado esperado. La revisión bancaria y fiscal requiere supervisión. No ejecutes el demo en un servidor con documentos necesarios porque limpia `out/`.
