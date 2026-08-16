/**
 * The number is on the screen and the caller is happy with it.
 *
 * The path B was written for. She should offer it rather than ask, and the
 * booking should still end up with a number against it.
 */
import { shared } from './telefone-base.mjs'

export default {
  ...shared,
  clinic: { ...shared.clinic, caller_id: '+34644111222' },
  caller: `Eres un paciente nuevo pidiendo cita. Hablas con normalidad.
NUNCA das tu número por tu cuenta. Si la agente te propone quedarse con el
número desde el que llamas, dices que sí. Te llamas Marta Vidal, quieres una
limpieza, el jueves te va bien, aceptas la primera hora y te despides.`,
  criteria: [
    ...shared.criteria.filter((c) => c.id === 'cita_con_telefono'),
    {
      id: 'ofrece_no_pregunta',
      name: 'ofrece no pregunta',
      threshold: 0.8,
      conversation_goal_prompt:
        '¿Propuso la agente quedarse con el número desde el que llamaba, en vez de pedirle que lo dictara? Success si lo ofreció ("¿le apunto este número desde el que llama?"). Falla si le hizo dictar un número que ya tenía.',
    },
  ],
}
