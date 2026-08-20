# Registrar cada llamada, la haga Telma o no

## Lo que pasó

Alguien insultó a Telma cuatro veces. Ella lo llevó bien: desactivó, avisó una
vez, y terminó la llamada agradeciendo. Después dijo *"voy a dejarlo
registrado"* y **no lo registró**: colgó con `end_call` sin llamar a la
herramienta de registro.

Resultado: la clínica pagó cinco minutos y medio y **no tiene constancia de que
sonara el teléfono**.

La causa es la de siempre. La regla de registrar vive dentro del procedimiento
de reservar, y esa llamada nunca entró ahí.

## Los dos arreglos

**En el briefing**, registrar sale de reservar y pasa a la despedida, que es por
donde salen todas las llamadas: quien llamó a preguntar un precio, o a
insultar, también es una llamada que la clínica pagó.

**Y por debajo**, para que no dependa de que ella se acuerde: ElevenLabs puede
enviarnos cada conversación terminada por su cuenta. `/api/webhook/post-call`
la recibe y la registra, con la duración real de la plataforma en vez de la que
el modelo creía cuando llamó a la herramienta.

Las dos vías usan el identificador de conversación como clave, así que la
segunda en llegar corrige a la primera en lugar de duplicarla, y los minutos se
cuentan una sola vez.

## Cómo activarlo

Son dos pantallas distintas y esa es la parte confusa: en la primera se **crea**
el endpoint, y en otra se le **dice a las llamadas** que lo usen. Ninguno de los
tres eventos que ofrece la primera es el nuestro.

**1. Settings, Webhooks, Add endpoint**

- *Endpoint URL*: la de verdad, no el marcador.
  `https://telma-dashboard-demo.vercel.app/api/webhook/post-call`
- *Description*: opcional. "Registro de llamadas de Telma" sirve.
- *Select events*: **ninguno de los tres.** Son de otras partes del producto
  (voces, transcripción suelta, imagen y vídeo). Las llamadas se asignan en el
  paso 3. Si la pantalla obligara a marcar uno, marca *Transcription
  completed*: nuestro endpoint responde a cualquier cosa que no sea una
  llamada con un "no es para mí" y no guarda nada.
- Add endpoint.

**2. Copiar el secreto**

Al crearlo enseña un *signing secret*. Es la única vez que se ve entero.

Va a Vercel, proyecto de la demo, Settings, Environment Variables:

    ELEVENLABS_POST_CALL_SECRET = <el secreto>

Y hace falta un despliegue nuevo para que la variable exista. Hasta entonces el
endpoint rechaza todo con un 401, que es lo correcto: sin secreto no puede
distinguir a ElevenLabs de cualquiera.

**3. Asignarlo a las llamadas**

En Conversational AI, Settings, en el bloque de webhooks, seleccionar ese
endpoint como el de post-llamada. Ese ajuste es el que hoy está vacío
(`post_call_webhook_id: null`) y es el que hace que se envíe algo.

**4. Comprobarlo**

Una llamada corta por el simulador, sin reservar nada. Tiene que aparecer en
Conversas. Si no aparece, en la pestaña *Request Log* de ElevenLabs se ve si
salió y qué contestamos.

Para producción, lo mismo con el dominio real y su propio secreto.

## Por qué no puedo hacerlo yo

La clave de API tiene permiso para agentes y herramientas, y no para webhooks:

    The API key you used is missing the permission webhooks_write

Si le añades ese permiso, la próxima vez lo dejo montado sin que toques nada.

El endpoint rechaza cualquier petición sin firma válida, y rechaza también las
firmadas hace más de media hora, para que una copiada de un registro no sirva
después.

## Lo que no hace

No guarda la transcripción. La columna se eliminó a propósito y la
transcripción vive en ElevenLabs siete días. Aquí queda la duración, el
resultado, el número de quien llamó y el resumen.
