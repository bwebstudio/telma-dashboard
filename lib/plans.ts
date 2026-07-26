import type { PlanType } from './types'

// Monthly call limit and list price per plan. Kept in sync with the landing.
// Voice cost per minute is an internal estimate used to watch the margin.
export const PLAN_LIMITS: Record<PlanType, number> = {
  essencial: 250,
  clinica: 600,
  rede: 1500,
  personalizado: 1500,
}

export const PLAN_PRICE: Record<PlanType, number | null> = {
  essencial: 99,
  clinica: 199,
  rede: 399,
  personalizado: null,
}

// Rough internal cost estimate per voice minute, in euros. Adjust to the
// real contract with the voice provider.
export const VOICE_COST_PER_MINUTE = 0.09
