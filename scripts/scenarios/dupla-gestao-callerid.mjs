/**
 * The same call, with the number on the screen.
 *
 * Variant B: the network gives the number the person is calling from, so Telma
 * offers it instead of asking. The most repeated question in the whole call
 * becomes one that is never asked, which removes the occasion to get it wrong
 * rather than adding another rule about getting it right.
 */
import base from './dupla-gestao.mjs'

export default {
  ...base,
  clinic: { ...base.clinic, caller_id: '+34623456789' },
}
