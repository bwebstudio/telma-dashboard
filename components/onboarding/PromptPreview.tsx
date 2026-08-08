'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { previewGreetingAudio, previewPrompt, type PromptPreview as Preview } from '@/lib/actions/preview'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * What the receptionist has actually been told.
 *
 * The step above collects eight answers and, until this existed, showed none of
 * their consequences. Two of them are decisions taken by leaving a box empty:
 * no price text means Telma refuses to discuss prices, no emergency number
 * means she sends an urgent caller to an emergency service. Nobody chose those
 * out loud, and nobody could see them.
 *
 * Deliberately collapsed by default. It is two thousand words, and a wall of
 * text opened over somebody mid-form reads as an obstacle. The greeting is what
 * sits outside the fold, because that is the line their patients hear first and
 * the one worth checking even if they never open the rest.
 */

const COPY = {
  pt: {
    title: 'O que a Telma vai saber',
    help: 'Montado a partir das suas respostas. É exatamente o que a Telma lê antes de atender.',
    greeting: 'Assim atende',
    listen: 'Ouvir',
    listening: 'A gerar...',
    stop: 'Parar',
    show: 'Ver tudo o que a Telma sabe',
    hide: 'Fechar',
    openNow: 'A mostrar a versão de dentro do horário. Fora de horas, o bloco de urgências muda.',
    closedNow: 'A mostrar a versão de fora do horário, porque a clínica está fechada agora.',
    version: 'Versão',
    errNoKey: 'Falta configurar a ligação à ElevenLabs. Pode continuar: isto não bloqueia a inscrição.',
    errNoPermission:
      'A chave da ElevenLabs não tem permissão para gerar áudio. Ative o scope "Text to Speech" em Developers > API Keys.',
    errFailed: 'Não foi possível gerar o áudio. Tente de novo.',
    errNoVoice: 'Ainda não há voz configurada.',
    copy: 'Copiar o texto',
    copied: 'Copiado',
  },
  es: {
    title: 'Lo que Telma va a saber',
    help: 'Montado a partir de sus respuestas. Es exactamente lo que Telma lee antes de contestar.',
    greeting: 'Así contesta',
    listen: 'Escuchar',
    listening: 'Generando...',
    stop: 'Parar',
    show: 'Ver todo lo que Telma sabe',
    hide: 'Cerrar',
    openNow: 'Mostrando la versión de dentro del horario. Fuera de horario, el bloque de urgencias cambia.',
    closedNow: 'Mostrando la versión de fuera del horario, porque la clínica está cerrada ahora.',
    version: 'Versión',
    errNoKey: 'Falta configurar la conexión con ElevenLabs. Puede continuar: esto no bloquea el alta.',
    errNoPermission:
      'La clave de ElevenLabs no tiene permiso para generar audio. Active el scope "Text to Speech" en Developers > API Keys.',
    errFailed: 'No se ha podido generar el audio. Inténtelo de nuevo.',
    errNoVoice: 'Todavía no hay voz configurada.',
    copy: 'Copiar el texto',
    copied: 'Copiado',
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
  const [preview, setPreview] = useState<Preview | null>(null)
  const [open, setOpen] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const audio = useRef<HTMLAudioElement | null>(null)

  // Re-rendered on a timer rather than on every keystroke. The prompt is built
  // on the server, and rebuilding it as somebody types their address would be a
  // round trip per character for a panel most of them will never open.
  const serialised = JSON.stringify(values)
  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(async () => {
        setPreview(await previewPrompt(JSON.parse(serialised), locale))
      })
    }, 600)
    return () => clearTimeout(id)
  }, [serialised, locale])

  useEffect(() => {
    return () => {
      audio.current?.pause()
    }
  }, [])

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

  if (!preview) {
    return (
      <div className="card p-5">
        <p className="text-base text-ink-mute">{t.help}</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">{t.title}</h3>
        <span className="text-sm text-ink-mute">
          {t.version} {preview.version}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ink-mute">{t.help}</p>

      {/* The greeting, outside the fold. The one line every patient hears. */}
      <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
        <p className="label-caps">{t.greeting}</p>
        <p className="mt-2 text-base italic text-ink">&ldquo;{preview.greeting}&rdquo;</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listen}
            disabled={pending}
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
          >
            {pending ? t.listening : speaking ? t.stop : t.listen}
          </button>
          {/* Next to the listen button, not hidden inside the fold. Copying the
              text out is how this gets tested against a real agent, and a
              button nobody finds is a button that does not exist. */}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(preview.text)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                /* no clipboard permission: the text is on screen and selectable */
              }
            }}
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
          >
            {copied ? t.copied : t.copy}
          </button>
          {audioError && (
            <span role="alert" className="text-sm text-warn">
              {audioError}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost mt-4 px-0 text-sm"
      >
        {open ? t.hide : t.show}
      </button>

      {open && (
        <>
          <p className="mt-2 text-sm text-ink-mute">
            {preview.openNow ? t.openNow : t.closedNow}
          </p>
          {/* Monospace and pre-wrap: this is the literal text, and formatting it
              prettily would hide that the headings are part of what the model
              reads. Scrolls in its own box so the form does not become endless. */}
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-card border border-line bg-surface-sunken p-4 text-sm leading-relaxed text-ink-soft [font-family:ui-monospace,SFMono-Regular,Menlo,monospace]">
            {preview.text}
          </pre>
          {/* Copying it out is how this gets tested today: the text goes into
              the agent and the agent can be talked to. It is also what somebody
              pastes into an email when they want a second opinion on it. */}

        </>
      )}
    </div>
  )
}
