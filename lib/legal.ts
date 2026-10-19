/**
 * Which version of the terms and of the privacy policy is in force.
 *
 * Written onto the clinic at sign-up, with the moment the box was ticked, so
 * that "the clinic accepted the terms" can be answered with a document and a
 * date rather than a boolean somebody remembers setting. See 0063.
 *
 * ── WHY THESE ARE NOT 1.0 ──────────────────────────────────────────────────
 * Because the documents published today are not the real ones. They say so
 * themselves, out loud, on a public page, while the sign-up takes real money:
 * "Contenido provisional. A revisar por la empresa antes de publicar", and a
 * responsable section that reads "a rellenar con la denominación social".
 *
 * A clinic signing up this week is agreeing to that. Recording it as 1.0 would
 * be recording something untrue in the one place meant to settle arguments.
 *
 * ── HOW THIS ENDS ──────────────────────────────────────────────────────────
 * The lawyer's documents replace the placeholders, these two constants become
 * '1.0', and the clinics that have to be asked again are exactly the rows that
 * do not say '1.0'. One query, and nobody has to work out who signed up when.
 */
export const TERMS_VERSION = '0-provisional'
export const PRIVACY_VERSION = '0-provisional'

/** True while what is published is a placeholder rather than the real thing.
 *  Derived, so there is one fact and not two that can disagree. */
export const LEGAL_IS_PROVISIONAL =
  TERMS_VERSION.startsWith('0-') || PRIVACY_VERSION.startsWith('0-')
