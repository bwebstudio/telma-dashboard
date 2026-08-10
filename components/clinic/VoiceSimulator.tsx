'use client'

import { useEffect, useState, useTransition } from 'react'
import { lastCallOutcome, type CallOutcome, type VoiceConfig } from '@/lib/actions/voice-demo'

/**
 * The conversation, and then the receipts.
 *
 * The widget is given exactly what a telephone call would be given: this
 * clinic's briefing, its opening line, its language, its voice and its
 * `clinic_id`. Nothing here is a special demonstration path, which is the only
 * way the demonstration means anything.
 *
 * Afterwards it shows the transcript beside the rows that landed. A transcript
 * on its own is a claim about what happened; a row on its own is a number
 * nobody saw arrive. Together they are the argument.
 */

const COPY = {
  pt: {
    lead: 'Fale com a Telma como se fosse um paciente. Ela usa a configuração desta clínica.',
    knows: 'A Telma já sabe',
    opens: 'Vai atender assim',
    after: 'Depois de desligar',
    refresh: 'Ver o que ficou',
    loading: 'A ler...',
    nothing: 'Ainda não há nada. Fale com ela e depois carregue aqui.',
    transcript: 'A conversa',
    inPanel: 'No painel da clínica',
    booked: 'Marcação criada',
    noBooking: 'Esta chamada não deixou marcação.',
    mic: 'Precisa de dar permissão ao microfone.',
  },
  es: {
    lead: 'Hable con Telma como si fuera un paciente. Usa la configuración de esta clínica.',
    knows: 'Telma ya sabe',
    opens: 'Va a contestar así',
    after: 'Después de colgar',
    refresh: 'Ver qué ha quedado',
    loading: 'Leyendo...',
    nothing: 'Todavía no hay nada. Hable con ella y luego pulse aquí.',
    transcript: 'La conversación',
    inPanel: 'En el panel de la clínica',
    booked: 'Cita creada',
    noBooking: 'Esta llamada no dejó cita.',
    mic: 'Tiene que dar permiso al micrófono.',
  },
} as const

export function VoiceSimulator({
  config,
  locale,
}: {
  config: VoiceConfig
  locale: 'pt' | 'es'
}) {
  const t = COPY[locale] ?? COPY.pt
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
    s.async = true
    document.body.appendChild(s)
    return () => {
      s.remove()
    }
  }, [])

  function refresh() {
    startTransition(async () => {
      const r = await lastCallOutcome()
      setOutcome('error' in r ? null : r)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-base text-ink-soft">{t.lead}</p>

      {/* Proof the configuration arrived, before a word is spoken. Not the
          briefing itself: three facts out of it that could only be this
          clinic's. */}
      {config.knows.length > 0 && (
        <div className="card p-5">
          <p className="label-caps">{t.knows}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {config.knows.map((k) => (
              <li key={k} className="rounded-pill border border-line bg-surface-sunken px-3 py-1 text-sm text-ink-soft">
                {k}
              </li>
            ))}
          </ul>
          <p className="label-caps mt-4">{t.opens}</p>
          <p className="mt-1.5 text-base italic text-ink">&ldquo;{config.greeting}&rdquo;</p>
        </div>
      )}

      <div className="card p-5">
        <p className="mb-3 text-sm text-ink-mute">{t.mic}</p>
        <elevenlabs-convai
          agent-id={config.agentId}
          variant="expanded"
          dynamic-variables={JSON.stringify(config.dynamicVariables)}
          override-prompt={config.promptText}
          override-first-message={config.greeting}
          override-language={config.language}
          override-voice-id={config.voiceId}
        />
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{t.after}</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
          >
            {pending ? t.loading : t.refresh}
          </button>
        </div>

        {!outcome && <p className="mt-3 text-base text-ink-mute">{t.nothing}</p>}

        {outcome && (
          <div className="mt-4 flex flex-col gap-5">
            {outcome.transcript.length > 0 && (
              <div>
                <p className="label-caps">{t.transcript}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {outcome.transcript.map((line, i) => (
                    <li key={i} className="text-base">
                      <span className="text-ink-mute">
                        {line.role === 'agent' ? 'Telma' : '·'}{' '}
                      </span>
                      <span className="text-ink-soft">{line.message}</span>
                      {line.tools.map((tool) => (
                        <span
                          key={tool}
                          className="ml-2 rounded-pill border border-line px-2 py-0.5 text-xs text-ink-mute"
                        >
                          {tool}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="label-caps">{t.inPanel}</p>
              {outcome.call && (
                <p className="mt-2 text-base text-ink-soft">
                  {outcome.call.summary}
                </p>
              )}
              {outcome.appointment ? (
                <div className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
                  <p className="label-caps">{t.booked}</p>
                  <p className="mt-1 text-base font-medium text-ink">
                    {outcome.appointment.patient_name}
                  </p>
                  <p className="text-base text-ink-soft">{outcome.appointment.say}</p>
                  <p className="text-sm text-ink-mute">
                    {[outcome.appointment.reason, outcome.appointment.patient_phone]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-mute">{t.noBooking}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': {
        'agent-id': string
        variant?: string
        'dynamic-variables'?: string
        'override-prompt'?: string
        'override-first-message'?: string
        'override-language'?: string
        'override-voice-id'?: string
      }
    }
  }
}
