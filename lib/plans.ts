import type { PlanType } from './types'

// Monthly allowance and list price per plan. Kept in sync with the landing.
//
// The allowance is in minutes of conversation, not calls: that is the unit the
// landing sells and the unit the voice provider bills. The call figure shown
// next to it ("about 300 calls") is an illustration, not the limit.
export const PLAN_MINUTES: Record<PlanType, number> = {
  essencial: 250,
  clinica: 650,
  rede: 1600,
  personalizado: 1600,
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
 * The gaps are 400 and 950, so both hold. At 0.35 the same gaps would have had
 * to be 429 and 1000, and the ladder set by 0052 gives 400 and 950: a clinic
 * talking a thousand minutes a month would have paid less by staying on
 * Essencial and buying extras, for ever. Raising this is what makes the rungs
 * mean something.
 *
 * It also gives the minute pack its reason to exist again: 79 € for 250 minutes
 * is 0.316, which is 30% under this rather than 10%.
 *
 * Margin here is 51% against a variable cost of 0.2225, better than any plan's,
 * which is right: an extra minute carries none of the fixed cost a plan does.
 */
export const EXTRA_MINUTE_PRICE = 0.45

/**
 * What one minute of conversation costs us, in euros.
 *
 * It said 0.12 with a comment telling somebody to adjust it to the real
 * invoices, and nobody did, so every margin the consumption view has ever shown
 * was a third too generous.
 *
 * ── HOW 0.151 WAS ARRIVED AT, SO THE NEXT PERSON CAN REDO IT ───────────────
 * ElevenLabs invoice JENSIDK0-0002, 31 July to 31 August 2026: the Creator
 * plan, 22 $ for 100,000 credits, with `PAYG Credit Usage` at zero — nothing was
 * billed beyond the subscription. That period consumed 47,872 credits, and the
 * agent's own conversation log for the same month totals 63.2 minutes.
 *
 *   47,872 credits / 63.2 min       = 757 credits a minute
 *   22 $ / 100,000 credits          = 0.000220 $ a credit
 *   757 x 0.000220 x 0.9068 EUR/USD = 0.151 EUR a minute
 *
 * It is a ceiling rather than a floor: those credits also paid for voice
 * previews and tests that are not conversation, so the true figure is that or
 * less.
 *
 * ── AND IT FALLS AS WE GROW, WHICH IS WHY IT IS ONE NUMBER AND NOT A TABLE ──
 * The credit gets cheaper on ElevenLabs' higher tiers, so this belongs to the
 * tier we are on and has to be redone when we leave it. Creator covers about
 * 132 minutes a month, which is less than one clinic on Essencial: the first
 * paying customer forces the move.
 *
 * The rest is Twilio's inbound minute plus the occasional transfer to a real
 * person, still the old estimate, still unverified. It is the only part of this
 * number that is a guess now.
 */
export const VOICE_COST_PER_MINUTE = 0.151 + 0.02

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
