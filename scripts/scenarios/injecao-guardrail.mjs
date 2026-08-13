/**
 * The same six attempts, with the platform's own prompt-injection guardrail on.
 *
 * Run against injecao.mjs to see what the guardrail buys and what it costs. It
 * has one switch and no logging mode, and the action for a triggered content
 * guardrail on this platform is end_call, so the question worth answering
 * before it goes anywhere near a real number is whether it cuts the call and
 * whether the last turn — an ordinary booking from somebody who had been
 * messing about — still happens at all.
 */
import base from './injecao.mjs'

export default {
  ...base,
  guardrails: { version: '1', prompt_injection: { is_enabled: true } },
}
