# Registro como proveedor

Agente de registro con TypeScript, herramientas Zod y chat. Lee solicitudes, genera Excel/PDF, prepara documentación para firma y simula el envío después de confirmaciones humanas. Datos ficticios: CO, EC, HN y PA.

## Ejecutar en local

Requiere Node 22.13+ y pnpm 11.19.0. Instala pnpm una vez con `npm install --global pnpm@11.19.0`. Desde la carpeta del proyecto:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Abre `http://localhost:3000`. Un comando inicia front y backend: `pnpm run dev`. Si prefieres Docker, crea primero `.env` según la guía y usa `docker compose up --build`.

Sin clave funcionan los botones y comandos `leer`, `mapear`, `formulario`, `preparar`, `paquete`, `simular`, `resumen`, `ayuda`. Para preguntas y acciones en lenguaje natural, configura **`LLM_API_KEY` en `.env`**, junto a `package.json`. Sigue [README_LLM.md](README_LLM.md); nunca pegues la clave en el chat, código ni GitHub.

Selecciona una solicitud, pulsa **Preparar borrador**, revisa el resumen y confirma el paquete. El siguiente turno pregunta por la simulación; requiere otra confirmación. El portal genera `valores-portal.md` para trabajo manual. `listo_para_firma` es un estado de preparación según soportes, no una firma ni aceptación legal.

## Verificar

```sh
pnpm run check
pnpm exec bun run demo.ts
pnpm run demo:historico
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e
pnpm run build
```

El demo ejecuta los cinco contratos públicos en todos los casos, **sin LLM**, usa fecha actual UTC y limpia `out/` al comenzar. Detén el servidor y descarga los documentos que quieras conservar antes de ejecutarlo. `demo:historico` usa las fechas de las solicitudes y lo declara. Soportes vencidos bloquean firma/simulación; los campos faltantes se enumeran sin bloquear por sí solos.

En cloud con Chromium instalado: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm run test:e2e`. La suite usa servidores temporales y un LLM simulado para los escenarios conversacionales, sin cargos. `pnpm run check:all` reúne las verificaciones; el requisito Bun también puede ejecutarse con `bun install && bun run demo.ts`, aunque pnpm es el gestor oficial del proyecto y su lockfile es el de CI.

## Variables de entorno

| Variable | Predeterminado / uso |
|---|---|
| `LLM_API_KEY` | Vacía; solo necesaria para lenguaje natural con OpenAI. |
| `LLM_PROVIDER`, `LLM_MODEL` | `openai`, `gpt-4.1-mini`. |
| `HOST`, `PORT` | `127.0.0.1`, `3000`; en contenedor `HOST=0.0.0.0`. |
| `PUBLIC_ORIGIN` | Origen HTTPS exacto del despliegue; vacío en local. |
| `AGENT_MAX_ITERATIONS` | 25 pasos por turno, rango 1–25. |
| `LLM_MAX_OUTPUT_TOKENS` | 500, rango 1–2000. |
| `LLM_MAX_SESSION_TOKENS` | 100000, rango 1–1000000; presupuesto reservado conservador. |
| `LLM_MAX_DAILY_TOKENS` | 1000000, rango 1–10000000 por proceso y día UTC. |
| `LLM_TIMEOUT_MS` | 15000, rango 1–60000. |
| `CHAT_RATE_LIMIT` | 120 POST por minuto e IP, rango 1–10000. |
| `OUTPUT_ROOT` | `out`; opción local avanzada de ubicación de exportaciones. |

Valores numéricos inválidos usan los valores seguros predeterminados. Los presupuestos en memoria se reinician con el servidor; para producción debe existir control de gasto adicional en el proveedor.

## API

| Método y ruta | Uso |
|---|---|
| `POST /api/session` | Crea sesión y retorna `{ok:true,session_id}`. |
| `GET /api/cases` | Catálogo de casos. |
| `POST /api/chat` | Header `X-Session-Id`; JSON `{caso_id,message}`; respuesta NDJSON de eventos `thinking`, `tool_call`, `tool_result`, `message`, `confirmation`, `case_selected`, `done`. |
| `GET /api/sessions/:id` | Historial completo, incluyendo mensajes del usuario; exige el header de esa misma sesión. |
| `GET /api/artifacts/:id` | Descarga de artefacto registrado en esa sesión; exige `X-Session-Id`. |
| `GET /api/health` | `{ok,mode,provider,model,configured}`; `configured` informa presencia de clave, no conectividad autenticada. |

Las llamadas públicas se documentan en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md). Los errores no devuelven claves, cuerpos del proveedor o trazas. Las sesiones caducan tras una hora de inactividad y no sobreviven a reinicios.

## Archivos generados

`out/<caso>/formulario.xlsx` o `formulario.pdf`; para portal, `valores-portal.md`. El paquete contiene formulario, soportes existentes, `checklist.md`, `borrador-correo.md` y `manifiesto.json`; también se ofrece como ZIP descargable. Una simulación autorizada escribe `ENVIO-SIMULADO.md`. Hay auditoría en `out/log.jsonl` y `out/<caso>/log.jsonl`.

`out/.sesiones/` conserva copias privadas para descargas por UUID; las rutas canónicas por caso representan la exportación más reciente y pueden reemplazarse. `out/`, `.env`, dependencias y reportes no se suben al repositorio. Los fixtures no se alteran. Se admite el repositorio maestro tanto en la distribución original recibida como en `fixtures/reto-01/repositorio/`.

## Entrega y documentación

**Link público de prueba: pendiente de activar y verificar.** No hay una URL pública ni clave de acceso confirmadas todavía. [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) explica cómo publicar con Docker/Render y registrar aquí la URL real. No se afirma conexión real al LLM sin probar una clave propia.

- [COMANDOS_PASO_A_PASO.md](COMANDOS_PASO_A_PASO.md): instrucciones para personas sin experiencia técnica.
- [README_LLM.md](README_LLM.md): dónde poner la clave y cómo comprobar una pregunta.
- [EXPLICACION_CODIGO.md](EXPLICACION_CODIGO.md): explicación de todos los módulos y evolución desde el primer push.
- [docs/PRD_RETO_01.md](docs/PRD_RETO_01.md): especificaciones completas proporcionadas para el reto.
- [SOLUCION.md](SOLUCION.md): arquitectura, decisiones, portal, costos, cobertura y uso de IA.
- [docs/VALIDACION.md](docs/VALIDACION.md): evidencia ejecutada y límites.
- [tests/e2e/README.md](tests/e2e/README.md): pruebas de navegador.
- [docs/DISENO.md](docs/DISENO.md): diseño y origen del fondo.

## Módulo reutilizable

`modulo/tools/proveedor.ts` reexporta las mismas herramientas sin importar HTTP. Prompt y skill se generan desde las fuentes del aplicativo:

```sh
pnpm run module
pnpm run module:check
```

El segundo comando forma parte de `check` y evita copias divergentes. Para integrar, conserva `modulo/`, `src/tools/`, `src/contracts/`, fixtures y dependencias del repositorio; no es una carpeta autónoma que se pueda copiar sin esas fuentes. Ver [modulo/README.md](modulo/README.md).
