import { TelmaMark } from '@/components/TelmaMark'

/**
 * THE LOCKUP: the mark, then the word.
 *
 * It used to be a .webp of the old drawn lockup, which was the right call
 * while the wordmark's letterforms were artwork the panel could not set. They
 * are not any more: the word is Matter, the same face this whole panel is in,
 * so the lockup is now two live elements and the image is gone. A drawn file
 * is also exactly the thing that still shows last season's logo a year after
 * the logo changed — which is what it had just spent a week doing here.
 *
 * `currentColor` for both halves, so the ground decides: ink on the panel,
 * white wherever onDark puts it on near-black.
 *
 * The two ratios are eyeballed against the sign-in screen's lockup rather than
 * derived, because that is the one a clinic sees first and the two have to
 * look like the same object.
 */
export function Logo({
  height = 28,
  onDark = false,
  className = '',
}: {
  height?: number
  onDark?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center ${onDark ? 'text-white' : 'text-ink'} ${className}`}
      style={{ gap: Math.round(height * 0.3) }}
    >
      <TelmaMark className="w-auto" style={{ height: Math.round(height * 0.62) }} />
      <span
        style={{ fontSize: Math.round(height * 0.68), lineHeight: 1 }}
        className="font-medium tracking-tight"
      >
        Telma
      </span>
    </span>
  )
}
