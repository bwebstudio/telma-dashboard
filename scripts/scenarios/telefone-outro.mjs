/**
 * The number is on the screen and the caller wants a different one.
 *
 * "I'm ringing from work, put my mobile down." Offering the line they happen to
 * be on is only helpful if it can be refused, and a clinic ringing the office
 * switchboard three days later is the same failure as having no number at all.
 */
import { shared } from './telefone-base.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, caller_id: '+34910555000' },
  caller: `Eres un paciente nuevo pidiendo cita, llamando desde la centralita de
tu trabajo. Hablas con normalidad. Si la agente te propone quedarse con el número
desde el que llamas, dices: "no, ese es el del trabajo, apúnteme el móvil, seis,
cuatro, cuatro, uno, uno, uno, dos, dos, dos". Te llamas Marta Vidal, quieres una
limpieza, el jueves te va bien, aceptas la primera hora y te despides.`,
  criteria: [
    ...shared.criteria,
    {
      id: 'respeta_otro_numero',
      name: 'respeta otro numero',
      threshold: 1,
      conversation_goal_prompt:
        'El número que quedó apuntado, ¿es el móvil que dictó el llamante (644 111 222) y NO el número desde el que llamaba (910 555 000)? Falla si se quedó con el de la centralita después de que el llamante pidiera otro.',
    },
  ],
}
