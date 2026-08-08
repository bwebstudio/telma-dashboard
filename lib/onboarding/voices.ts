import type { OnboardingLocale } from './locale'
import { fetchVoices, resolveVoice } from './elevenlabs'

/**
 * The voices a clinic may choose from.
 *
 * `id` is the ElevenLabs voice id and goes straight into `clinics.voice_agent_id`,
 * which is what the voice platform reads when it answers a call. The ids below
 * are placeholders until the real library is cut: they are shaped like
 * ElevenLabs ids so nothing downstream has to change when they are replaced,
 * and every one of them is listed in `PLACEHOLDER_VOICE_IDS` so the app can
 * tell "not chosen yet" from "chosen, and real".
 *
 * The preview is a recording, not a synthesis call. Generating a sample per
 * visitor would put an ElevenLabs charge on every idle browser that opens the
 * form, for a line that is identical every time. One file per voice, served
 * static, is the same experience for none of the cost.
 */

export interface Voice {
  id: string
  /** What the clinic sees, and what lands in `clinics.voice_name`. */
  name: string
  /** One line on how it reads, per language. Not adjectives for their own sake:
   *  the clinic is picking who answers its phone and has nothing else to go on. */
  description: Record<OnboardingLocale, string>
  /**
   * The recording, per language, under the landing's /audio.
   *
   * Per language and not one file, for the reason web/lib/audio.ts already
   * states: playing a Portuguese call to a Spanish clinic undercuts the exact
   * question this step exists to answer. A language with no recording shows no
   * player rather than the wrong voice.
   */
  sample: Partial<Record<OnboardingLocale, string>>
}

// The line every sample says, shown next to the player so the clinic knows it
// is comparing voices and not scripts.
export const SAMPLE_LINE: Record<OnboardingLocale, string> = {
  pt: 'Olá, é da Clínica Serrano, fala a Telma. Em que posso ajudar?',
  es: 'Hola, ha llamado a la Clínica Serrano, le habla Telma. ¿En qué puedo ayudarle?',
}

export const VOICES: Voice[] = [
  {
    id: 'demo-sofia',
    name: 'Sofia',
    description: {
      pt: 'Feminina, calma, português europeu. A escolha por defeito.',
      es: 'Femenina, tranquila, castellano peninsular. La opción por defecto.',
    },
    sample: { pt: '/audio/telma-portugues.mp3', es: '/audio/telma-esp2.mp3' },
  },
  {
    id: 'demo-joao',
    name: 'João',
    description: { pt: 'Masculina, grave, ritmo pausado.', es: 'Masculina, grave, ritmo pausado.' },
    sample: {},
  },
  {
    id: 'demo-raquel',
    name: 'Raquel',
    description: {
      pt: 'Feminina, mais viva, boa para agendas com muito volume.',
      es: 'Femenina, más viva, buena para agendas con mucho volumen.',
    },
    sample: {},
  },
  {
    id: 'demo-matilde',
    name: 'Matilde',
    description: {
      pt: 'Feminina, jovem, informal sem perder a compostura.',
      es: 'Femenina, joven, cercana sin perder la compostura.',
    },
    sample: {},
  },
]

export const DEFAULT_VOICE_ID = 'demo-sofia'

export const VOICE_IDS: string[] = VOICES.map((v) => v.id)

/**
 * Ids that are not yet a real voice. A clinic can finish signing up with one:
 * the sign-up must not block on a voice library that is still being recorded.
 * What it must not do is go live silently, so `completeOnboarding` logs the
 * clinic as needing a voice assigned before its number is answered.
 */
export const PLACEHOLDER_VOICE_IDS: string[] = VOICES.filter((v) =>
  v.id.startsWith('demo-')
).map((v) => v.id)

export function isPlaceholderVoice(id: string | null | undefined): boolean {
  return !!id && PLACEHOLDER_VOICE_IDS.includes(id)
}

export function voiceById(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id)
}

export function voiceName(id: string): string {
  return voiceById(id)?.name ?? id
}

/**
 * Where the sample actually lives.
 *
 * The recordings are served by the landing, not by the panel: they are already
 * there, they are a megabyte and a half each, and a second copy in this repo
 * would be a second thing to keep in sync for no gain. `NEXT_PUBLIC_SITE_URL`
 * is the landing's origin; when it is not set the player is simply not drawn,
 * which is better than a broken audio element.
 */
export function sampleUrl(voice: Voice, locale: OnboardingLocale): string | null {
  const file = voice.sample[locale]
  if (!file) return null
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (!site) return null
  return `${site}${file}`
}

// The one voice ---------------------------------------------------------------

export interface ChosenVoice {
  id: string | null
  name: string | null
  /** ElevenLabs' own hosted sample. Free to play, and usually recorded in
   *  English even for a voice that speaks Portuguese well. */
  previewUrl: string | null
  /** True when no voice is configured. The sign-up still completes. */
  missing: boolean
  /** True when this language had no voice of its own and took the generic one,
   *  so the accent is probably wrong. Written to the activity log. */
  wrongAccentRisk: boolean
}

/**
 * The voice every clinic gets, resolved once on the server.
 *
 * Replaced a picker over thirty-two voices. Resolved from the language the
 * clinic greets in, so the accent is local, and then fixed for good: Telma does
 * not change voice when a caller switches language. See `voiceId()` in
 * elevenlabs.ts for why neither choosing nor switching was right.
 */
export async function theVoice(language?: string | null): Promise<ChosenVoice> {
  const { id, match } = resolveVoice(language)
  if (!id) {
    return { id: null, name: null, previewUrl: null, missing: true, wrongAccentRisk: false }
  }

  const found = (await fetchVoices()).find((v) => v.id === id)
  return {
    id,
    name: found?.name ?? id,
    previewUrl: found?.previewUrl ?? null,
    missing: false,
    wrongAccentRisk: match === 'generic',
  }
}
