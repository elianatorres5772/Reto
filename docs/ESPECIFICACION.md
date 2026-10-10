# Especificación implementable y criterios de aceptación

## Base documental

Esta especificación deriva del mensaje de requisitos del usuario (R1–R5) y de los 21 archivos adjuntos. No se suministró el PRD completo, incluida su sección 7.4, ni las plantillas binarias originales. No se afirma conformidad con documentos ausentes. `fixtures/reto-01/origen.json` registra la agrupación inferida, sin alterar el contenido de los archivos originales.

El maestro identifica una empresa colombiana ficticia. El glosario asocia RUC y RTN a `nit`; se aplica esta equivalencia textual sin afirmar que un NIT colombiano sea una identificación local válida. Los campos sin equivalencia permanecen nulos. En los mapas XLSX sin bandera `obligatorio`, se adopta un criterio conservador: todos los campos son obligatorios. El PDF y el portal conservan las banderas suministradas.

## Contratos antes de implementación

La fuente ejecutable de verdad es `src/contracts/proveedor.ts`. Entradas y salidas se validan con Zod. Todos los argumentos son objetos estrictos: propiedades adicionales, rutas, autorizaciones del cliente y fechas imposibles se rechazan.

| Herramienta | Entrada | Datos de salida |
|---|---|---|
| proveedor_leer_solicitud | `{caso_id}` | solicitud validada, soportes exigidos, fuente y necesidad de portal manual |
| proveedor_mapear_campos | `{caso_id}` | etiqueta, campo maestro, valor original, fuente, estado, obligatoriedad y faltantes |
| proveedor_generar_formulario | `{caso_id}` | artefacto UUID con SHA-256, mapeo, advertencias, borrador y firma pendiente |
| proveedor_armar_paquete | `{caso_id, formulario_id, fecha_evaluacion?}` | ZIP, formulario, manifiesto, soportes, pendientes y elegibilidad para simulación |
| proveedor_simular_envio | `{caso_id, paquete_id}` | destinatario obtenido de solicitud, estado simulado, envío real falso, firma pendiente |

`fecha_evaluacion` es una opción para pruebas directas y análisis histórico. No se acepta fecha futura, y la simulación vuelve a verificar vigencias con el reloj vigente. El chat no permite inyectar una fecha. El demo inyecta un reloj de prueba en la fecha de cada solicitud y lo declara en su salida.

Cada llamada retorna `{ok:true,data}` o `{ok:false,error:{code,message,retryable}}`. Los errores públicos no incluyen valores de secretos, rutas internas, stacks o respuestas crudas del proveedor LLM. Los códigos son `INVALID_INPUT`, `NOT_FOUND`, `INVALID_FIXTURE`, `IO_ERROR`, `CONFIRMATION_REQUIRED`, `INCOMPLETE`, `PORTAL_MANUAL`, `INVALID_OUTPUT`.

## Máquina de estados de autorización

1. El agente emite una pregunta explícita con acción, caso y UUID del artefacto.
2. El siguiente turno del usuario es una afirmación completa e inequívoca (`sí`, `si`, `confirmo`, `confirmar`, `acepto`, `de acuerdo`, `yes`, opcionalmente con punto o exclamación).
3. La autorización se comprueba y consume una sola vez para esa combinación.
4. Cualquier otra respuesta, cambio de caso o turno intermedio cancela la pregunta. Las autorizaciones no provienen del LLM ni de argumentos de herramientas.
5. Empaquetar y simular requieren confirmaciones independientes. Tener un paquete no autoriza enviarlo.

Un paquete incompleto puede generarse como borrador para revisión, después de confirmar. La simulación se bloquea si hay campos obligatorios pendientes, tipos de soporte inexistentes, archivos faltantes o soportes vencidos. La firma permanece pendiente siempre; incluso una simulación exitosa no acredita aptitud para entrega real.

## Matriz de aceptación

| Caso | Resultado histórico esperado | Comprobaciones |
|---|---|---|
| co-industrias-delta | 17 campos mapeados, 4 soportes, ZIP y simulación local | Celdas y cuenta con cero inicial; plantilla reconstruida, firma pendiente |
| ec-corp-andina | 14 campos mapeados; campo opcional desconocido vacío; simulación bloqueada | Falta certificado_cumplimiento_tributario |
| hn-agroexport-sula | 10 campos mapeados; simulación bloqueada | Referencias comerciales no tienen fuente; país conserva CO |
| pa-logistica-istmo | 9 campos mapeados; gestión manual | No formulario binario, no login, carga, envío ni simulación de portal |

## Invariantes verificadas

- Nunca completar un campo con datos de chat o texto libre del modelo.
- Preservar identificaciones y cuentas como strings.
- Validar JSON, existencia física y rutas reales dentro del directorio de fixtures.
- Convertir fallos de plantilla, acceso o generación en resultados recuperables.
- Aislar artefactos por sesión y caso; no permitir descargar otro UUID sin la sesión que lo generó.
- Mantener integridad del formulario generado con SHA-256 antes de incluirlo en un paquete.
- No enviar claves al navegador ni registrar respuestas crudas del LLM.
- Mostrar tool calls, resultados, actividad de procesamiento y confirmaciones.
- Ejecutar los cuatro casos y las cinco herramientas por caso sin LLM; los bloqueos esperados son resultados correctos, no pruebas omitidas.

## Contrato de consultas conversacionales

La intención `consulta` activa lectura y mapeo del caso actual; no genera archivos ni consume permisos. `src/agent/answers.ts` define con Zod el contrato estricto `{status: 'answered' | 'not_available' | 'out_of_scope', evidence_ids: number[]}`. Cada identificador corresponde a una etiqueta, valor y fuente derivados de resultados exitosos de las herramientas de esa sesión y caso. `answered` exige entre 1 y 20 referencias únicas existentes; los otros estados exigen una lista vacía. El servidor rechaza propiedades adicionales, texto libre e identificadores inválidos y construye la respuesta desde la evidencia. Una respuesta válida garantiza procedencia de los valores, no la pertinencia perfecta de la selección del modelo.

Las consultas no modifican el maestro. Un turno de consulta cancela una pregunta de confirmación pendiente. El historial enviado al modelo se limita a cuatro preguntas del mismo caso; no proporciona valores nuevos ni autoridad. Los fallos del proveedor LLM permiten continuar con los comandos y herramientas. El indicador del frontend acredita configuración de clave, no una conexión autenticada exitosa.
