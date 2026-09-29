# Qué se guarda, dónde, quién lo toca y cuánto dura

Para el anexo de tratamiento de datos del contrato con cada clínica.
Última revisión: 24 de agosto de 2026, versión de prompt `2026-08-17.1`.

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
| Transcripción de la llamada | nuestra base | **no se guarda, y ya no se puede guardar** | sí: la columna se eliminó en la migración 0041 |
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
| **ElevenLabs** | voz del agente, reconocimiento y transcripción | audio y transcripción íntegros: todo lo que se diga en la llamada, incluida información de salud. **Almacenado en EE. UU.**, transferencia cubierta por las CCT de la Decisión 2021/914 (ver punto 3.3) |
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

Estos huecos son los que bloquean el anexo, y ninguno se puede responder
leyendo nuestro código. Dos de los tres ya están contestados.

1. **Región del proyecto de Supabase.** Se ve en el panel de Supabase, en
   Project Settings, General. Hace falta que sea UE para que el anexo diga
   que no hay transferencia internacional.
2. ~~**Región de despliegue de Vercel.**~~ **Contestado, y era la respuesta
   mala.** Las cabeceras decían `x-vercel-id: cdg1::iad1`, es decir que las
   funciones se ejecutaban en Washington: los datos de pacientes se trataban
   fuera del Espacio Económico Europeo en cada consulta. Ya hay un
   `vercel.json` que las fija en París (`cdg1`), y el cambio entra con el
   siguiente despliegue. Ver `region.md`.
3. ~~**Residencia de datos de ElevenLabs.**~~ **Contestado el 19 de agosto
   de 2026, y hay que leerlo entero antes de firmar nada.** Legal respondió
   remitiendo a sus documentos públicos, que dicen esto:

   - **Almacenan en Estados Unidos, siempre.** Política de privacidad
     (actualizada el 20 de mayo de 2026): *"Regardless of your location,
     all Personal Data will be transferred to the United States for
     storage."* Proveedor de infraestructura citado como ejemplo: Google
     Cloud, con ubicaciones en EE. UU., Países Bajos y Singapur.
   - **Hay DPA en vigor y no hay que firmarlo.** `elevenlabs.io/dpa`
     (8 de abril de 2026) se incorpora por referencia a los términos, así
     que ya nos aplica. Incorpora las Cláusulas Contractuales-Tipo de la
     Decisión 2021/914, módulo responsable a subencargado o subencargado a
     subencargado según el caso, *"deemed executed upon this DPA taking
     effect"*. Ese es el mecanismo de transferencia que el anexo debe citar.
   - **Lista de subencargados** en `compliance.elevenlabs.io`, con 30 días
     de preaviso y derecho de oposición fundamentada. La lista en sí es un
     visor JavaScript que hay que abrir a mano: **queda por copiar**.
   - **Residencia en la UE existe y es de plan enterprise.** *"Data
     residency is an Enterprise feature."* Y aun con ella activada,
     *"processing may nevertheless occur outside of the selected location...
     for support purposes, and for content moderation purposes"*, salvo que
     se combine con Zero Retention Mode, que también es enterprise.
   - **Zero Retention Mode: enterprise, solo API, y discrecional.** Cubre
     inputs y outputs de la API, no el uso por interfaz, y puede
     restringirse *"at ElevenLabs' sole discretion"*.
   - **El anexo I del DPA declara los datos sensibles como `N/A`.** Es
     decir, la plantilla no contempla datos del artículo 9. Para un
     despliegue sanitario europeo esto es lo que hay que mirar con un
     abogado, más que la residencia.
   - **Los términos prohíben enviar PHI sin BAA firmado**, y el BAA es
     enterprise. PHI es una definición de HIPAA, ley estadounidense, y una
     clínica dental portuguesa no es una *covered entity*, así que
     probablemente no nos aplica. **Probablemente no es suficiente en un
     anexo contractual: esto lo decide un abogado, no nosotros.**

   Patrón que conviene nombrar: redacción automática, residencia europea,
   retención cero y BAA son la misma puerta, y es enterprise. Cuatro cosas
   distintas contra las que hemos chocado son una sola decisión de coste.

---

## 4. Derecho de supresión

La clínica lo ejecuta desde su propio panel, en **Mi clínica**, sin pasar por
nosotros: la petición le llega a ella y el plazo legal es de un mes, que se
consumiría en correos si tuviera que pedírnoslo.

Busca por teléfono, enseña lo que hay antes de tocar nada, y al confirmar:

- **Las citas se anonimizan, no se borran.** Pierden nombre y teléfono; el
  día, la hora y el servicio se mantienen, porque esa fila también es el
  registro de una tarde que la clínica trabajó y facturó.
- Las llamadas de ese número pierden número, resumen y grabación.
- Las líneas del registro de actividad que llevan su nombre se eliminan.
- Queda constancia en la tabla `erasures`: fecha, quién lo hizo, cuántas
  filas y la referencia que la clínica quiera anotar. **Sin el teléfono y sin
  el nombre**: guardar un hash de nueve dígitos es guardar el número con
  pasos extra, y en una tabla creada para demostrar que borramos.

## 5. Pendientes conocidos

- **Locución de aviso de grabación previa al agente.** Hoy el aviso lo da
  Telma dentro de su primera frase. El interruptor para que deje de darlo
  ya existe (`noticeAlreadyPlayed`), y se activa cuando la capa telefónica
  reproduzca la locución.
- **Cuándo empieza a grabar Twilio.** Si la grabación arranca al descolgar
  y no al conectar con el agente, hay audio anterior al aviso. **Primera
  medición a hacer en cuanto haya número conectado**, antes de cualquier
  llamada real de cliente.
- **Cuándo empieza a grabar Twilio**, más abajo.
