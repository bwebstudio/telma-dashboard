/* eslint-disable @next/next/no-img-element */
import { Logo } from '@/components/Logo'

/**
 * The clinic's logo in the corner of its own panel, with the Telma wordmark
 * underneath it at a whisper.
 *
 * Both, not one. The clinic wants to open a tool that looks like theirs; Telma
 * needs the receptionist to know whose product just handled the call when they
 * decide whether to renew. Neither claim survives if the other one is missing.
 *
 * A plain <img>, not next/image: the file is a small logo from Supabase
 * Storage on a domain the optimiser is not configured for, and a broken
 * clinic logo on the first screen is a worse trade than the few kilobytes.
 */
export function ClinicMark({
  logoUrl,
  clinicName,
  height = 32,
}: {
  logoUrl: string | null | undefined
  clinicName: string
  height?: number
}) {
  if (!logoUrl) return <Logo height={height} />

  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        src={logoUrl}
        alt={clinicName}
        style={{ height, maxWidth: height * 5 }}
        className="w-auto object-contain"
      />
      <span className="hidden shrink-0 border-l border-line pl-2 lg:inline">
        <Logo height={Math.round(height * 0.55)} />
      </span>
    </span>
  )
}
