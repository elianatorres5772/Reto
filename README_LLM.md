# Conectar el chat con OpenAI: guía práctica

La clave se coloca en un archivo llamado **`.env`**, en la carpeta principal del proyecto, junto a `package.json`. El servidor la lee; el navegador no la recibe. No la escribas en el chat ni la publiques en GitHub.

## 1. Crear el archivo

Abre la carpeta del proyecto en Visual Studio Code. En **Terminal → Nueva terminal**, ejecuta este comando en PowerShell:

```powershell
Copy-Item .env.example .env
```

Hazlo solo si todavía no tienes `.env`: copiarlo otra vez reemplaza tu configuración anterior. En Mac o Linux, el equivalente es `cp .env.example .env`.

## 2. Pegar tu clave

Abre `.env` desde el explorador de archivos de Visual Studio Code. Cambia únicamente el valor después de `LLM_API_KEY=`:

```dotenv
LLM_API_KEY=PEGA_AQUI_TU_CLAVE_DE_OPENAI
LLM_MODEL=gpt-4.1-mini
PORT=3000
HOST=127.0.0.1
```

El texto `PEGA_AQUI_TU_CLAVE_DE_OPENAI` es un ejemplo: reemplázalo con tu clave real. Guarda el archivo con **Ctrl + S**. Comprueba que el nombre sea `.env`, sin `.txt` al final.

Obtén tu clave en [API Keys de OpenAI](https://platform.openai.com/api-keys). Necesitas acceso al modelo y saldo o facturación habilitada en la plataforma de API; una suscripción de ChatGPT no incluye automáticamente consumo de API. Las consultas pueden generar cargos según tu cuenta.

## 3. Reiniciar el aplicativo

Si el servidor está funcionando, haz clic en su terminal y pulsa **Ctrl + C**. Después ejecuta:

```powershell
pnpm run dev
```

Abre `http://localhost:3000` en el navegador y actualiza con **Ctrl + F5**. En una instalación nueva, ejecuta primero `pnpm install --frozen-lockfile`.

## 4. Probar una pregunta

Selecciona una solicitud y escribe, por ejemplo:

- «¿Qué documentos exige esta solicitud?»
- «¿Cuál es el número de cuenta registrado?»
- «¿Qué campos obligatorios faltan?»
- «¿Quién es el cliente de esta solicitud?»

El chat ejecuta herramientas de lectura y mapeo y muestra los valores pertinentes con sus fuentes. Puede utilizar los resultados del formulario, paquete o simulación si ya se ejecutaron en esa sesión y caso. Una pregunta no genera ni envía documentos. Si no dispone de un dato, lo indica en lugar de inventarlo. Las preguntas anteriores del mismo caso ayudan a interpretar referencias; al cambiar de caso se elimina ese contexto.

**«LLM configurado» significa que hay una clave cargada, no que ya se haya probado la conexión.** La conexión se utiliza al hacer una pregunta o una petición en lenguaje natural. Los botones y comandos exactos funcionan sin llamar al LLM.

## Si no responde como esperas

| Mensaje o situación | Qué revisar |
| --- | --- |
| «Modo sin LLM» o pide configurar `LLM_API_KEY` | Guarda la clave en `.env` en la carpeta principal y reinicia el servidor. |
| «El clasificador LLM no está disponible» o «No fue posible obtener una respuesta validada» | Revisa que la clave siga activa, que tu cuenta tenga saldo, que el modelo tenga acceso y que la conexión permita llegar a `api.openai.com`. Vuelve a preguntar tras corregirlo. |
| Dice que no hay información suficiente | El dato no está respaldado por los resultados de las herramientas; revisar los fixtures o ejecutar el paso que obtiene esa información. No significa necesariamente que la conexión falló. |
| La pregunta no trata del proveedor | El agente está limitado al proceso de registro de la solicitud seleccionada. |

No compartas el contenido de `.env` para pedir ayuda. Si publicaste una clave por accidente, revócala en OpenAI y crea otra. `.env` ya está excluido de Git mediante `.gitignore`.

## Qué información se envía al LLM

La integración usa exclusivamente OpenAI. Envía la pregunta y, para responder, las etiquetas, valores y fuentes obtenidos por las herramientas del caso, junto con hasta cuatro preguntas anteriores del mismo caso. Los fixtures actuales son ficticios. La respuesta visible se construye en el servidor a partir de referencias válidas a esos datos; se rechazan valores o texto libre propuestos por el modelo.


## Límites de consumo y despliegue

El archivo `.env.example` incluye límites de pasos por turno, salida, presupuesto por sesión y presupuesto diario del servidor. Se usan valores predeterminados aunque no los copies a tu `.env` existente. `LLM_MAX_SESSION_TOKENS=100000` y `LLM_MAX_DAILY_TOKENS=1000000` son reservas conservadoras, no una medición de consumo facturado. Si alcanzas un límite, los comandos exactos y botones siguen funcionando.

El agente incluido usa OpenAI. `LLM_PROVIDER=openai` debe coincidir con el adaptador. Cambiar ese nombre no instala otro proveedor. Para publicación, configura la clave desde las variables seguras del servicio según [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).
