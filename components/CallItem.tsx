import type { Dictionary, Locale } from '@/content'
import type { Call, CallResult } from '@/lib/types'
import { formatTime, formatDate, formatDuration } from '@/lib/format'
import { Badge } from './ui'

const callTone: Record<CallResult, 'ok' | 'info' | 'neutral' | 'danger'> = {
  marcacao: 'ok',
  transferida: 'info',
  informacao: 'neutral',
  nao_resolvida: 'danger',
}

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
        <span className="min-w-0 flex-1 truncate text-base text-ink-soft">
          {call.from_phone || dict.common.none}
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
          <Badge tone={callTone[call.result]}>{dict.status.call[call.result]}</Badge>
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
