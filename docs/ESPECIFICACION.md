# Contratos de herramientas y flujo documental

El cambio de interfaz pedido posteriormente se especifica en [FLUJO_DOCUMENTAL.md](FLUJO_DOCUMENTAL.md). La pantalla ya no es conversacional; la API y los cinco contratos originales se conservan para compatibilidad y demo.

La fuente ejecutable es `src/contracts/proveedor.ts`; `src/tools/proveedor.ts` expone los objetos de herramienta con descripciones, argumentos Zod descritos y `execute(args, ctx): Promise<string>`. Los cinco contratos públicos se conservan para el componente conversacional, demo y módulo. El flujo documental invoca solo lectura, mapeo, formulario y paquete.

| Herramienta | Entrada pública | Salida mínima, además de metadatos trazables |
|---|---|---|
| proveedor_leer_solicitud | `{caso}` | País, cliente, formato, campos y soportes. |
| proveedor_mapear_campos | `{caso,campos}` | `llenos`, `faltantes`, `requiere_confirmacion` y evaluación previa de soportes. |
| proveedor_generar_formulario | `{caso,mapeo}` | `ruta`, `formato`, UUID descargable, mapeo y firma pendiente. |
| proveedor_armar_paquete | `{caso}` | `ruta`, `listo_para_firma`, `checklist`, correo y ZIP. |
| proveedor_simular_envio | `{caso,confirmado}` | `ruta` y UUID de `ENVIO-SIMULADO.md`, estado simulado y envío real falso. |

`ctx.directory` es la raíz confiable del proyecto; `ctx.sessionId` es un UUID. El contexto puede incluir un motor y callback de autorización confiables para integración. Esos valores nunca los proporciona el modelo. Entradas externas adicionales son rechazadas; en la lista de campos se eliminan anotaciones de lectura antes de comprobar igualdad con la plantilla.

Cada ejecución devuelve un string JSON `{ok:true,data}` o `{ok:false,error:{code,message,retryable}}`. El esquema de salida se valida. La fachada transforma al motor interno, que conserva contratos con `caso_id` y UUID para no confiar en rutas ni permisos enviados por el modelo.

## Mapeo y país

Todo campo tiene etiqueta, valor, estado, fuente, ruta del maestro, confianza, nota y equivalente fiscal cuando corresponde. Estados: `lleno`, `faltante`, `requiere_confirmacion`. CO utiliza NIT; EC/PE/PA RUC; HN RTN. Un NIT colombiano usado en un país extranjero conserva su valor, confianza 0,7 y nota «identificador extranjero». Etiquetas fiscales ambiguas requieren revisión. Un campo sin fuente queda nulo y faltante. No se actualizan fixtures desde el chat.

## Documentos y preparación

Excel escribe etiquetas y valores en las hojas/celdas del mapa. PDF reproduce campos en el orden dado. Portal devuelve `formato_no_soportado:true` y `valores-portal.md` para copiar manualmente. La evaluación previa de soportes es de solo lectura y no implica que un paquete exista.

El paquete copia soportes existentes, incluidos los vencidos para revisión, y genera checklist, correo borrador y manifiesto. Los datos bancarios no se incluyen en el correo. Soportes exigidos ausentes, archivos faltantes o vencidos bloquean `listo_para_firma`; un campo faltante no lo bloquea por sí solo. Todos los campos faltantes y equivalencias a revisar aparecen en el checklist.

Las exportaciones están en `out/<caso>/`. Las descargas por sesión usan copias privadas e inmutables con UUID en `out/.sesiones/` para evitar servir archivos de otra sesión. Los logs globales y por caso registran timestamp, herramienta, resultado y resumen técnico sin valores bancarios ni clave. La revalidación interna también deja registros; el panel documental muestra las etapas ejecutadas.

## Confirmación

1. El agente pregunta por acción, caso y artefacto.
2. Solo una afirmación completa en el turno siguiente crea permiso de un uso.
3. Una pregunta, rechazo, texto citado o cambio de caso cancela el permiso.
4. El motor consume el permiso; `confirmado:true` no basta.
5. Empaquetar y simular requieren confirmaciones independientes, conservando R4 del usuario.

## Componente conversacional conservado: ciclo, API y consultas

El ciclo usa rutas de herramientas acotadas y límite configurable de pasos por turno. La interfaz del proveedor es `LlmAdapter.enviar`; el adaptador incluido es OpenAI. Hay presupuesto por sesión, límite diario compartido por proceso, timeout y limitación de POST por IP.

Las consultas usan `{status:'answered'|'not_available'|'out_of_scope',evidence_ids:number[]}`. Se exigen referencias únicas válidas y se rechaza texto libre o propiedades adicionales. Las respuestas visibles se construyen con los valores retornados por herramientas. El contexto del LLM se limita a resultados y hasta cuatro preguntas del mismo caso. La API de historial incluye mensajes de usuario y eventos; sus rutas y headers están en README.

## Matriz de casos

| Caso | Resultado a fecha de solicitud | Resultado hoy depende de vigencias reales del índice |
|---|---|---|
| CO | Excel, cuatro soportes y simulación tras confirmar. | Cámara de Comercio vencida puede bloquear firma/simulación. |
| EC | PDF, RUC a revisar, contribuyente especial faltante, soporte tributario ausente. | Bloquea por el soporte ausente y los soportes vencidos. |
| HN | Excel, RTN a revisar, referencias faltantes; esos campos no bloquean firma si los soportes están vigentes. | Cámara de Comercio/parafiscales vencidos bloquean. |
| PA | Markdown copiable, RUC a revisar, sin login ni envío automático. | Gestión humana; no se inventan acciones de portal. |

No hay fixture PE y no se añadió uno ficticio. El demo predeterminado usa fecha UTC actual y limpia `out/`; el modo histórico es explícito. La URL pública y una llamada real autenticada al LLM requieren activación externa y no se declaran completadas sin evidencia.
