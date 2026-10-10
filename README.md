# Registro como proveedor

Agente conversacional con herramientas tipadas, datos trazables, formularios borrador y confirmación humana. Incluye los cuatro casos ficticios suministrados: CO, EC, HN y PA.

## Ejecutar

Requiere Node 20+ y npm. Desde la raíz del repositorio:

```sh
npm ci --cache /tmp/reto1-npm-cache
npm run dev
```

Abre el servidor local en el puerto 3000. Usa **Preparar borrador**, revisa las herramientas y responde **sí** a la pregunta para empaquetar. La simulación necesita su propia confirmación. Usa **mapear** para inspeccionar campos sin generar archivos.

No hace falta una clave del LLM. El modo predeterminado reconoce comandos: `leer`, `mapear`, `formulario`, `preparar`, `paquete`, `simular`, `resumen`, `ayuda`. Para clasificar solicitudes en lenguaje natural, crea `.env` a partir de `.env.example` y configura `LLM_API_KEY` y opcionalmente `LLM_MODEL`. No publiques `.env` ni pegues claves en el chat. El proveedor opcional es OpenAI y solo clasifica intenciones; sus respuestas nunca se presentan como datos del proveedor.

## Verificar

```sh
npm run check
# Requisito del reto, si Bun ya está en PATH:
bun run demo.ts
# Bun también se instala localmente con las dependencias de desarrollo:
npm exec --cache /tmp/reto1-npm-cache -- bun run demo.ts
```

`npm run check` comprueba TypeScript, pruebas y demo. El demo evalúa cada caso a su fecha de solicitud para resultados históricos reproducibles. El chat usa la fecha actual UTC y puede bloquear simulaciones por soportes vencidos. No confundir ambas evaluaciones.

## Alcance

Los XLSX y PDF originales no fueron adjuntados: se reconstruyen borradores desde los mapas JSON. Todos los soportes son placeholders ficticios. No hay firma, correo real, carga de portal ni aprobación legal. Panamá requiere gestión manual. Sesiones y autorizaciones viven en memoria y se pierden al reiniciar; los artefactos quedan en `outputs/` y sus descargas requieren la sesión original. Recargar la página crea una sesión nueva.

Consulta [SOLUCION.md](SOLUCION.md) para arquitectura y decisiones, y [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) para los contratos y criterios de aceptación.
