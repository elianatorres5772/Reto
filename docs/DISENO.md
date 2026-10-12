# Diseño actual de preparación documental

**Paleta.** El verde de la marca es **#6dfd8c**: botones principales, acentos, bordes destacados, pasos activos, mensajes de la usuaria y tintes suaves del mismo tono en fondos (#e9fff0, #dcffe4, #c4fed1). Como #6dfd8c es muy claro, el texto sobre él es casi negro (#0b2414) y los textos que antes eran verde oscuro pasan a grises neutros (#1a1f1c, #3d4541, #5b6460), para mantener el contraste legible. La cabecera ya no usa imagen de fondo.

La pantalla principal es un flujo de trabajo con entrada de solicitudes, correo, campos, soportes, autorización y descargas. Conserva la paleta verde manzana y usa el fondo de referencia como cabecera. El chat del agente se abre en una ventana modal (`web/chat.js`) desde el botón flotante **Conversar con el agente**: historial, indicador de pensando, tarjetas por herramienta y aviso de confirmación resaltado en ámbar. La captura actual se encuentra en `capturas/front-actual.png`. Se verifican escritorio y un tamaño móvil.

El apartado siguiente documenta el origen de los recursos y el diseño conversacional anterior como historial, no como interfaz vigente.

# Diseño del chat

La interfaz toma como referencia visual la imagen suministrada por el usuario: paleta verde manzana claro con transparencias, fondo fotográfico, marco translúcido, avatar de asistente, sombras suaves y burbujas redondeadas. La marca del aplicativo se mantiene como «proveedor» y no se presenta como el servicio de la referencia.

- `web/index.html`: panel de conversación, bienvenida y controles existentes.
- `web/styles.css`: composición adaptable, estados de foco y movimiento reducido.
- `web/assets/assistant.svg`: avatar vectorial decorativo.
- `web/chat.js`: estado de conexión y procesamiento derivado de la sesión.

Las imágenes se sirven desde el propio aplicativo, sin llamadas a servicios de imágenes externos. El servidor permite únicamente sus rutas explícitas. El diseño no modifica contratos, datos del proveedor, permisos de confirmación ni reglas de simulación.

En escritorio, el chat aparece a la izquierda y la bienvenida junto a la fotografía. En móvil, la bienvenida se coloca arriba y el panel ocupa el ancho disponible. El historial tiene desplazamiento propio; las confirmaciones y el cuadro de mensajes permanecen fuera de ese historial. Las herramientas siguen siendo desplegables y los documentos descargables.

Validación: revisión de capturas en 1440×1080 y 390×844, recursos servidos correctamente, ausencia de desbordamiento horizontal y errores JavaScript, y ejecución de la suite funcional E2E. No se afirma una auditoría exhaustiva de accesibilidad o cobertura en todos los navegadores.

Actualización visual: paneles, botones, burbujas, foco, avatar y tonos del fondo utilizan verde manzana y texto verde oscuro. El fondo anterior se reemplazó por la versión preparada de la nueva referencia. Las transparencias verdes se aplican en CSS, sin incorporarlas a la fotografía. Si se necesita identidad exacta con el original, se debe reemplazar este recurso por el JPG/PNG original disponible como archivo.
