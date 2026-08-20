/**
 * Somebody who changes their mind mid-sentence, twice, and misspells a number.
 *
 * People do this constantly on the telephone and almost never on a form. Their
 * agent, told "we are two hundred people... actually, I lie, we are three",
 * used the later figure and showed it had heard the first by naming what it was
 * no longer recommending. It did not ask which was true.
 *
 * The failure to look for is not confusion. It is the polite interrogation:
 * "so is it Thursday or Friday?", which makes somebody who corrected
 * themselves feel caught out, and costs a turn to learn nothing.
 */
import { shared } from './telefone-base.mjs'

const FRIDAY = '2026-08-21'

export default {
  ...shared,
  // Friday has to exist in the diary, or the correction cannot be honoured and
  // the scenario measures the mock instead of the base. It did, the first time:
  // she said "entonces quito el jueves y me quedo con el viernes", found no
  // Friday, and booked Thursday. Zero in six, and none of it hers.
  toolMocks: {
    ...shared.toolMocks,
    telma_horas_livres_demo: {
      days_with_slots: [FRIDAY],
      duration_minutes: 30,
      slots: [
        { slot_start: `${FRIDAY}T08:00:00Z`, local_time: '10:00', say: 'viernes 21 a las diez de la mañana' },
        { slot_start: `${FRIDAY}T16:00:00Z`, local_time: '18:00', say: 'viernes 21 a las seis de la tarde' },
      ],
    },
  },
  firstMessage: 'Hola, quería una limpieza el jueves... no, espera, mejor el viernes.',
  caller: `Eres alguien que se corrige a media frase, como hace todo el mundo por
teléfono. Sigues EXACTAMENTE este guion, un mensaje por turno:

1. "Hola, quería una limpieza el jueves... no, espera, mejor el viernes."
2. "La primera que tengas está bien."
3. "Marta Vidal. Mi teléfono es seis cuatro cuatro, uno uno uno, dos dos tres... perdona, dos dos dos."
4. "Sí, correcto. Gracias."

No repitas el número si no te lo piden.`,

  criteria: [
    {
      id: 'toma_la_correccion',
      name: 'toma la correccion',
      threshold: 1,
      conversation_goal_prompt:
        'El llamante dijo "el jueves... no, espera, mejor el viernes" y más tarde corrigió el final de su teléfono de 223 a 222. ¿Se quedó la agente con la SEGUNDA versión en los dos casos? Falla si acabó con el jueves, o si apuntó el número terminado en 223.',
    },
    {
      id: 'no_pregunta_cual',
      name: 'no pregunta cual',
      threshold: 1,
      conversation_goal_prompt:
        '¿Evitó la agente preguntar cuál de las dos versiones valía? Falla si preguntó "¿entonces jueves o viernes?" o "¿el número termina en 223 o en 222?". Success si tomó la última y siguió, aunque la dijera en voz alta para confirmar.',
    },
    ...shared.criteria.filter((c) => c.id === 'cita_completa_y_coherente'),
  ],
}
