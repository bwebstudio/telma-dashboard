import Image from 'next/image'

/**
 * The drawn lockup, the same artwork the landing uses.
 *
 * The panel used to set the word "Telma" in Clash Display, which is now the
 * only place that typeface would still be loaded for — six font files to render
 * one word that the brand already has artwork for. The wordmark's letterforms
 * live inside the image, so the panel ships one font family and the two
 * surfaces cannot drift apart on the one element a user recognises first.
 */

// The delivered artwork, trimmed. 1043 × 480.
const RATIO = 2.172

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
    <Image
      src={onDark ? '/images/logo-light.webp' : '/images/logo.webp'}
      alt="Telma"
      width={Math.round(height * RATIO)}
      height={height}
      priority
      className={className}
      style={{ height, width: 'auto' }}
    />
  )
}
