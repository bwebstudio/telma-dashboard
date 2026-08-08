'use client'

import { useState, useTransition } from 'react'
import {
  cleanupTestClinic,
  findLeftovers,
  purgeLeftovers,
  runEndToEnd,
  runValidationChecks,
  type CheckLine,
  type Leftovers,
  type RunKind,
  type RunReport,
} from '@/lib/actions/test-onboarding'

/**
 * The buttons on /test-onboarding, and the report they produce.
 *
 * Deliberately plain. This is a tool for the person building the sign-up, not a
 * screen anybody is sold, and every line on it is either a green tick or the
 * reason it is not one.
 */
export function TestRunner() {
  const [report, setReport] = useState<RunReport | null>(null)
  const [rules, setRules] = useState<CheckLine[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [leftovers, setLeftovers] = useState<Leftovers | null>(null)
  const [pending, startTransition] = useTransition()

  function run(kind: RunKind) {
    startTransition(async () => {
      setNote(null)
      setReport(await runEndToEnd(kind))
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run('pt')}
          className="btn-primary"
        >
          Inscrição completa (PT)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run('es')}
          className="btn-primary"
        >
          Alta completa (ES)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run('pt-porting')}
          className="btn-secondary"
        >
          Com portabilidade (PT)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setNote(null)
              setRules(await runValidationChecks())
            })
          }
          className="btn-secondary"
        >
          Só as validações
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setNote(null)
              setLeftovers(await findLeftovers())
            })
          }
          className="btn-secondary"
        >
          Ver o que ficou para trás
        </button>
        <a href="/inscricao" className="btn-ghost">
          Abrir o formulário
        </a>
      </div>

      {pending && <p className="text-base text-ink-mute">A correr...</p>}
      {note && <p className="text-base text-ink-soft">{note}</p>}

      {leftovers && <LeftoversPanel
        leftovers={leftovers}
        pending={pending}
        onPurge={() =>
          startTransition(async () => {
            const r = await purgeLeftovers()
            setNote(
              r.error
                ? r.error
                : `Removidos: ${r.accounts} conta(s) órfã(s), ${r.drafts} rascunho(s).`
            )
            setLeftovers(await findLeftovers())
          })
        }
      />}

      {rules && <Report title="Validações" checks={rules} />}

      {report && (
        <div className="flex flex-col gap-4">
          <Report
            title={report.ok ? 'Inscrição de ponta a ponta: tudo passou' : 'Inscrição de ponta a ponta'}
            checks={report.checks}
          />
          {report.error && (
            <p className="rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-base text-danger">
              {report.error}
            </p>
          )}
          {report.clinicId && (
            <div className="flex flex-wrap items-center gap-3">
              <a href={`/clinicas/${report.clinicId}`} className="btn-secondary">
                Ver a ficha da clínica
              </a>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await cleanupTestClinic(report.clinicId!)
                    setNote(r.detail)
                    if (r.ok) setReport(null)
                  })
                }
                className="btn-danger"
              >
                Apagar esta clínica de teste
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Report({ title, checks }: { title: string; checks: CheckLine[] }) {
  const failed = checks.filter((c) => !c.ok).length

  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold text-ink">
        {title}
        <span className="ml-3 text-base font-normal text-ink-mute">
          {checks.length - failed} de {checks.length}
        </span>
      </h2>
      <ul className="card divide-y divide-line">
        {checks.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex gap-3 px-5 py-3">
            <span
              className={[
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill text-xs font-semibold',
                c.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger',
              ].join(' ')}
              aria-hidden
            >
              {c.ok ? '✓' : '✕'}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-medium text-ink">{c.label}</span>
              <span className="block break-words text-sm text-ink-soft">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What a week of testing leaves in the database.
 *
 * Worth its own panel because neither of these shows anywhere else, and the
 * orphan account is the one that bites: it makes an email permanently
 * unusable for sign-up while nothing in the database says why.
 *
 * The list is drawn before anything is deleted, and it names every address, so
 * the person pressing the button can see that no real account is in it.
 */
function LeftoversPanel({
  leftovers,
  pending,
  onPurge,
}: {
  leftovers: Leftovers
  pending: boolean
  onPurge: () => void
}) {
  const total = leftovers.orphanAccounts.length + leftovers.drafts.length

  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold text-ink">
        O que ficou para trás
        <span className="ml-3 text-base font-normal text-ink-mute">{total}</span>
      </h2>

      {leftovers.error && (
        <p className="rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-base text-danger">
          {leftovers.error}
        </p>
      )}

      {!leftovers.error && total === 0 && (
        <p className="card px-5 py-6 text-base text-ink-mute">
          Nada. Nenhuma conta sem clínica, nenhum rascunho por concluir.
        </p>
      )}

      {total > 0 && (
        <>
          <div className="card divide-y divide-line">
            {leftovers.orphanAccounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="text-base text-ink">{a.email}</span>
                <span className="text-sm text-ink-mute">
                  conta sem clínica · o email fica ocupado
                </span>
              </div>
            ))}
            {leftovers.drafts.map((d) => (
              <div key={d.token} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span className="text-base text-ink">{d.email ?? d.token.slice(0, 8) + '…'}</span>
                <span className="text-sm text-ink-mute">
                  inscrição parada no passo {d.step}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-sm text-ink-mute">
            Nenhuma destas tem utilizador em <code>users</code>. As contas reais
            não aparecem aqui e não podem ser apagadas por este botão.
          </p>

          <button
            type="button"
            disabled={pending}
            onClick={onPurge}
            className="btn-danger mt-3"
          >
            Apagar tudo isto
          </button>
        </>
      )}
    </div>
  )
}
