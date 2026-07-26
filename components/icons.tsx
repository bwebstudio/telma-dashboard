// Minimal, monochrome line icons. No filled shapes, no pastel circles.
type P = { className?: string }
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconToday({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l8 6v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" />
      <path d="M9 21v-7h6v7" />
    </svg>
  )
}
export function IconBookings({ className }: P) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" />
    </svg>
  )
}
export function IconHours({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
export function IconCalls({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6.6 10.8a11 11 0 0 0 4.6 4.6l1.6-1.6a1 1 0 0 1 1-.25 8 8 0 0 0 2.5.4 1 1 0 0 1 1 1v2.55a1 1 0 0 1-1 1A14 14 0 0 1 4 5a1 1 0 0 1 1-1h2.55a1 1 0 0 1 1 1 8 8 0 0 0 .4 2.5 1 1 0 0 1-.25 1z" />
    </svg>
  )
}
export function IconClinic({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 21V6l8-3 8 3v15" />
      <path d="M9 21v-5h6v5M9 9h.01M15 9h.01M9 12.5h.01M15 12.5h.01" />
    </svg>
  )
}
export function IconUsage({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  )
}
export function IconActivity({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12h4l3 7 4-14 3 7h4" />
    </svg>
  )
}
export function IconAccount({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}
export function IconPlus({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
export function IconSearch({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}
export function IconCopy({ className }: P) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  )
}
export function IconCheck({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12.5l4.5 4.5L19 6.5" />
    </svg>
  )
}
export function IconClose({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
export function IconSignOut({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 12H3M6 8l-4 4 4 4" />
    </svg>
  )
}
export function IconChevron({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
