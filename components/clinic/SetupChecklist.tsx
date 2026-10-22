import type { Dictionary } from '@/content'
import type { SetupStep } from '@/lib/clinic-setup'
import { IconCheck } from '@/components/icons'

/**
 * Where the clinic is in getting Telma answering, in three stages.
 *
 * ── WHY STAGES AND NOT THE THREE GATES ────────────────────────────────────
 * It listed the gates -- hours, services, the line -- directly above a wizard
 * whose own stepper reads Horários, Serviços, Idiomas, Como atende, Rever.
 * Two navigations of one process, disagreeing about how many steps it has,
 * with Horários and Serviços written twice on one screen. Nobody can answer
 * "am I on step 2 of 3 or step 1 of 5?" and nobody should have to.
 *
 * So this is the altitude above the wizard rather than a second copy of it:
 * set the clinic up, which is the whole wizard; the line, which is ours; hear
 * her and switch her on, which is the wizard's last step and the button after
 * it. The gates have not moved -- `setupSteps` is still what the button is
 * checked against -- they are grouped.
 *
 * ── AND WHY THE LINE SAYS TWO DIFFERENT THINGS ────────────────────────────
 * "Done" beside "we are arranging it and will tell you when it is ready" is a
 * contradiction a clinic has to resolve on its own. A line that is ready says
 * so; one that is not says we are on it.
 */
export function SetupChecklist({
  steps,
  clinicName,
  dict,
}: {
  steps: SetupStep[]
  clinicName: string
  dict: Dictionary
}) {
  const t = dict.comecar
  const by = (id: SetupStep['id']) => steps.find((s) => s.id === id)?.done ?? false

  // The clinic's own half of the wizard. Both gates, because a clinic that
  // has answered one of them is not finished with this stage.
  const clinicReady = by('hours') && by('services')
  const lineReady = by('number')

  const stages = [
    {
      key: 'clinica' as const,
      copy: t.stages.clinica,
      done: clinicReady,
      // Theirs, and it is the screen they are on.
      here: !clinicReady,
      waiting: false,
    },
    {
      key: 'linha' as const,
      copy: lineReady ? t.stages.linhaReady : t.stages.linhaWaiting,
      done: lineReady,
      here: false,
      waiting: !lineReady,
    },
    {
      key: 'ativar' as const,
      copy: t.stages.ativar,
      done: false,
      // Only once there is nothing left to answer: before that, pointing
      // somebody at the end of a form they have not filled in is noise.
      here: clinicReady,
      waiting: false,
    },
  ]

  const done = stages.filter((s) => s.done).length

  return (
    <section className="mb-8">
      <p className="label-caps text-ink-mute">{t.eyebrow}</p>
      <h1 className="h-display mt-2 text-3xl sm:text-4xl">
        {t.greeting.replace('{clinic}', clinicName)}
      </h1>
      <p className="mt-3 max-w-lead text-lg text-ink-soft">{t.title}</p>
      <p className="mt-2 max-w-prose text-base text-ink-soft">{t.lead}</p>

      {/* ── IS SHE ON? ────────────────────────────────────────────────────
          Said plainly, at the top, because it is the question this screen
          exists under and the old one left to be inferred from an empty
          agenda. "Not switched on yet" rather than "not answering": the
          second reads as something broken, and this is a state the clinic
          chose. */}
      <div className="mt-6 rounded-card border border-line-strong bg-surface-sunken p-4">
        <p className="flex items-center gap-2 font-medium text-ink">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-warn" />
          {t.statusOff}
        </p>
        <p className="mt-1 max-w-prose text-base text-ink-soft">{t.statusOffHelp}</p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <p className="label-caps shrink-0 text-ink-mute">
          {t.progress.replace('{done}', String(done)).replace('{total}', String(stages.length))}
        </p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-wash" role="presentation">
          <div
            className="h-full rounded-full bg-ok-mark transition-[width] duration-slow ease-calm"
            style={{ width: `${Math.round((done / stages.length) * 100)}%` }}
          />
        </div>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {stages.map((stage, i) => (
          <li
            key={stage.key}
            className={`flex flex-wrap items-start gap-3 rounded-card border p-4 ${
              stage.here ? 'border-ink bg-surface' : 'border-line bg-surface'
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
                stage.done
                  ? 'bg-ok text-on-ink'
                  : stage.here
                    ? 'bg-ink text-on-ink'
                    : 'border border-line-strong text-ink-mute'
              }`}
            >
              {stage.done ? <IconCheck className="h-4 w-4" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{stage.copy.title}</span>
              <span className="mt-0.5 block text-base text-ink-soft">{stage.copy.body}</span>
            </span>
            <span className="shrink-0 text-sm font-medium text-ink-mute">
              {stage.here ? t.here : stage.done ? t.stageDone : stage.waiting ? t.stageWaiting : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
