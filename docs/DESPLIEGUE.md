# Publicar el aplicativo para la defensa

El repositorio incluye Dockerfile, compose.yaml y render.yaml. **La configuración no crea una URL por sí sola.** Falta activar un servicio en una cuenta de hosting y probarlo con una clave propia.

## Opción local con Docker

Instala Docker Desktop, abre el proyecto y crea `.env` según `README_LLM.md`. Después:

```powershell
docker compose up --build
```

Abre `http://localhost:3000`. Para detenerlo, pulsa Ctrl + C y luego `docker compose down`. El volumen `documentos` conserva exportaciones; `down -v` las borra y no debe usarse si se quieren conservar.

La imagen compila TypeScript y arranca `node dist/server/index.js`, incluye archivos web, prompt, conocimiento y fixtures y ejecuta como usuario sin privilegios. La clave no se copia durante el build: se proporciona al iniciar el contenedor. El Dockerfile instala dependencias con lockfile congelado y no deshabilita verificaciones TLS ni integridad.

## Opción pública con Render

1. Entra a https://render.com con tu cuenta.
2. Elige crear un **Blueprint** desde `elianatorres5772/reto1`, rama `main`. Render leerá `render.yaml` y preparará el servicio Docker.
3. En las variables seguras del servicio, introduce `LLM_API_KEY`. No la guardes en archivos del repositorio. Mantén `LLM_MODEL=gpt-4.1-mini` o un modelo accesible con salida JSON estructurada.
4. Cuando Render asigne una URL HTTPS, configura `PUBLIC_ORIGIN` con ese origen exacto, sin barra final. Ejemplo ficticio: `https://NOMBRE-REAL.onrender.com`; reemplázalo por la URL que muestra tu servicio. No es un link ya publicado.
5. Espera el despliegue y revisa que `/api/health` devuelva `ok:true`, proveedor y modelo. Esto solo verifica el arranque.
6. Abre el chat público, selecciona un caso y pregunta «¿Qué documentos exige esta solicitud?». Deben aparecer lectura/mapeo y una respuesta con fuentes. Prueba preparación, confirmaciones y descarga. Esto sí verifica el flujo con tu clave.
7. Copia la **URL real verificada** al apartado «Link público de prueba» de README. Mantén el servicio activo para la defensa.

El plan configurado es `free`; revisa la disponibilidad y condiciones actuales antes de activarlo. Puede entrar en reposo o perder archivos al reiniciar. Para el reto basta una instancia y descargar documentos; en producción se requiere almacenamiento persistente y presupuestos compartidos entre réplicas. No ejecutes el demo dentro de un servicio que tenga documentos que necesites conservar: limpia `out/`.

## Datos para revisar antes de la defensa

- `LLM_API_KEY` pertenece a tu cuenta y tiene acceso y saldo de API.
- `configured:true` no demuestra que la clave funcione: hay que hacer una pregunta real.
- El servidor solo simula envío; no envía correos ni firma.
- La preparación utiliza fecha UTC actual. Soportes vencidos en los fixtures pueden bloquear el proceso y es un resultado esperado.
- Los presupuestos y el rate limit están habilitados; configura también un límite de gasto en la cuenta del proveedor.
- Render entrega HTTPS. El servidor admite ese origen sin confiar en `X-Forwarded-For` para cambiar cuotas.

## Estado de verificación

El build Docker y el flujo HTTP dentro del contenedor se verificaron, incluyendo ejecución como usuario no privilegiado. La evidencia detallada se registra en `VALIDACION.md`. Si no hay cuenta de hosting o clave accesible, no se declara publicada la aplicación. El PRD permite una defensa local con penalización de −10 por ausencia de link público.


En una red corporativa que exija proxy y CA, el Dockerfile admite secretos BuildKit opcionales `npm_proxy` y `corporate_ca` para las instalaciones. Deben proporcionarse desde la configuración segura del entorno, sin escribir valores en Dockerfile ni desactivar TLS. No son necesarios en una red normal y nunca contienen la clave del LLM.
