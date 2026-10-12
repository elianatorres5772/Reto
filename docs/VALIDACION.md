# Validación del aplicativo

## Flujo documental — 12 de octubre de 2026

El front tiene dos vías sobre las mismas herramientas: el chat del agente en ventana modal (requisito del PRD) y el flujo documental por botones. El guion de la demo del PRD (§11) está cubierto por pruebas unitarias, HTTP (con `FECHA_EVALUACION`) y E2E (`tests/e2e/chat.spec.ts`).

| Comprobación actual | Resultado |
|---|---|
| TypeScript estricto | Sin errores. |
| Pruebas internas | 29 aprobadas: las 25 anteriores más 4 del controlador documental. |
| E2E de la pantalla documental | 12 aprobadas; reemplazan los 19 escenarios de la interfaz conversacional anterior. |
| Build y sincronización del módulo | Completados. |
| Servidor compilado | Correo, preparación, autorización, estado bloqueado por soportes originales vencidos y descarga ZIP verificados. |
| Ausencia de firma/envío/simulación en el flujo documental | El controlador documental no invoca la quinta herramienta ni genera ENVIO-SIMULADO. En el chat, ENVIO-SIMULADO.md solo aparece tras dos confirmaciones y con el paquete listo para firma. |
| Fuentes y aislamiento | Datos desde herramientas, permiso vinculado a sesión/caso/formulario y descargas rechazadas en otra sesión. |
| Móvil | Tamaño 390 × 844 probado sin desbordamiento horizontal; se corrigió el ancho mínimo de las tablas durante la primera ejecución. |
| Fixtures | Sin cambios versionados. Éxito probado con copias temporales, vencimiento con fechas originales. |
| Capturas | docs/capturas/front-actual.png y flujo-documental.png, obtenidas del servidor compilado con fixtures originales. |

No se utilizó clave LLM ni se llamó al proveedor para preparar documentos. No se conectó una bandeja de correo ni un portal real. Las plantillas binarias originales no estaban disponibles; se reconstruyen desde mapas JSON. La URL pública, el arranque completo en entorno limpio y un nuevo build Docker de esta variante no se acreditan mediante estos checks. La evidencia Docker de abajo corresponde a la entrega anterior.

## Validación histórica de la entrega conversacional anterior

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

No había `LLM_API_KEY` real disponible ni una vinculación guardada. No se afirma una llamada real autenticada a Claude ni una URL pública activa; el adaptador de Anthropic se probó con respuestas simuladas del formato de la API (`tests/prd.test.ts`). La aplicación debe activarse en una cuenta de hosting y probar una consulta con la clave propia, según `DESPLIEGUE.md` y `../README_LLM.md`.

El build Docker no prueba el arranque completo en menos de dos minutos en una máquina limpia. Las pruebas se hicieron en Chromium de escritorio; no se afirma cobertura Firefox/WebKit ni auditoría exhaustiva de accesibilidad. Firma, correo real y automatización de portal están fuera del alcance.

Las instrucciones cloud se guardan como borrador (`install_script` y `start_skill`), no como una publicación automática del entorno. Las dependencias y procesos existentes de esta máquina no garantizan procesos vivos en una restauración posterior.
