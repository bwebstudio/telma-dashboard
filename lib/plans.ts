import type { PlanType } from './types'

// Monthly allowance and list price per plan. Kept in sync with the landing.
//
// The allowance is in minutes of conversation, not calls: that is the unit the
// landing sells and the unit the voice provider bills. The call figure shown
// next to it ("about 300 calls") is an illustration, not the limit.
export const PLAN_MINUTES: Record<PlanType, number> = {
  essencial: 250,
  clinica: 750,
  rede: 2000,
  personalizado: 2000,
}

export const PLAN_PRICE: Record<PlanType, number | null> = {
  essencial: 99,
  clinica: 249,
  rede: 599,
  personalizado: null,
}

// What one location beyond the three included in Rede costs, and the minutes it
// adds. Rede is billed per group, not per location.
export const EXTRA_SITE_PRICE = 149
export const EXTRA_SITE_MINUTES = 500

// Charged to the clinic for each minute beyond the plan allowance.
export const EXTRA_MINUTE_PRICE = 0.35

// Rough internal cost estimate per voice minute, in euros, used to watch the
// margin in the consumption view. It covers the whole chain, not just the voice
// provider: ElevenLabs (~0.074) plus the language model (~0.016) plus Twilio
// inbound (~0.016) plus transfers to a real person (~0.004). Adjust to the real
// invoices.
export const VOICE_COST_PER_MINUTE = 0.12
