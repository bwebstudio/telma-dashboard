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
export function IconSales({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 19V9M10 19V5M16 19v-6M4 19h16" />
      <path d="M19 9l-2-2 2-2" />
    </svg>
  )
}
export function IconTeam({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 5M18 19a6 6 0 0 0-2-4.4" />
    </svg>
  )
}
export function IconPhone({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6.6 10.8a11 11 0 0 0 4.6 4.6l1.6-1.6a1 1 0 0 1 1-.25 8 8 0 0 0 2.5.4 1 1 0 0 1 1 1v2.55a1 1 0 0 1-1 1A14 14 0 0 1 4 5a1 1 0 0 1 1-1h2.55a1 1 0 0 1 1 1 8 8 0 0 0 .4 2.5 1 1 0 0 1-.25 1z" />
    </svg>
  )
}
export function IconWhatsApp({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 20.5l1.3-4.2A8.2 8.2 0 1 1 8 19.4z" />
      <path d="M9 9.2c.2 1.2.8 2.3 1.7 3.2.9.9 2 1.5 3.1 1.7l.9-1.2 1.6.7-.2 1.4c-1.9.4-4-.5-5.6-2.1S8 9.5 8.4 7.6l1.4-.2.7 1.6z" />
    </svg>
  )
}
export function IconClock({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}
export function IconFilter({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}
export function IconDownload({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
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
