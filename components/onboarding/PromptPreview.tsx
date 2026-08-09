'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { previewGreetingAudio, previewSummary, type PromptSummary } from '@/lib/actions/preview'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * Their own answers, read back to them.
 *
 * This panel used to print the built prompt: two thousand words of instructions
 * written for a model, with headings, rules and a version number, behind a
 * button that copied the lot to the clipboard. It was wrong twice over. It gave
 * away the whole briefing to anybody who started a sign-up, and it showed a
 * clinic owner a wall of machine instructions at the exact moment they were
 * deciding whether this product was too complicated for them.
 *
 * What is here now says only what a caller will experience, in sentences about
 * their clinic. No sections, no version, no mention that any of it is a prompt.
 * If a line here is wrong, they know which question to go back and change, which
 * is the only thing this panel was ever for.
 *
 * The greeting stays outside the fold and stays audible. It is the one line
 * every patient hears, and hearing it is what makes the rest feel real.
 */

const COPY = {
  pt: {
    title: 'O que a Telma vai saber',
    help: 'Montado a partir das suas respostas. Se alguma coisa não estiver bem, volte ao passo e corrija.',
    greeting: 'Assim atende',
    listen: 'Ouvir',
    listening: 'Um momento...',
    stop: 'Parar',
    show: 'Ver tudo',
    hide: 'Fechar',
    errNoKey: 'A voz ainda não está ligada. Pode continuar: isto não impede a inscrição.',
    errNoPermission: 'A voz ainda não está ligada. Pode continuar: isto não impede a inscrição.',
    errFailed: 'Não foi possível ouvir agora. Tente outra vez.',
    errNoVoice: 'A voz ainda não está escolhida.',
  },
  es: {
    title: 'Lo que Telma va a saber',
    help: 'Montado a partir de sus respuestas. Si algo no está bien, vuelva al paso y corríjalo.',
    greeting: 'Así contesta',
    listen: 'Escuchar',
    listening: 'Un momento...',
    stop: 'Parar',
    show: 'Ver todo',
    hide: 'Cerrar',
    errNoKey: 'La voz todavía no está conectada. Puede continuar: esto no impide el alta.',
    errNoPermission: 'La voz todavía no está conectada. Puede continuar: esto no impide el alta.',
    errFailed: 'No se ha podido escuchar ahora. Inténtelo otra vez.',
    errNoVoice: 'Todavía no hay voz elegida.',
  },
} as const

export function PromptPreview({
  values,
  locale,
}: {
  values: Record<string, unknown>
  locale: OnboardingLocale
}) {
  const t = COPY[locale] ?? COPY.pt
  const [summary, setSummary] = useState<PromptSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [pending, startTransition] = useTransition()
  const audio = useRef<HTMLAudioElement | null>(null)

  // Rebuilt on a pause rather than on every keystroke: this runs on the server,
  // and somebody typing their address should not send a request per character.
  const serialised = JSON.stringify(values)
  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(async () => {
        setSummary(await previewSummary(JSON.parse(serialised), locale))
      })
    }, 600)
    return () => clearTimeout(id)
  }, [serialised, locale])

  useEffect(() => () => audio.current?.pause(), [])

  function listen() {
    if (speaking) {
      audio.current?.pause()
      setSpeaking(false)
      return
    }
    setAudioError(null)
    startTransition(async () => {
      const r = await previewGreetingAudio(JSON.parse(serialised), locale)
      if (!r.ok) {
        setAudioError(
          r.reason === 'no_voice'
            ? t.errNoVoice
            : r.reason === 'no_key'
              ? t.errNoKey
              : r.reason === 'no_permission'
                ? t.errNoPermission
                : t.errFailed
        )
        return
      }
      audio.current?.pause()
      const el = new Audio(`data:${r.mimeType};base64,${r.audio}`)
      el.onended = () => setSpeaking(false)
      audio.current = el
      void el.play()
      setSpeaking(true)
    })
  }

  if (!summary) {
    return (
      <div className="card p-5">
        <p className="text-base text-ink-mute">{t.help}</p>
      </div>
    )
  }

  return (
    <div className="card p-5 sm:p-6">
      <h3 className="text-lg font-semibold text-ink">{t.title}</h3>
      <p className="mt-1.5 text-sm text-ink-mute">{t.help}</p>

      {/* The greeting, always visible. */}
      <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
        <p className="label-caps">{t.greeting}</p>
        <p className="mt-2 text-base italic leading-relaxed text-ink">
          &ldquo;{summary.greeting}&rdquo;
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listen}
            disabled={pending}
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
          >
            {pending ? t.listening : speaking ? t.stop : t.listen}
          </button>
          {audioError && (
            <span role="alert" className="text-sm text-warn">
              {audioError}
            </span>
          )}
        </div>
      </div>

      {/* The first group always shows, so the panel is never just a button.
          The rest opens on request: everything here is already on the page in
          the fields above, and repeating all of it unasked reads as a wall. */}
      <div className="mt-5">
        <Group group={summary.groups[0]} />
      </div>

      {summary.groups.length > 1 && (
        <>
          {open && (
            <div className="mt-5 flex flex-col gap-5">
              {summary.groups.slice(1).map((g) => (
                <Group key={g.title} group={g} />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn-ghost mt-4 px-0 text-sm"
            aria-expanded={open}
          >
            {open ? t.hide : t.show}
          </button>
        </>
      )}
    </div>
  )
}

function Group({ group }: { group: PromptSummary['groups'][number] | undefined }) {
  if (!group) return null
  return (
    <div>
      <p className="label-caps">{group.title}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {group.lines.map((line, i) => (
          <li
            key={i}
            // Indented lines are the timetable, which reads as a list rather
            // than as prose and should not carry a bullet.
            className={
              line.startsWith('  ')
                ? 'pl-4 text-base tabular-nums text-ink-soft'
                : 'text-base leading-relaxed text-ink-soft'
            }
          >
            {line.trim()}
          </li>
        ))}
      </ul>
    </div>
  )
}
