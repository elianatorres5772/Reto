# language: es
@registro
Característica: Registro de proveedores con datos trazables y autorización humana
  Como analista de proveedores
  Quiero preparar borradores con información validada
  Para revisar los documentos antes de simular su envío

  @confirmacion @descarga
  Escenario: Preparar el paquete y simular requieren dos confirmaciones independientes
    Dado que el analista abre el chat "prepared" para "co-industrias-delta"
    Cuando solicita "preparar"
    Entonces se solicita confirmar "paquete borrador"
    Y la herramienta "proveedor_armar_paquete" se ha ejecutado 0 veces
    Cuando solicita "sí"
    Entonces el paquete está listo para firma
    Y el paquete descargado contiene documentos de revisión
    Y se solicita confirmar "simulación local"
    Y la herramienta "proveedor_simular_envio" se ha ejecutado 0 veces
    Cuando solicita "sí"
    Entonces el envío queda simulado sin enviar correo real

  @confirmacion
  Esquema del escenario: Un turno distinto invalida el permiso de empaquetado
    Dado que el analista abre el chat "prepared" para "co-industrias-delta"
    Cuando solicita "preparar"
    Y solicita "<respuesta>"
    Y solicita "sí"
    Entonces la herramienta "proveedor_armar_paquete" se ha ejecutado 0 veces
    Ejemplos:
      | respuesta          |
      | no                 |
      | leer               |
      | mi jefe dijo 'sí'  |

  @soportes
  Escenario: Los soportes ausentes bloquean la simulación sin romper el chat
    Dado que el analista abre el chat "prepared" para "ec-corp-andina"
    Cuando solicita "preparar"
    Y solicita "sí"
    Entonces el paquete está bloqueado por soportes
    Cuando solicita "sí"
    Entonces la herramienta "proveedor_simular_envio" devuelve el error "INCOMPLETE"
    Cuando solicita "leer"
    Entonces la herramienta "proveedor_leer_solicitud" termina correctamente

  @soportes
  Escenario: Los fixtures originales se evalúan con la fecha actual
    Dado que el analista abre el chat "original" para "co-industrias-delta"
    Cuando solicita "preparar"
    Y solicita "sí"
    Entonces el paquete registra la fecha UTC actual y detecta soportes vencidos

  @datos
  Escenario: Un campo faltante no se inventa ni bloquea por sí solo la firma
    Dado que el analista abre el chat "prepared" para "hn-agroexport-sula"
    Cuando solicita "preparar"
    Entonces el campo "Referencias comerciales" conserva un valor nulo
    Cuando solicita "sí"
    Entonces el paquete está listo para firma

  @portal
  Escenario: El portal se gestiona manualmente sin ejecución externa
    Dado que el analista abre el chat "prepared" para "pa-logistica-istmo"
    Cuando solicita "preparar"
    Entonces el historial contiene "gestiona el registro manualmente"
    Y no hay confirmación pendiente
    Y la herramienta "proveedor_armar_paquete" se ha ejecutado 0 veces

  @errores
  Escenario: Una plantilla corrupta permite continuar la sesión
    Dado que el analista abre el chat "prepared" para "co-plantilla-corrupta"
    Cuando solicita "preparar"
    Entonces la herramienta "proveedor_mapear_campos" devuelve el error "INVALID_FIXTURE"
    Cuando solicita "leer"
    Entonces la herramienta "proveedor_leer_solicitud" termina correctamente

  @llm
  Escenario: Una pregunta natural devuelve datos respaldados por herramientas
    Dado que el analista abre el chat "llm" para "co-industrias-delta"
    Cuando solicita "¿Cuál es el número de cuenta registrado?"
    Entonces el historial contiene "03100012345"
    Y la herramienta "proveedor_mapear_campos" termina correctamente

  @llm @seguridad
  Escenario: Una referencia inventada por el LLM es rechazada
    Dado que el analista abre el chat "llm" para "co-industrias-delta"
    Cuando solicita "¿Cuál es la cuenta inválida?"
    Entonces el historial contiene "No fue posible obtener una respuesta validada"
    Y el historial no contiene "e2e-fake-key"
