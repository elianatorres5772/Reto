# Validación de la actualización al PRD completo

## Ampliación BDD, Screenplay y MCP — 10 de octubre de 2026

- **11 escenarios Cucumber y 61 pasos aprobados**, con Serenity/JS, TypeScript y Playwright. Se verificó la generación de JSON Serenity con tareas del actor, HTML Cucumber y HTML agregado Serenity BDD usando Java 21.
- **Comprobación MCP aprobada** con cliente SDK y servidor Playwright MCP reales: navegación, preparación, permisos separados para paquete/simulación y ausencia de envío real. Evidencia local en `reports/mcp/evidence.json`.
- Se usó Chromium instalado en `/usr/bin/chromium`; el MCP requirió la opción de sandbox para contenedor aislado. No se sustituyó el navegador ni el protocolo por mocks. El LLM sí está simulado, sin clave ni tráfico a OpenAI.
- La descarga de revisiones de navegador con `pnpm run test:browsers` fue bloqueada por la red de este entorno (`403 Domain forbidden` en `cdn.playwright.dev`). No se desactivó TLS ni se declaró esa instalación completada. El comando se comprobó con `--dry-run` y las suites se ejecutaron con el navegador disponible. La ruta de descarga debe verificarse en una red que permita ese dominio.
- Se añadió un job GitHub Actions para BDD/MCP y artefactos; su ejecución remota no se acredita por la ejecución local.

Guía completa: [tests/bdd/README.md](../tests/bdd/README.md). Estas comprobaciones no sustituyen la consulta real autenticada al LLM ni la publicación en hosting.

## Validación base de la entrega anterior

Resultados ejecutados sobre el código de esta entrega; los bloqueos esperados no son pruebas fallidas.

| Verificación | Resultado |
|---|---|
| Instalación reproducible | `pnpm install --frozen-lockfile` completado. |
| TypeScript estricto | `pnpm run typecheck` sin errores; código TypeScript sin `any`. |
| Sincronización del módulo | `pnpm run module:check` aprobado. |
| Suite interna | **25 pruebas aprobadas**, sin fallidas, canceladas u omitidas. |
| E2E Chromium | **19 escenarios aprobados**, sin fallidos u omitidos; backend real y OpenAI simulado para lenguaje natural. |
| Demo Node | Cuatro casos, cinco herramientas públicas por caso, sin clave LLM. |
| Demo Bun | `pnpm exec bun run demo.ts` completado sin clave. |
| Demo histórico | `pnpm run demo:historico` completado con fecha de solicitud explícita. |
| Determinismo del resumen | Dos ejecuciones consecutivas de `tsx demo.ts` comparadas con `cmp`: idénticas. Cada demo limpia `out/`. |
| Build | `pnpm run build` completado; assets y conocimiento presentes. |
| Servidor compilado | `node dist/server/index.js`: health, imagen, chat, portal y descarga verificados. |
| Auditoría de dependencias de producción | `pnpm audit --prod`: sin vulnerabilidades conocidas. |
| Docker build | Imagen `reto1-proveedor:prd` compilada desde Dockerfile, con dependencias congeladas y verificadas. |
| Docker runtime | Inicio, chat, confirmación, paquete, descarga e historial verificados por HTTP; ejecuta como UID 1000. |
| Fixtures | Ningún archivo versionado de fixtures fue modificado; estructura `repositorio/` y regla PE probadas en copias temporales. |

La suite interna verifica la forma pública del PRD, descripciones de argumentos, mapeos manipulados, permisos falsos, reglas tributarias, generación de archivos, correo sin cuenta bancaria, auditoría global/por caso, RN3, presupuestos de sesión y servidor incluso al crear otra sesión, límite de turno y timeout. HTTP valida historial completo y rechazo entre sesiones; E2E añade el prompt de defensa y selección de caso nombrado.

Los E2E originales mantienen los soportes y fechas. Los servidores preparados extienden fechas solo en copias temporales para el camino exitoso. En la fecha UTC de ejecución, la Cámara de Comercio/parafiscales originales están vencidos; bloquear `listo_para_firma` y simulación es el comportamiento correcto. Una referencia comercial faltante por sí sola no bloquea ese estado.

El primer build Docker falló por DNS de npm en el constructor; la resolución se obtuvo usando el proxy y CA disponibles mediante secretos temporales BuildKit y una entrada de host del entorno para el proxy. No se desactivaron TLS, checksums ni políticas de integridad. Se corrigió además la lectura de archivos estáticos/configuración para el usuario no privilegiado y se repitió el flujo dentro del contenedor. Es una configuración de esta máquina; no se incorpora la IP del proxy ni sus valores al repositorio o imagen. El Dockerfile admite esos secretos opcionalmente y funciona con red normal sin ellos.

No había `LLM_API_KEY` real disponible ni una vinculación guardada. No se afirma una llamada real autenticada a OpenAI ni una URL pública activa. La aplicación debe activarse en una cuenta de hosting y probar una consulta con la clave propia, según `DESPLIEGUE.md` y `../README_LLM.md`.

El build Docker no prueba el arranque completo en menos de dos minutos en una máquina limpia. Las pruebas se hicieron en Chromium de escritorio; no se afirma cobertura Firefox/WebKit ni auditoría exhaustiva de accesibilidad. Firma, correo real y automatización de portal están fuera del alcance.

Las instrucciones cloud se guardan como borrador (`install_script` y `start_skill`), no como una publicación automática del entorno. Las dependencias y procesos existentes de esta máquina no garantizan procesos vivos en una restauración posterior.
