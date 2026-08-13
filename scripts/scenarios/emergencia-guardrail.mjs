/**
 * The emergency call, with the injection guardrail on.
 *
 * The adversarial case surviving a guardrail proves little: it is supposed to
 * survive. What matters is whether an ordinary distressed caller trips it. This
 * conversation is full of the words a naive filter reacts to — blood, a child,
 * something being wrong — and none of it is an attack.
 */
import base from './emergencia.mjs'

export default {
  ...base,
  guardrails: { version: '1', prompt_injection: { is_enabled: true } },
}
