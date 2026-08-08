import { isDemo } from '@/lib/demo/config'

/**
 * The simulated call: what it can end as, and who is allowed to run one.
 *
 * The point of the tool is that it is not a mock. It calls the same
 * `available_slots` and `record_call` the voice webhook calls, so what it
 * proves is that the real path works: the booking lands in the agenda, the
 * meter moves, the activity feed gets its line. A simulator that wrote its own
 * rows would only ever prove that the simulator works.
 *
 * What it does not do is invent behaviour. When the minutes are gone the real
 * system offers no times, so the simulation books nothing and says so. There is
 * no "reserved pending payment" state, because there is none in the product.
 */

export type MockCallResultType = 'marcacao' | 'transferida' | 'informacao'

export const MOCK_RESULT_TYPES: MockCallResultType[] = ['marcacao', 'transferida', 'informacao']

export type MockCallOutcome =
  | 'booked'
  | 'no_minutes'
  | 'no_slots'
  | 'transferred'
  | 'informed'
  | 'error'

/** Which of the calls the voice agent makes, and how it went. */
export interface MockCallStep {
  key: 'context' | 'availability' | 'appointment' | 'call'
  state: 'ok' | 'blocked' | 'skipped'
  /** A value worth showing next to the step, already formatted. */
  detail?: string
}

export interface MockCallReport {
  outcome: MockCallOutcome
  error?: 'forbidden' | 'unavailable' | 'clinic' | 'generic'
  patient_name: string
  duration_seconds: number
  minutes_deducted: number
  minutes_before: number
  minutes_after: number
  allowance: number
  /** ISO instant of the booking, when one was made. */
  appointment_at: string | null
  steps: MockCallStep[]
}

/**
 * Where the simulator exists at all.
 *
 * Not in production, ever. Two reasons, and either would be enough: a
 * simulated call writes a real booking into a real clinic's agenda, which the
 * receptionist would answer for, and it spends real minutes the clinic pays
 * for. The administrator visiting a client's panel could not run one anyway —
 * a visit is read only — so in production there is nobody left who should.
 *
 * The browsable demo keeps it, because the demo has no database to damage and
 * showing the whole loop is the only thing the demo is for.
 */
export function mockCallsEnabled(): boolean {
  return isDemo() || process.env.NODE_ENV !== 'production'
}

/** Marks every row a simulation wrote, so they can be told apart and removed. */
export const MOCK_REF_PREFIX = 'mock-call:'
export const MOCK_SUMMARY_PREFIX = '[Simulação]'

export const MOCK_DURATION_MIN = 2
export const MOCK_DURATION_MAX = 10
/** How far ahead the agent looks for a free time before giving up. */
export const MOCK_SLOT_WINDOW_DAYS = 7
