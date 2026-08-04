import type { Dictionary, Locale } from '@/content'
import type { Call } from '@/lib/types'
import { formatDuration } from '@/lib/format'
import { timeIn, dateIn } from '@/lib/time'
import { Badge, CALL_TONE } from '@/components/ui'
import { IconPhone, IconWhatsApp, IconChevron } from '@/components/icons'

/**
 * One conversation, closed to a single line and openable to every word of it.
 *
 * Built on <details> rather than React state: it works before the JavaScript
 * lands, it survives a refresh of the page underneath it, and the browser's own
 * find-in-page can reach inside a closed one. On a panel that refreshes itself
 * every minute, a transcript that collapsed on each refresh would be unusable.
 */
export function ConversationItem({
  call,
  dict,
  locale,
  tz,
  open = false,
  withDate = false,
}: {
  call: Call
  dict: Dictionary
  locale: Locale
  tz: string
  open?: boolean
  withDate?: boolean
}) {
  const t = dict.conversas
  const turns = call.transcript ?? []
  const isWhatsapp = call.channel === 'whatsapp'

  return (
    <details
      id={`c-${call.id}`}
      open={open}
      className="group border-b border-line last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3.5 pr-1 [&::-webkit-details-marker]:hidden">
        <span className="w-14 shrink-0 text-base tabular-nums text-ink sm:w-16 sm:text-lg">
          {timeIn(call.created_at, locale, tz)}
        </span>

        <span
          className={isWhatsapp ? 'shrink-0 text-ok' : 'shrink-0 text-ink-mute'}
          title={dict.status.channel[call.channel]}
          aria-label={dict.status.channel[call.channel]}
        >
          {isWhatsapp ? <IconWhatsApp className="h-5 w-5" /> : <IconPhone className="h-5 w-5" />}
        </span>

        <span className="min-w-0 flex-1 truncate text-base text-ink">
          {call.patient_name || call.from_phone || dict.common.none}
          {call.patient_name && call.from_phone && (
            <span className="ml-2 hidden text-sm text-ink-mute sm:inline">{call.from_phone}</span>
          )}
          {withDate && (
            <span className="ml-2 text-sm text-ink-mute">
              {dateIn(call.created_at, locale, tz)}
            </span>
          )}
        </span>

        {!isWhatsapp && call.duration_seconds > 0 && (
          <span className="hidden shrink-0 text-sm tabular-nums text-ink-mute sm:inline">
            {formatDuration(call.duration_seconds, locale)}
          </span>
        )}

        {call.result && (
          <Badge tone={CALL_TONE[call.result]}>{dict.status.call[call.result]}</Badge>
        )}

        <IconChevron className="h-5 w-5 shrink-0 rotate-90 text-ink-mute transition-transform group-open:-rotate-90" />
      </summary>

      <div className="pb-5 pl-3 pr-1 sm:pl-16">
        {call.summary && (
          <p className="mb-4 text-base leading-relaxed text-ink-soft">{call.summary}</p>
        )}

        {turns.length > 0 ? (
          <>
            <p className="label-caps mb-2">{t.transcript}</p>
            <ol className="flex flex-col gap-2">
              {turns.map((turn, i) => {
                const telma = turn.speaker === 'telma'
                return (
                  <li
                    key={i}
                    className={`flex flex-col ${telma ? 'items-start' : 'items-end'}`}
                  >
                    <span className="px-1 text-xs font-medium uppercase tracking-label text-ink-mute">
                      {telma ? t.speakerTelma : t.speakerPatient}
                    </span>
                    <p
                      className={`max-w-[46ch] rounded-2xl px-4 py-2.5 text-base leading-relaxed ${
                        telma
                          ? 'rounded-tl-sm bg-brand-wash-strong text-ink'
                          : 'rounded-tr-sm bg-surface-sunken text-ink'
                      }`}
                    >
                      {turn.text}
                    </p>
                  </li>
                )
              })}
            </ol>
          </>
        ) : (
          <p className="text-base text-ink-mute">{t.noTranscript}</p>
        )}

        {call.recording_url && (
          <audio controls preload="none" className="mt-4 w-full max-w-md">
            <source src={call.recording_url} />
          </audio>
        )}
      </div>
    </details>
  )
}
