# Cambio de alcance: preparación documental sin chatbot

La instrucción posterior del usuario sustituye la experiencia conversacional por una pantalla que resuelve la transcripción y preparación del registro como proveedor. Este documento complementa el PRD original, que se conserva sin editar. El PRD sí exigía chat, historial, entrada libre y ciclo LLM; la nueva interfaz deliberadamente cambia ese requisito a petición del usuario. Las herramientas, reglas de datos y confirmaciones se conservan.

## Resultado esperado

Una solicitud recibida en la entrada de fixtures produce un formulario Excel/PDF con los valores que existen en el maestro y un paquete documental para revisión/firma, con pendientes explícitos. El flujo nunca firma, envía ni simula envío. Para portal produce valores copiables, sin conexión al sitio. No incluye integración real de correo ni extracción automática de plantillas binarias arbitrarias.

## Operaciones y estados

1. **Seleccionar solicitud:** lee `solicitud.json`, plantilla y soportes exigidos; presenta remitente, asunto, país, fecha y cuerpo del correo. Descarta toda autorización anterior.
2. **Preparar documentos:** relee la entrada, identifica campos, resuelve glosario/maestro, marca valores faltantes y equivalencias por país y genera el formulario. Transmite el progreso y resultados por NDJSON.
3. **Revisar:** muestra una tabla por campo con valor, estado y fuente, otra con soportes y vigencias, y la descarga del formulario. No acepta valores inventados o editados desde el navegador.
4. **Autorizar paquete:** pregunta explícita y botón afirmativo, protegido por un UUID de confirmación asociado a caso, formulario y sesión. La autorización se consume una vez; cambiar de solicitud, regenerar o cancelar la invalida.
5. **Entregar:** ZIP con formulario, soportes disponibles, checklist, manifiesto y borrador de correo. Firma pendiente. Con soportes vigentes se marca `ready_for_review`; con pendientes de soportes, `blocked`. Ambos permiten descargar el borrador para revisión humana.

Estados: `idle`, `selected`, `preparing`, `awaiting_approval`, `preparing_package`, `ready_for_review`, `blocked`, `portal_manual`, `cancelled`, `error`. Una operación simultánea se rechaza con error controlado. Un fallo de plantilla conserva el correo ya leído y permite elegir otra solicitud. Una interrupción de red recupera el estado de la sesión antes de ofrecer un reintento humano.

## Responsabilidades

- `src/contracts/workflow.ts`: entradas estrictas, estado tipado y eventos.
- `src/workflow/registration.ts`: secuencia fija, progreso, invalidación de permisos y cierre humano; no contiene claves ni llama al LLM.
- `src/tools/proveedor.ts`: cinco contratos públicos. La fachada valida los datos contra las fuentes.
- `src/tools/engine.ts`: mapeo, reglas tributarias, soportes, archivos y aislamiento de descargas.
- `src/server/index.ts`: sesión, validación HTTP, rutas del flujo y transmisión de eventos.
- `src/web/registration.js`: representación de datos con `textContent`, acciones de selección/autorizar/descargar y recuperación de estado.
- `src/web/index.html` y `styles.css`: pantalla documental accesible y adaptable a móvil, conservando la paleta verde manzana y el fondo de referencia como cabecera.

La API conversacional y la herramienta de simulación se mantienen como compatibilidad del contrato original y demo. No son parte de la nueva experiencia. La preparación es determinista para los mapas JSON del reto; no debe presentarse como una inferencia del LLM ni como recepción de correos reales.

## Límites de la entrega

Los formularios se reconstruyen desde los mapas porque no se proporcionaron las plantillas binarias originales. Los soportes son placeholders ficticios. `listo_para_firma` evalúa presencia/vigencia, no autenticidad ni aprobación legal. Las equivalencias tributarias requieren revisión y los faltantes de campos se listan sin inventar datos. Un paquete con pendientes nunca se anuncia como listo para firma.
