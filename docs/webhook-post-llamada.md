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

## Lo que falta para activarlo

1. Generar un secreto y ponerlo en Vercel como `ELEVENLABS_POST_CALL_SECRET`,
   en la demo y en producción.
2. En ElevenLabs, Settings, Webhooks: crear uno de tipo *post-call* apuntando a
   `https://<dominio>/api/webhook/post-call` con ese mismo secreto, y
   asignarlo al agente.
3. Comprobarlo con una llamada corta: tiene que aparecer en Conversas sin que
   Telma haya reservado nada.

El endpoint rechaza cualquier petición sin firma válida, y rechaza también las
firmadas hace más de media hora, para que una copiada de un registro no sirva
después.

## Lo que no hace

No guarda la transcripción. La columna se eliminó a propósito y la
transcripción vive en ElevenLabs siete días. Aquí queda la duración, el
resultado, el número de quien llamó y el resumen.
