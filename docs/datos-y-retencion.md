# Qué se guarda, dónde, quién lo toca y cuánto dura

Para el anexo de tratamiento de datos del contrato con cada clínica.
Última revisión: 17 de agosto de 2026, versión de prompt `2026-08-17.1`.

Cada línea es verificable en el código o leyendo la configuración del
proveedor. Lo que **no** he podido verificar desde aquí está marcado como
tal y no lo he rellenado por aproximación: en un anexo contractual, un dato
plausible es peor que un hueco, porque el hueco se pregunta y el plausible
se firma.

---

## 1. Datos que se tratan

| Dato | Dónde vive | Retención | Verificado |
|---|---|---|---|
| Grabación de audio de la llamada | ElevenLabs | **7 días**, con borrado efectivo | sí, leído de la API |
| Transcripción de la llamada | ElevenLabs | **7 días**, borrado junto con el audio | sí, leído de la API |
| Transcripción de la llamada | nuestra base | **no se guarda** | sí: la columna existe y ningún código la escribe |
| Resumen de la llamada | nuestra base | **90 días** | sí, `purge_expired()` |
| Teléfono de quien llama | nuestra base | **90 días** | sí, `purge_expired()` |
| Duración, resultado, clínica | nuestra base | indefinido (facturación, no identifica) | sí |
| URL de la grabación | nuestra base | **7 días** | sí, `purge_expired()` |
| Nombre y teléfono del paciente de una cita | nuestra base | mientras la clínica sea cliente, **+30 días** | sí, `purge_expired()` |
| Motivo de la cita | nuestra base | igual que la cita | sí |
| Registro de actividad del panel | nuestra base | **12 meses** | sí, `purge_expired()` |
| Correo y datos de contacto de la clínica | nuestra base | mientras sea cliente | sí |

### El motivo de la cita ya no es texto libre

Desde `2026-08-17.1` el campo guarda **el servicio de la agenda** que la
clínica configuró, no lo que el paciente dijo. Antes guardaba sus palabras
("lifting" en vez de "consulta de valoración"), lo cual era un dato de
salud literal con retención indefinida.

Lo que el paciente cuente sobre su estado se queda en la conversación y,
pasados 7 días, no queda en ninguna parte.

---

## 2. Encargados y subencargados

| Proveedor | Para qué | Qué datos personales ve |
|---|---|---|
| **ElevenLabs** | voz del agente, reconocimiento y transcripción | audio y transcripción íntegros: todo lo que se diga en la llamada, incluida información de salud |
| **Supabase** | base de datos y autenticación | todo lo de la tabla anterior |
| **Vercel** | alojamiento de la aplicación y del alta | los datos pasan por sus servidores en tránsito; no se almacenan allí |
| **Twilio** | numeración telefónica | metadatos de la llamada y, si graba, audio (**pendiente**: aún no hay número conectado) |
| **Stripe** | cobro de las suscripciones | datos de la clínica como cliente, no de pacientes |
| **Resend** | el correo de alta a la clínica | correo de la clínica, no de pacientes |

### Redacción automática: no disponible

ElevenLabs ofrece redacción de entidades, con una familia `medical` que
cubre condición, medicación y procedimiento. **Está reservada a plan
enterprise** y nuestro espacio de trabajo no la tiene. Respuesta literal
de la API:

> `Conversation history redaction is not available for this workspace.`
> `This feature requires an enterprise subscription.`

Consecuencia: durante esos 7 días, la transcripción alojada en ElevenLabs
contiene lo que el paciente dijera, sin redactar. Es la razón por la que
la ventana es de 7 días y no de 30.

---

## 3. Lo que NO he podido verificar desde aquí

Estos tres huecos son los que bloquean el anexo. Ninguno se puede
responder leyendo nuestro código:

1. **Región del proyecto de Supabase.** Se ve en el panel de Supabase, en
   Project Settings, General. Hace falta que sea UE para que el anexo diga
   que no hay transferencia internacional.
2. **Región de despliegue de Vercel.** No hay `vercel.json` en el
   repositorio, así que usa la región por defecto del proyecto. Se ve en
   Project Settings, Functions.
3. **Residencia de datos de ElevenLabs.** La API de suscripción no la
   expone y su cabecera de respuesta indica infraestructura de Google
   Cloud. Hay que preguntárselo a ElevenLabs por escrito y guardar la
   respuesta: es un subencargado que trata datos de salud.

---

## 4. Pendientes conocidos

- **Locución de aviso de grabación previa al agente.** Hoy el aviso lo da
  Telma dentro de su primera frase. El interruptor para que deje de darlo
  ya existe (`noticeAlreadyPlayed`), y se activa cuando la capa telefónica
  reproduzca la locución.
- **Cuándo empieza a grabar Twilio.** Si la grabación arranca al descolgar
  y no al conectar con el agente, hay audio anterior al aviso. **Primera
  medición a hacer en cuanto haya número conectado**, antes de cualquier
  llamada real de cliente.
- **Derecho de supresión.** Hoy no hay forma de borrar los datos de un
  paciente concreto a petición suya. `purge_expired()` borra por antigüedad,
  no por persona.
