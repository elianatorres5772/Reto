# Publicar la preparación documental

El repositorio incluye Dockerfile, compose.yaml y render.yaml. La configuración no crea una URL por sí sola. La aplicación funciona **sin clave LLM**; con la clave de Claude, el chat usa tool calling.

## Local con Docker

Instala Docker Desktop. Crea `.env` si no existe, para satisfacer el archivo esperado por compose, sin poner una clave:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build
```

Abre `http://localhost:3000`, selecciona una solicitud, prepara documentos, revisa y autoriza el ZIP. Para detener: Ctrl + C y `docker compose down`. El volumen conserva documentos; no uses `down -v` si los necesitas.

La imagen compila TypeScript, sirve assets y ejecuta como usuario sin privilegios. Instala dependencias verificadas desde lockfile. Admite secretos BuildKit opcionales de proxy/CA para redes corporativas, sin desactivar TLS. No copia `.env` ni claves al build.

## Publicar con Render

1. Entra a https://render.com e inicia sesión con GitHub.
2. **New → Blueprint**, elige el repositorio `elianatorres5772/Reto` y la rama `dev`. Render lee `render.yaml`.
3. Render pide dos valores:
   - `LLM_API_KEY`: tu clave de Claude (https://console.anthropic.com/settings/keys). Puedes dejarla vacía: el chat funciona con palabras clave.
   - `FECHA_EVALUACION`: `2026-08-25` para la defensa.
4. Revisa el plan (Free) y pulsa **Apply**. La primera construcción tarda unos minutos.
5. Cuando el estado sea **Live**, copia la URL `https://registro-proveedor-xxxx.onrender.com`.
6. Abre `<URL>/api/health`. Debe responder `ok: true`, `provider: anthropic` y la fecha de evaluación, y `configured: true` si pusiste la clave.
7. Abre la URL, pulsa **Conversar con el agente** y prueba el guion del README.
8. Anota la URL en el README (línea «Link de prueba») y los resultados en `docs/VALIDACION.md`.

`PUBLIC_ORIGIN` no hace falta: el servidor acepta su propio dominio. Render asigna `PORT` automáticamente.

El plan gratuito puede entrar en reposo y perder archivos al reiniciar. Descarga los documentos y verifica las condiciones actuales; producción requiere almacenamiento persistente. Las sesiones son anónimas, viven en memoria y no sobreviven a un reinicio. No se afirma URL activa ni publicación realizada desde este entorno.

La firma y el envío quedan al humano; soportes vencidos/ausentes bloquean firma y son un resultado esperado. La revisión bancaria y fiscal requiere supervisión. No ejecutes el demo en un servidor con documentos necesarios porque limpia `out/`.
