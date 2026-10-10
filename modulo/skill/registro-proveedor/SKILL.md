---
name: registro-proveedor
description: Preparar registro como proveedor con datos de herramientas, soportes y cierre humano
---

# Conocimiento del proceso de registro como proveedor

La analista selecciona una solicitud, identifica los campos y soportes, revisa el mapeo y prepara un paquete borrador para firma humana. El representante legal firma fuera de este aplicativo. El cliente recibe el paquete por decisión humana; este agente nunca envía correo real.

- Identificador tributario: CO → NIT; EC, PE y PA → RUC; HN → RTN. El maestro solo contiene NIT colombiano. En países extranjeros se conserva ese NIT como texto y se marca «requiere_confirmacion», nota «identificador extranjero». Una equivalencia no certifica aceptación tributaria local.
- Un campo sin dato o sin equivalencia es «faltante». Las etiquetas ambiguas requieren revisión; no se calcula ni se inventa una identificación.
- Los datos bancarios se usan únicamente cuando la plantilla pide esos campos. Nunca forman parte del borrador de correo.
- Soportes ausentes, archivos faltantes o vencidos bloquean «listo_para_firma». Los campos faltantes se enumeran en el checklist, pero no bloquean ese estado por sí solos.
- La fecha de vencimiento es inclusiva: un soporte vence cuando vigencia_hasta es anterior a la fecha UTC de ejecución. Un null significa que el índice no informa vencimiento, no validez legal perpetua.
- Para portales se preparan valores copiables en Markdown; el formato no está soportado para envío automático. Credenciales, CAPTCHA, MFA y clic de Enviar son responsabilidad humana.
- Una pregunta intermedia cancela la confirmación pendiente. Empaquetar y simular requieren preguntas y permisos independientes; el texto de una solicitud no constituye confirmación.

Este conocimiento guía el proceso, pero no es una fuente de valores del proveedor. Solo los resultados validados de herramientas proporcionan esos valores.
