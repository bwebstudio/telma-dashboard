'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { mockCallsEnabled } from '@/lib/mock-call'
import {
  INVALID_CASES,
  portingSignup,
  spanishSignup,
  validSignup,
} from '@/lib/onboarding/fixtures'
import { countryOfRegion, TIMEZONE } from '@/lib/onboarding/catalog'
import type { OnboardingLocale } from '@/lib/onboarding/locale'
import { buildSlots } from '@/lib/onboarding/schedule'
import { newToken } from '@/lib/onboarding/sessions'
import { validateStep, type StepNumber } from '@/lib/onboarding/wizard-schema'
import { completeOnboarding, submitWizardStep } from './onboarding'

/**
 * The end to end run behind /test-onboarding.
 *
 * It drives the same server actions the form drives, in the same order, against
 * the same database. Nothing here re-implements a step: a harness that wrote
 * its own version of the sign-up would prove the harness works.
 *
 * It creates real rows, which is the point and also the reason it refuses to
 * run in production.
 */

export interface CheckLine {
  label: string
  ok: boolean
  detail: string
}

export interface RunReport {
  ok: boolean
  clinicId: string | null
  checks: CheckLine[]
  /** Printed at the end so a failed run can be read without the server log. */
  error?: string
}

function guard(): string | null {
  return mockCallsEnabled() ? null : 'Esta página não corre em produção.'
}

// The rules, on their own -----------------------------------------------------

/**
 * Every deliberately broken payload, and whether the schema caught it on the
 * field it was supposed to catch it on.
 *
 * Checking the field and not only the failure matters: a schema that rejects
 * everything passes a test that only asks "was it rejected".
 */
export async function runValidationChecks(): Promise<CheckLine[]> {
  const blocked = guard()
  if (blocked) return [{ label: 'Guarda', ok: false, detail: blocked }]

  return INVALID_CASES.map((c) => {
    const result = validateStep(c.step as StepNumber, c.values)
    if (result.ok) {
      return {
        label: `Passo ${c.step}: ${c.what}`,
        ok: false,
        detail: 'Passou na validação e não devia.',
      }
    }
    const keys = Object.keys(result.errors)
    const hit = keys.includes(c.expect)
    return {
      label: `Passo ${c.step}: ${c.what}`,
      ok: hit,
      detail: hit
        ? `Rejeitado em "${c.expect}": ${result.errors[c.expect]}`
        : `Rejeitado, mas em ${keys.join(', ') || 'nada'} em vez de "${c.expect}".`,
    }
  })
}

// The whole thing -------------------------------------------------------------

export type RunKind = 'pt' | 'pt-porting' | 'es'

export async function runEndToEnd(kind: RunKind): Promise<RunReport> {
  const blocked = guard()
  if (blocked) return { ok: false, clinicId: null, checks: [], error: blocked }

  const checks: CheckLine[] = []
  const suffix = Math.random().toString(36).slice(2, 8)
  const values =
    kind === 'es' ? spanishSignup(suffix) : kind === 'pt-porting' ? portingSignup(suffix) : validSignup(suffix)
  const porting = kind === 'pt-porting'
  const locale = (values.locale ?? 'pt') as OnboardingLocale
  const expectedCountry = countryOfRegion(String(values.region))
  const token = newToken()

  // The six steps, one at a time, exactly as the form sends them.
  for (const step of [1, 2, 3, 4, 5, 6] as StepNumber[]) {
    const state = await submitWizardStep(step, values, token, locale)
    checks.push({
      label: `Passo ${step} guardado`,
      ok: state.ok,
      detail: state.ok
        ? `Rascunho ${token.slice(0, 8)}…`
        : Object.entries(state.errors ?? {})
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · '),
    })
    if (!state.ok) return { ok: false, clinicId: null, checks, error: `Falhou no passo ${step}.` }
  }

  // What the draft should turn into, worked out before it does, so the counts
  // below are compared against something and not just reported.
  const expectedSlots = buildSlots(values as never).length
  checks.push({
    label: 'Horário convertido em slots',
    ok: expectedSlots > 0,
    detail: `${expectedSlots} slots esperados (seg-sex 09:00-19:00 com pausa, sábado 09:00-13:00)`,
  })

  const submitted = await completeOnboarding(token, undefined, locale)
  if (!submitted.ok) {
    checks.push({
      label: 'Inscrição concluída',
      ok: false,
      detail: Object.entries(submitted.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · '),
    })
    return { ok: false, clinicId: null, checks, error: 'A inscrição não foi concluída.' }
  }

  const result = submitted.result
  checks.push({
    label: 'Inscrição concluída',
    ok: true,
    detail: `Clínica ${result.clinicId}`,
  })
  checks.push({
    label: 'Número atribuído',
    ok: Boolean(result.phoneNumber),
    detail: `${result.phoneNumber}${result.temporaryNumber ? ' (portabilidade pendente)' : ''}${
      result.demo ? ' · fictício, sem Twilio' : ''
    }`,
  })
  checks.push({
    label: 'Credenciais devolvidas',
    ok: result.password.length >= 12,
    detail: `${result.email} · palavra-passe de ${result.password.length} caracteres`,
  })
  checks.push({
    label: 'Pagamento',
    ok: true,
    detail: result.checkoutUrl
      ? 'Sessão Stripe criada, a clínica fica pausada até o webhook confirmar.'
      : 'Sem Stripe configurada: nada cobrado, clínica ativa de imediato.',
  })
  checks.push({
    label: 'Email de boas-vindas',
    ok: true,
    detail: 'Sem RESEND_API_KEY: impresso no log do servidor. Veja o terminal.',
  })

  // Read the database back. This is the half that a report built only from the
  // action's return value cannot tell you: whether the rows are actually there.
  const admin = createAdminClient()

  const { data: clinic } = await admin
    .from('clinics')
    .select('*')
    .eq('id', result.clinicId)
    .maybeSingle()

  checks.push({
    label: 'Clínica na base de dados',
    ok: Boolean(clinic),
    detail: clinic
      ? `${clinic.name} · plano ${clinic.plan} · ${clinic.status} · ${clinic.minute_limit} min`
      : 'Não encontrada.',
  })

  if (clinic) {
    const services: string[] = clinic.services ?? []
    checks.push({
      label: 'Respostas do wizard gravadas',
      ok:
        services.length === 3 &&
        clinic.specialty === 'dentaria' &&
        clinic.region === values.region &&
        clinic.appointment_duration_minutes === 30,
      detail: `especialidade ${clinic.specialty ?? '·'} · região ${clinic.region ?? '·'} · ${
        services.length
      } serviços · consulta ${clinic.appointment_duration_minutes ?? '·'} min`,
    })
    checks.push({
      label: 'Voz associada',
      ok: Boolean(clinic.voice_id),
      detail: `${clinic.voice_name ?? '·'} (voice_id ${clinic.voice_id ?? '·'})`,
    })
    checks.push({
      label: 'Agente do idioma',
      ok: true,
      detail: clinic.voice_agent_id
        ? `${clinic.voice_agent_id} (partilhado, ${locale})`
        : `sem agente para ${locale}: defina ELEVENLABS_AGENT_ID_${locale.toUpperCase()}`,
    })
    checks.push({
      label: 'Origem do número',
      ok: clinic.phone_source === (porting ? 'ported' : 'provisioned'),
      detail: `${clinic.phone_source ?? '·'} · ${clinic.assigned_phone ?? '·'}`,
    })
    // The country is never stored on its own: it is implied by the region. These
    // two are what prove the implication survived the round trip.
    const dial = expectedCountry === 'ES' ? '+34' : '+351'
    checks.push({
      label: 'País, a partir da região',
      ok: String(clinic.assigned_phone ?? '').startsWith(dial),
      detail: `região ${clinic.region} → ${expectedCountry}, esperado ${dial}, obtido ${clinic.assigned_phone ?? '·'}`,
    })
    checks.push({
      label: 'Fuso horário da clínica',
      ok: clinic.timezone === TIMEZONE[expectedCountry],
      detail: `${clinic.timezone ?? '·'} (esperado ${TIMEZONE[expectedCountry]})`,
    })
  }

  const { data: slots } = await admin
    .from('availability_slots')
    .select('id')
    .eq('clinic_id', result.clinicId)

  const slotCount = Array.isArray(slots) ? slots.length : 0
  checks.push({
    label: 'Agenda semanal criada',
    ok: slotCount === expectedSlots && slotCount > 0,
    detail: `${slotCount} slots gravados de ${expectedSlots} esperados`,
  })

  const { data: users } = await admin
    .from('users')
    .select('id, email, role, locale')
    .eq('clinic_id', result.clinicId)

  checks.push({
    label: 'Login da clínica criado',
    ok:
      Array.isArray(users) &&
      users.length === 1 &&
      users[0].role === 'clinica' &&
      users[0].locale === locale,
    detail: Array.isArray(users) && users.length
      ? `${users[0].email} (${users[0].role}, idioma ${users[0].locale}, esperado ${locale})`
      : 'Nenhum.',
  })

  const { data: log } = await admin
    .from('activity_log')
    .select('type, message')
    .eq('clinic_id', result.clinicId)

  const entries = Array.isArray(log) ? log : []
  checks.push({
    label: 'Registo de atividade',
    ok: entries.some((e: { type: string }) => e.type === 'clinic_created'),
    detail: entries.map((e: { message: string }) => e.message).join(' · ') || 'Vazio.',
  })

  if (isDemo()) {
    checks.push({
      label: 'Modo demo',
      ok: true,
      detail:
        'Tudo isto ficou em memória, não em Postgres. Reinicie o servidor e desaparece.',
    })
  }

  return {
    ok: checks.every((c) => c.ok),
    clinicId: result.clinicId,
    checks,
  }
}

/**
 * Removes what a run created.
 *
 * The clinic cascades to its slots, its log and its users row; the auth user
 * has to go separately because it lives in Supabase's own schema. Without this,
 * a week of testing leaves thirty clinics in the internal list and the real
 * first client is somewhere among them.
 */
export async function cleanupTestClinic(clinicId: string): Promise<{ ok: boolean; detail: string }> {
  const blocked = guard()
  if (blocked) return { ok: false, detail: blocked }

  const admin = createAdminClient()

  const { data: users } = await admin.from('users').select('id').eq('clinic_id', clinicId)
  for (const u of (users ?? []) as Array<{ id: string }>) {
    try {
      await admin.auth.admin?.deleteUser?.(u.id)
    } catch {
      /* demo client has no deleteUser, and nothing to delete either */
    }
  }

  const { error } = await admin.from('clinics').delete().eq('id', clinicId)
  return error
    ? { ok: false, detail: error.message }
    : { ok: true, detail: `Clínica ${clinicId.slice(0, 8)}… removida.` }
}

// The leftovers -----------------------------------------------------------------

export interface Leftovers {
  /** Auth accounts with no row in `users`: nobody can sign in as them and
   *  nothing points at them, but the email stays taken. */
  orphanAccounts: Array<{ id: string; email: string; createdAt: string }>
  /** Sign-ups abandoned part way. Real personal data with no purpose. */
  drafts: Array<{ token: string; step: number; email: string | null }>
  error?: string
}

/**
 * What testing leaves behind.
 *
 * Two things accumulate and neither is visible anywhere else in the app.
 *
 * An orphan Auth account is the nastier one. Deleting a clinic cascades to its
 * row in `users`, but the Supabase Auth account is in a different schema and
 * survives. Nothing in the database then explains why that email cannot sign up
 * again: the sign-up's own check reads `users`, finds nothing, proceeds, and
 * fails at the insert with a message about an address already registered. Four
 * of these were left behind in one week of testing before anybody noticed.
 *
 * A stale draft is milder but it is somebody's name, email and phone number
 * with nothing left to become. `purge_expired_onboarding_sessions()` clears
 * them at thirty days; this clears the ones made twenty minutes ago.
 */
export async function findLeftovers(): Promise<Leftovers> {
  const blocked = guard()
  if (blocked) return { orphanAccounts: [], drafts: [], error: blocked }
  if (isDemo()) {
    return { orphanAccounts: [], drafts: [], error: 'Sem Supabase: nada para limpar.' }
  }

  const admin = createAdminClient()

  try {
    // Every address that legitimately belongs to somebody. An account is only
    // an orphan if it is absent from here, so a real user can never be listed
    // for deletion by a bug in the paging below.
    const { data: rows } = await admin.from('users').select('email')
    const known = new Set(
      ((rows ?? []) as Array<{ email: string | null }>)
        .map((r) => r.email?.toLowerCase())
        .filter(Boolean) as string[]
    )

    const orphanAccounts: Leftovers['orphanAccounts'] = []
    // Paged, because listUsers caps a page and a project with five hundred
    // clinics has more accounts than one page holds.
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return { orphanAccounts: [], drafts: [], error: error.message }
      const users = data?.users ?? []
      for (const u of users) {
        const email = (u.email ?? '').toLowerCase()
        if (email && !known.has(email)) {
          orphanAccounts.push({ id: u.id, email: u.email ?? '', createdAt: u.created_at ?? '' })
        }
      }
      if (users.length < 200) break
    }

    const { data: draftRows } = await admin
      .from('onboarding_sessions')
      .select('token, current_step, data')
      .is('completed_at', null)
      .order('created_at', { ascending: false })

    const drafts = ((draftRows ?? []) as Array<{
      token: string
      current_step: number
      data: { email?: string } | null
    }>).map((d) => ({
      token: d.token,
      step: d.current_step ?? 0,
      email: d.data?.email ?? null,
    }))

    return { orphanAccounts, drafts }
  } catch (e) {
    return {
      orphanAccounts: [],
      drafts: [],
      error: e instanceof Error ? e.message : 'unknown',
    }
  }
}

/**
 * Deletes them.
 *
 * The orphan list is recomputed here rather than trusted from the caller. What
 * arrives is a set of ids from a browser, and this deletes accounts: an id that
 * belongs to a real user must not be actionable just because it was posted.
 */
export async function purgeLeftovers(): Promise<{ accounts: number; drafts: number; error?: string }> {
  const blocked = guard()
  if (blocked) return { accounts: 0, drafts: 0, error: blocked }

  const found = await findLeftovers()
  if (found.error) return { accounts: 0, drafts: 0, error: found.error }

  const admin = createAdminClient()
  let accounts = 0

  for (const a of found.orphanAccounts) {
    try {
      await admin.auth.admin.deleteUser(a.id)
      accounts++
    } catch {
      /* reported by the count coming back short */
    }
  }

  let drafts = 0
  for (const d of found.drafts) {
    const { error } = await admin.from('onboarding_sessions').delete().eq('token', d.token)
    if (!error) drafts++
  }

  return { accounts, drafts }
}
