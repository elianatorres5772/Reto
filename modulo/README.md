# Módulo reutilizable de registro como proveedor

Este módulo usa exactamente el prompt, el conocimiento y las herramientas del aplicativo. No importa el servidor HTTP ni arranca un chat.

- `agent.md`: frontmatter de agente primario con edición/shell denegados; cuerpo generado desde `agent/prompt.md`.
- `tools/proveedor.ts`: reexporta los mismos objetos públicos de `src/tools/proveedor.ts`.
- `skill/registro-proveedor/SKILL.md`: conocimiento generado desde `src/knowledge/registro-proveedor.md`.

Ejecuta `pnpm run module` después de modificar prompt/conocimiento y `pnpm run module:check` para verificar que no diverjan. El segundo forma parte de CI. El frontmatter describe permisos para la plataforma anfitriona; no es una autenticación del servidor del reto.

Para integrar, importa `leer_solicitud` o `proveedorTools` y entrega un contexto confiable `{directory,sessionId}` donde `directory` sea la raíz del proyecto y `sessionId` un UUID. Conserva las fuentes y dependencias de este repositorio: el módulo utiliza reexportaciones y no es una carpeta autosuficiente. `execute` recibe argumentos públicos y retorna un string JSON validado.

Las acciones críticas requieren además un motor/contexto con callback de autorización conectado a `ConfirmationGate` y permisos de un uso. `confirmado:true` nunca reemplaza el permiso. `demo.ts` muestra esa integración sin un modelo. Al finalizar una integración que use la caché de la fachada, llama `releaseToolSession` para liberar su registro; la aplicación HTTP usa su propio ciclo de vida.
