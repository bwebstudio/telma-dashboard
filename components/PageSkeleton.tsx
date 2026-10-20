/**
 * What a panel shows while the next screen is being read out of the database.
 *
 * ── WHY ANYTHING AT ALL ─────────────────────────────────────────────────────
 * Every screen here is rendered on the server against live rows, so a click on
 * "Pacientes" cannot paint anything until the answer comes back. Without a
 * file like this one, Next has nothing to put on the screen in the meantime
 * and simply leaves the old page where it is: the sidebar highlight does not
 * move, nothing flickers, and for a second or two the panel looks like it
 * ignored the click. People click again.
 *
 * This is the whole of the fix for that. The shell stays, the sidebar marks
 * the new section immediately, and the page area says "this is loading" in the
 * shape of what is about to arrive. It also gives Next something to prefetch
 * for every link in the sidebar, which it cannot do for a page that has none.
 *
 * Deliberately vague. A skeleton that promises three cards and delivers one is
 * worse than a few quiet bars: it is read as content, and then it changes.
 */
export function PageSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="mb-6">
        <div className="h-9 w-56 rounded-input bg-surface-sunken" />
        <div className="mt-3 h-5 w-80 max-w-full rounded-input bg-surface-sunken" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-card border border-line bg-surface-sunken" />
        ))}
      </div>
    </div>
  )
}
