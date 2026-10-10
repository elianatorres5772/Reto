# Registro como proveedor

Agente conversacional con herramientas tipadas, datos trazables, formularios borrador y confirmación humana. Incluye los cuatro casos ficticios suministrados: CO, EC, HN y PA.

Si no tienes experiencia técnica, empieza por la [guía de comandos paso a paso](COMANDOS_PASO_A_PASO.md).

## Ejecutar

Requiere Node 22.13+ y pnpm 11.19.0. Para instalar pnpm una sola vez, usa `npm install --global pnpm@11.19.0`. Desde la raíz del repositorio:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Abre el servidor local en el puerto 3000. Usa **Preparar borrador**, revisa las herramientas y responde **sí** a la pregunta para empaquetar. La simulación necesita su propia confirmación. Usa **mapear** para inspeccionar campos sin generar archivos.

No hace falta una clave del LLM. El modo predeterminado reconoce comandos: `leer`, `mapear`, `formulario`, `preparar`, `paquete`, `simular`, `resumen`, `ayuda`. Para clasificar solicitudes en lenguaje natural, crea `.env` a partir de `.env.example` y configura `LLM_API_KEY` y opcionalmente `LLM_MODEL`. No publiques `.env` ni pegues claves en el chat. El proveedor opcional es OpenAI y solo clasifica intenciones; sus respuestas nunca se presentan como datos del proveedor.

## Verificar

```sh
pnpm run check
# Requisito del reto, si Bun ya está en PATH:
bun run demo.ts
# Bun también se instala localmente con las dependencias de desarrollo:
pnpm exec bun run demo.ts
```

`pnpm run check` comprueba TypeScript, pruebas y demo. El demo evalúa cada caso a su fecha de solicitud para resultados históricos reproducibles. El chat usa la fecha actual UTC y puede bloquear simulaciones por soportes vencidos. No confundir ambas evaluaciones.

## Alcance

Los XLSX y PDF originales no fueron adjuntados: se reconstruyen borradores desde los mapas JSON. Todos los soportes son placeholders ficticios. No hay firma, correo real, carga de portal ni aprobación legal. Panamá requiere gestión manual. Sesiones y autorizaciones viven en memoria y se pierden al reiniciar; los artefactos quedan en `outputs/` y sus descargas requieren la sesión original. Recargar la página crea una sesión nueva.

Consulta [SOLUCION.md](SOLUCION.md) para arquitectura y decisiones, y [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) para los contratos y criterios de aceptación.

## E2E en navegador real

```sh
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e
# Entorno cloud con Chromium ya instalado:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e
```

Son 15 escenarios con navegador y backend reales, sin clave LLM. Consulta [tests/e2e/README.md](tests/e2e/README.md) para cobertura, aislamiento de fixtures, reportes y ejecución en CI. `pnpm run check:all` incluye todas las verificaciones y las E2E.
