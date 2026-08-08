import { DEFAULT_ONBOARDING_LOCALE, type OnboardingLocale } from './locale'

/**
 * The voices that actually exist in the ElevenLabs account.
 *
 * Until this file, step 4 offered four placeholders. They were honest about
 * being placeholders and they were still the wrong thing to show a clinic that
 * is about to pay: the one question that step exists to answer is "what will my
 * patients hear", and a name with no recording behind it does not answer it.
 *
 * No SDK, for the same reason as Twilio and Stripe: this is one GET.
 */

const API = 'https://api.elevenlabs.io/v1'
const KEY = process.env.ELEVENLABS_API_KEY

export function elevenLabsConfigured(): boolean {
  return Boolean(KEY)
}

export interface RemoteVoice {
  /** The ElevenLabs voice id. This is what the voice platform is told to use. */
  id: string
  name: string
  /** Free to play and hosted by ElevenLabs, so previewing costs no credits.
   *  Null for a voice with no sample, which the form then draws without a
   *  player rather than with a broken one. */
  previewUrl: string | null
  /** Language codes the voice is verified for, lowercased ('es', 'pt'). Empty
   *  when ElevenLabs says nothing, which is not the same as "no languages". */
  languages: string[]
  description: string | null
}

interface ApiVoice {
  voice_id: string
  name: string
  preview_url?: string | null
  description?: string | null
  labels?: Record<string, string> | null
  verified_languages?: Array<{ language?: string }> | null
  fine_tuning?: { language?: string | null } | null
}

/**
 * Cached for a few minutes.
 *
 * The sign-up page is server rendered on every visit, and the voice list moves
 * about once a quarter. Asking ElevenLabs on every page view would add a round
 * trip to the first paint of the page that has to sell, in exchange for
 * freshness nobody needs.
 */
const TTL_MS = 5 * 60 * 1000
let cache: { at: number; voices: RemoteVoice[] } | null = null

export async function fetchVoices(): Promise<RemoteVoice[]> {
  if (!KEY) return []
  if (cache && Date.now() - cache.at < TTL_MS) return cache.voices

  try {
    const res = await fetch(`${API}/voices`, {
      headers: { 'xi-api-key': KEY },
      cache: 'no-store',
    })
    if (!res.ok) {
      // A wrong key, an expired key, or a key without the voices scope. Logged
      // and swallowed: the sign-up falls back to the built in list rather than
      // failing, because a clinic cannot fix our API key and should not be
      // stopped by it.
      console.error('[elevenlabs] /voices returned', res.status, (await res.text()).slice(0, 200))
      return []
    }

    const body = (await res.json()) as { voices?: ApiVoice[] }
    const voices: RemoteVoice[] = (body.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url ?? null,
      languages: languagesOf(v),
      description: v.description ?? v.labels?.description ?? null,
    }))

    cache = { at: Date.now(), voices }
    return voices
  } catch (e) {
    console.error('[elevenlabs] could not list voices', e)
    return []
  }
}

function languagesOf(v: ApiVoice): string[] {
  const out = new Set<string>()
  for (const entry of v.verified_languages ?? []) {
    if (entry?.language) out.add(entry.language.slice(0, 2).toLowerCase())
  }
  if (v.fine_tuning?.language) out.add(v.fine_tuning.language.slice(0, 2).toLowerCase())
  if (v.labels?.language) out.add(v.labels.language.slice(0, 2).toLowerCase())
  return [...out]
}

/**
 * The voices worth offering to a clinic reading the form in this language,
 * best first.
 *
 * Not filtered down to the language, ranked by it. ElevenLabs' multilingual
 * models speak Spanish and Portuguese with voices that declare neither, so
 * hiding everything unverified would empty the list; and a clinic that prefers
 * a particular voice should be able to reach it. What the order does is stop a
 * Barcelona clinic from having to scroll past thirty English voices to find one
 * that has been checked in Spanish.
 */
export function rankForLocale(
  voices: RemoteVoice[],
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): RemoteVoice[] {
  return [...voices].sort((a, b) => {
    const score = (v: RemoteVoice) => (v.languages.includes(locale) ? 0 : v.languages.length ? 1 : 2)
    const d = score(a) - score(b)
    return d !== 0 ? d : a.name.localeCompare(b.name)
  })
}

// The agent that answers -----------------------------------------------------

/**
 * The agent that answers. There is one, and it is the same for everybody.
 *
 * Not one per specialty, not one per language. This application has always been
 * built around a generic agent that calls `/api/clinic-context` at the start of
 * a conversation and is told who it is speaking for, what that clinic sells, in
 * which language and when it is open. Everything that would otherwise be baked
 * into a prompt is data, and data is what that endpoint serves.
 *
 * A per-specialty agent breaks on the first customer nobody thought of, and a
 * per-language one breaks on the clinic that bought a second language. Both
 * were tried here and both are gone.
 */
export function agentId(): string | null {
  return process.env.ELEVENLABS_AGENT_ID?.trim() || null
}

/**
 * The voice Telma speaks in. One per language, and one per clinic.
 *
 * Two rules that sound contradictory and are not. The **accent has to be
 * local**: a clinic in Lisbon whose receptionist sounds Brazilian, or one in
 * Barcelona whose receptionist sounds Mexican, has a receptionist its patients
 * hear as foreign. And **Telma must not change voice mid-call**, because a
 * receptionist who becomes a different person when the caller switches language
 * is not a person at all.
 *
 * Both hold at once because the voice is fixed per clinic, chosen from the
 * language it greets in, and never switched during a conversation. A Barcelona
 * clinic that also answers in English answers in a Spanish-accented English,
 * which is what a real bilingual receptionist in Barcelona sounds like.
 *
 * A single voice for everybody was tried first and the account data killed it:
 * of the thirty-two voices, exactly one is European Portuguese and every other
 * Portuguese voice is Brazilian. No voice is both pt-PT and es-ES.
 */
export interface ResolvedVoice {
  id: string | null
  /** How it was found. 'generic' is the one worth noticing: it means no voice
   *  was set for this language and the accent is whatever the fallback happens
   *  to be, which is how Telma ended up sounding Latin American in Barcelona. */
  match: 'language' | 'catalan-via-spanish' | 'generic' | 'none'
}

export function resolveVoice(language?: string | null): ResolvedVoice {
  const byLanguage = language
    ? process.env[`ELEVENLABS_VOICE_ID_${language.toUpperCase()}`]?.trim()
    : null
  if (byLanguage) return { id: byLanguage, match: 'language' }

  // Catalan has no voice in the catalogue at all, so it lands here and takes
  // the Spanish one: a peninsular Spanish voice reading Catalan is the closest
  // thing available, and much closer than a Brazilian or American one.
  if (language === 'ca') {
    const es = process.env.ELEVENLABS_VOICE_ID_ES?.trim()
    if (es) return { id: es, match: 'catalan-via-spanish' }
  }

  const generic = process.env.ELEVENLABS_VOICE_ID?.trim()
  if (generic) {
    // Loud on purpose. A silent fallback to a voice with the wrong accent is
    // not a smaller failure than no voice at all: nobody notices until a
    // patient does.
    console.warn(
      `[elevenlabs] no ELEVENLABS_VOICE_ID_${(language ?? '').toUpperCase()} set; falling back to the generic voice, whose accent may be wrong for this language`
    )
    return { id: generic, match: 'generic' }
  }

  return { id: null, match: 'none' }
}

export function voiceId(language?: string | null): string | null {
  return resolveVoice(language).id
}

/** The configured voice's own name, for `clinics.voice_name` and the panel. */
export async function voiceName(language?: string | null): Promise<string | null> {
  const id = voiceId(language)
  if (!id) return null
  const found = (await fetchVoices()).find((v) => v.id === id)
  return found?.name ?? id
}

export interface RemoteAgent {
  id: string
  name: string
}

/**
 * The agents in the account, so the ids above can be filled in without leaving
 * the terminal. Read only, and not called by the sign-up: it is here for
 * setup and for the internal panel.
 */
export async function listAgents(): Promise<RemoteAgent[]> {
  if (!KEY) return []
  try {
    const res = await fetch(`${API}/convai/agents`, {
      headers: { 'xi-api-key': KEY },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[elevenlabs] /convai/agents returned', res.status)
      return []
    }
    const body = (await res.json()) as { agents?: Array<{ agent_id: string; name: string }> }
    return (body.agents ?? []).map((a) => ({ id: a.agent_id, name: a.name }))
  } catch (e) {
    console.error('[elevenlabs] could not list agents', e)
    return []
  }
}

// Hearing it ------------------------------------------------------------------

export type SpeakResult =
  | { ok: true; audio: string; mimeType: string }
  | { ok: false; reason: 'no_key' | 'no_permission' | 'failed'; detail?: string }

/**
 * Says one line in one voice, so a clinic can hear its own receptionist.
 *
 * This is the only call in the project that spends ElevenLabs credits, and it
 * is why it is behind an explicit button rather than firing as somebody types.
 * The line is one sentence; a longer sample costs more and proves nothing the
 * short one does not.
 *
 * `no_permission` is its own outcome rather than a generic failure because it
 * is the likely one: the setup instructions ask for `Voices: Read` and
 * `ElevenAgents: Read`, and generating audio needs `Text to Speech` on top. The
 * caller turns that into a sentence naming the scope, instead of "something
 * went wrong".
 */
export async function speak(voiceId: string, text: string): Promise<SpeakResult> {
  if (!KEY) return { ok: false, reason: 'no_key' }

  try {
    const res = await fetch(`${API}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        // The same family the agent runs on, or the preview is a lie: a clinic
        // that hears multilingual_v2 in the sign-up and gets v3 on the line has
        // been shown a voice it will not have. Set ELEVENLABS_MODEL_ID to
        // whatever is selected in the agent's "TTS model family".
        //
        // The default is deliberate. Carolina Ruiz's peninsular accent and
        // Benedita's European Portuguese are verified on the v2 family and not
        // on v3, so the safe default is the one whose accent is guaranteed.
        model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      cache: 'no-store',
    })

    if (res.status === 401 || res.status === 403) {
      const body = await res.text()
      return {
        ok: false,
        reason: body.includes('text_to_speech') ? 'no_permission' : 'failed',
        detail: body.slice(0, 200),
      }
    }
    if (!res.ok) {
      return { ok: false, reason: 'failed', detail: (await res.text()).slice(0, 200) }
    }

    // Base64 rather than a stream: the sample is a few tens of kilobytes and it
    // is going straight into an <audio src>. A blob URL would need a second
    // round trip and something to revoke it.
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: true, audio: buf.toString('base64'), mimeType: 'audio/mpeg' }
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : 'unknown' }
  }
}
