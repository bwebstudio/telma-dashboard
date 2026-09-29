import type { PlanType } from './types'

// Monthly allowance and list price per plan. Kept in sync with the landing.
//
// The allowance is in minutes of conversation, not calls: that is the unit the
// landing sells and the unit the voice provider bills. The call figure shown
// next to it ("about 300 calls") is an illustration, not the limit.
export const PLAN_MINUTES: Record<PlanType, number> = {
  essencial: 250,
  clinica: 700,
  rede: 1750,
  personalizado: 1750,
}

export const PLAN_PRICE: Record<PlanType, number | null> = {
  essencial: 99,
  clinica: 249,
  rede: 599,
  personalizado: null,
}

// What one location beyond the three included in Rede costs, and the minutes it
// adds. Rede is billed per group, not per location.
//
// 400 and not 500: at 500 the extra site sold the minute at 0.298 EUR against a
// cost of 0.222, the same 26% that Rede itself had before 0052. An add-on
// bought by the customers who use it most is the last place to leave a thin
// margin.
export const EXTRA_SITE_PRICE = 149
export const EXTRA_SITE_MINUTES = 400

/**
 * Charged to the clinic for each minute beyond the plan allowance.
 *
 * ── WHY IT IS 0.45 AND NOT 0.35 ────────────────────────────────────────────
 * This number is not only what an extra minute costs. It is what decides
 * whether anybody ever moves up a plan, and that is easy to miss until the
 * arithmetic is written down:
 *
 *   moving up is worth it only when the minutes a plan adds
 *   are worth more than the price it adds, at this rate.
 *
 *   Essencial to Clínica  +150 €  needs a gap of more than 150/0.45 = 333 min
 *   Clínica to Rede       +350 €  needs a gap of more than 350/0.45 = 778 min
 *
 * ── AND THE SAME TEST AGAINST THE PACK, WHICH IS THE ONE THAT BITES ────────
 * That test is not enough on its own, and missing it nearly shipped a ladder
 * nobody would ever climb. Nobody tops up at the loose price when a pack is
 * cheaper, so the rung has to beat the pack, not the loose minute:
 *
 *   Essencial to Clínica  +150 €  needs a gap of more than 150/0.356 = 421 min
 *   Clínica to Rede       +350 €  needs a gap of more than 350/0.356 = 983 min
 *
 * The gaps are 450 and 1050, so both hold, against both prices. With the pack
 * at 79 € (0.316 a minute) they would have had to be 475 and 1108, and a
 * Clínica needing Rede's minutes would have bought packs for ever: 300 € of
 * packs against 350 € of upgrade.
 *
 * Margin here is 51% against a variable cost of 0.2225, better than any plan's,
 * which is right: an extra minute carries none of the fixed cost a plan does.
 */
export const EXTRA_MINUTE_PRICE = 0.45

/**
 * What one minute of conversation costs us, in euros.
 *
 * ── MEDIDO, DESPUÉS DE DOS INTENTOS EQUIVOCADOS ────────────────────────────
 * Decía 0,120 con un comentario pidiendo que se ajustara a las facturas.
 * Ajustarlo salió mal dos veces, y las dos merecen quedar escritas para que no
 * se repitan:
 *
 *   0,171  se dividió el total de créditos de la factura entre los minutos
 *          hablados. Ese total incluye las pruebas de voz del panel, que no
 *          son conversación, y se supuso que Creator traía 100.000 créditos.
 *          Trae 121.000.
 *   0,109  se tomó la tarifa publicada de ElevenAgents, 0,080 $ el minuto.
 *          Es la de sus planes de Agents; en un plan normal el uso sale del
 *          mismo saco de créditos, y sale más caro.
 *
 * Lo que hay debajo está medido, no supuesto. `/v1/usage/character-stats` con
 * `breakdown_type=product_type` separa el consumo:
 *
 *   Conversational AI        84.356 créditos   699 por minuto
 *   Conversational AI - LLM  16.170 créditos   134 por minuto
 *   TTS                       3.999 créditos   pruebas, no cuentan
 *
 * sobre los 120,6 minutos que el registro del agente tiene en ese período. Son
 * 834 créditos por minuto. Creator cuesta 22 $ por 121.000, o sea 0,00018182 $
 * el crédito, y al cambio de la propia factura, 0,9068:
 *
 *   834 x 0,00018182 x 0,9068 = 0,137 € el minuto de ElevenLabs
 *
 * Lo demás sigue siendo estimación: el minuto entrante de Twilio y las
 * transferencias a una persona, los dos del comentario original.
 *
 * ── Y BAJA SI SE PASA A UN PLAN DE AGENTS ──────────────────────────────────
 * Su tarifa de ElevenAgents es 0,080 $ el minuto, unos 0,073 €, la mitad de lo
 * que pagamos ahora por el mismo minuto saliendo de créditos. Vale la pena
 * mirarlo antes de firmar la primera clínica, porque es la palanca más grande
 * que hay sobre este número.
 */
export const VOICE_COST_PER_MINUTE = 0.137 + 0.016 + 0.004

/**
 * What one message to a patient costs us.
 *
 * Two segments, always: "está", "marcação" and "revisión" carry accents that do
 * not exist in the GSM-7 alphabet, and a single character outside it cuts the
 * segment from 160 characters to 70. Stripping the accents would halve this and
 * make a clinic's own message to its own patients read like a scam.
 *
 * Not in any plan, deliberately: a confirmation is part of what the clinic
 * bought, not an extra it chose to send. It is here so that the margin can be
 * counted honestly rather than so that anybody can be billed for it.
 *
 * The 0.07 is an estimate. Twilio's console has the real figure per country and
 * it differs between Portugal and Spain.
 */
export const MESSAGE_COST = 2 * 0.07
