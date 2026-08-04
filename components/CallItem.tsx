import type { Dictionary, Locale } from '@/content'
import type { Call } from '@/lib/types'
import { formatTime, formatDate, formatDuration } from '@/lib/format'
import { Badge, CALL_TONE } from './ui'
import { IconPhone, IconWhatsApp } from './icons'

export function CallItem({
  call,
  dict,
  locale,
  withDate = false,
}: {
  call: Call
  dict: Dictionary
  locale: Locale
  withDate?: boolean
}) {
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="w-16 shrink-0 font-mid text-lg text-ink">
          {formatTime(call.created_at, locale)}
        </span>
        <span
          className={call.channel === 'whatsapp' ? 'shrink-0 text-ok' : 'shrink-0 text-ink-mute'}
          aria-label={dict.status.channel[call.channel]}
        >
          {call.channel === 'whatsapp' ? (
            <IconWhatsApp className="h-4 w-4" />
          ) : (
            <IconPhone className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-base text-ink-soft">
          {call.patient_name || call.from_phone || dict.common.none}
          {withDate && (
            <span className="ml-2 text-sm text-ink-mute">
              {formatDate(call.created_at, locale)}
            </span>
          )}
        </span>
        <span className="hidden text-sm text-ink-mute sm:inline">
          {formatDuration(call.duration_seconds, locale)}
        </span>
        {call.result && (
          <Badge tone={CALL_TONE[call.result]}>{dict.status.call[call.result]}</Badge>
        )}
      </summary>
      <div className="pb-4 pl-16 pr-2">
        <p className="text-base leading-relaxed text-ink-soft">
          {call.summary || dict.chamadas.noSummary}
        </p>
        {call.recording_url ? (
          <audio controls preload="none" className="mt-3 w-full max-w-md">
            <source src={call.recording_url} />
          </audio>
        ) : (
          <p className="mt-2 text-sm text-ink-mute">{dict.chamadas.noAudio}</p>
        )}
      </div>
    </details>
  )
}
