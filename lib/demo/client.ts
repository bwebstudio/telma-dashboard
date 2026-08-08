import { store, type DemoStore } from './data'
import { nextStage, stageFromResult, type CrmActivity } from '@/lib/crm/types'
import type { Appointment, Call } from '@/lib/types'

type Filter = ['eq' | 'gte' | 'lte' | 'ilike' | 'is', string, any]
type Order = [string, boolean]

const isIso = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
const cmp = (a: any, b: any) => (isIso(a) ? +new Date(a) - +new Date(b) : a < b ? -1 : a > b ? 1 : 0)

// Stands in for the crm_apply_activity trigger, so logging a call in demo mode
// moves the clinic's stage and next action exactly as it would in Postgres.
function applyDemoActivity(activity: CrmActivity): void {
  const p = store.crm_prospects.find((x) => x.id === activity.prospect_id)
  if (!p) return
  if (p.last_activity_at && activity.created_at < p.last_activity_at) return

  const proposed = stageFromResult(activity.result)
  const closed = proposed === 'won' || proposed === 'lost'
  p.stage = nextStage(p.stage, activity.result)
  if (activity.next_action_at) {
    p.next_action_at = activity.next_action_at
    p.next_action_text = activity.next_action_text ?? null
  } else if (closed) {
    p.next_action_at = null
    p.next_action_text = null
  }
  p.last_activity_at = activity.created_at
  p.updated_at = new Date().toISOString()
}

const HOLDS: Appointment['status'][] = ['pendente', 'confirmada', 'copiada']

// Stands in for available_slots(). Same rule as the SQL: the clinic's active
// slots for that weekday, minus the bookings already standing on them, minus
// the days the clinic is closed. Times are built in the machine's own zone,
// which is how the rest of the demo day is written.
function demoAvailableSlots(args: Record<string, any>) {
  const clinicId = String(args.p_clinic_id ?? '')
  const date = String(args.p_date ?? '')
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return []
  if (store.blocked_days.some((b) => b.clinic_id === clinicId && b.day === date)) return []

  const weekday = new Date(y, m - 1, d).getDay()

  return store.availability_slots
    .filter((s) => s.clinic_id === clinicId && s.active && s.weekday === weekday)
    .map((s) => {
      const [hh, mm] = s.start_time.split(':').map(Number)
      const start = new Date(y, m - 1, d, hh, mm ?? 0, 0, 0)
      const taken = store.appointments.filter(
        (a) =>
          a.clinic_id === clinicId &&
          HOLDS.includes(a.status) &&
          // A pre-marcação past its deadline has let the hour go, whether or
          // not anything has swept it yet. Same clause as the SQL.
          !(a.status === 'pendente' && a.expires_at && new Date(a.expires_at) <= new Date()) &&
          new Date(a.scheduled_at).getTime() === start.getTime()
      ).length
      return {
        slot_start: start.toISOString(),
        slot_end: s.end_time,
        remaining: s.capacity - taken,
      }
    })
    .filter((s) => s.remaining > 0)
    .sort((a, b) => +new Date(a.slot_start) - +new Date(b.slot_start))
}

// Stands in for record_call(): the call, the booking it produced, the month's
// meter and the two activity lines, in one step like the function it mirrors.
function demoRecordCall(args: Record<string, any>) {
  const clinicId = String(args.p_clinic_id ?? '')
  const duration = Number(args.p_duration ?? 0) || 0
  const at = new Date().toISOString()
  const callId = `demo-call-${store.calls.length + 1}`

  store.calls.push({
    id: callId,
    clinic_id: clinicId,
    channel: 'telefone',
    from_phone: (args.p_from_phone as string) ?? null,
    patient_name: (args.p_appointment?.patient_name as string) ?? null,
    duration_seconds: duration,
    result: (args.p_result as Call['result']) ?? null,
    summary: (args.p_summary as string) ?? null,
    transcript: null,
    recording_url: null,
    created_at: at,
    // Not on the Call type, which the panel never reads. Kept so a simulated
    // call can be found again and removed.
    external_ref: (args.p_external_ref as string) ?? null,
  } as Call)

  let appointmentId: string | null = null
  if (args.p_appointment) {
    appointmentId = `demo-appt-${store.appointments.length + 1}`
    store.appointments.push({
      id: appointmentId,
      clinic_id: clinicId,
      call_id: callId,
      patient_name: String(args.p_appointment.patient_name ?? ''),
      patient_phone: String(args.p_appointment.patient_phone ?? ''),
      reason: (args.p_appointment.reason as string) ?? null,
      scheduled_at: String(args.p_appointment.scheduled_at ?? at),
      status: 'pendente',
      // Stands in for trg_appts_expiry, including the part that reads the
      // clinic's own setting: thirty minutes when the clinic wants the hour
      // back, no deadline when it waits for a person.
      expires_at:
        store.clinics.find((c) => c.id === clinicId)?.pre_appointment_auto_expires === false
          ? null
          : new Date(Date.now() + 30 * 60_000).toISOString(),
      origin: (args.p_appointment.origin as Appointment['origin']) ?? 'telefone',
      summary: (args.p_summary as string) ?? null,
      reject_reason: null,
      decided_at: null,
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      cancel_seen_at: null,
      created_at: at,
    })
    store.activity_log.unshift({
      id: `act-${store.activity_log.length + 1}`,
      clinic_id: clinicId,
      type: 'appointment_created',
      message: `A Telma deixou uma pré-marcação para ${args.p_appointment.patient_name}`,
      created_at: at,
    })
  }

  const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-01`
  const minutes = Math.round((duration / 60) * 100) / 100
  const row = store.usage.find((u) => u.clinic_id === clinicId && u.month === month)
  if (row) {
    row.calls_count += 1
    row.minutes = Math.round((row.minutes + minutes) * 100) / 100
  } else {
    store.usage.push({
      id: `usage-${store.usage.length + 1}`,
      clinic_id: clinicId,
      month,
      calls_count: 1,
      minutes,
    })
  }

  store.activity_log.unshift({
    id: `act-${store.activity_log.length + 2}`,
    clinic_id: clinicId,
    type: 'call_received',
    message: 'A Telma atendeu uma chamada',
    created_at: at,
  })

  return { call_id: callId, appointment_id: appointmentId }
}

// A tiny chainable stand in for the Supabase query builder, backed by the
// in memory demo store. Supports the handful of operations the app uses.
class DemoQuery<K extends keyof DemoStore> {
  private filters: Filter[] = []
  private orders: Order[] = []
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: any = null
  private one = false
  private limitN?: number
  // Set by select(_, {count, head}): the caller wants how many, not which.
  private counting = false
  private headOnly = false

  constructor(private table: K, private scope?: string, private repScope?: string) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    if (opts?.count) this.counting = true
    if (opts?.head) this.headOnly = true
    return this
  }
  eq(col: string, val: any) {
    this.filters.push(['eq', col, val])
    return this
  }
  gte(col: string, val: any) {
    this.filters.push(['gte', col, val])
    return this
  }
  lte(col: string, val: any) {
    this.filters.push(['lte', col, val])
    return this
  }
  ilike(col: string, val: any) {
    this.filters.push(['ilike', col, val])
    return this
  }
  // Postgres `is null`. Only null is ever asked for here, but comparing
  // loosely keeps `is('x', null)` matching an undefined column in the seed.
  is(col: string, val: any) {
    this.filters.push(['is', col, val])
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push([col, opts?.ascending !== false])
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  maybeSingle() {
    this.one = true
    return this
  }
  single() {
    this.one = true
    return this
  }
  insert(payload: any) {
    this.op = 'insert'
    this.payload = payload
    return this
  }
  update(payload: any) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  // Mirrors what the CRM policies do in Postgres: a rep reaches their own
  // prospects plus the unassigned ones, and nothing of a colleague's.
  private visibleProspect(prospectId: string): boolean {
    if (!this.repScope) return true
    const p = store.crm_prospects.find((x) => x.id === prospectId)
    return !p || p.rep_id === this.repScope || p.rep_id === null
  }

  private matches(row: any): boolean {
    if (this.scope) {
      if ('clinic_id' in row && row.clinic_id !== this.scope) return false
      if (this.table === 'clinics' && row.id !== this.scope) return false
    }
    if (this.repScope) {
      if (this.table === 'crm_prospects' && !this.visibleProspect(row.id)) return false
      if (
        (this.table === 'crm_contacts' || this.table === 'crm_activities') &&
        !this.visibleProspect(row.prospect_id)
      ) {
        return false
      }
    }
    return this.filters.every(([kind, col, val]) => {
      const cell = row[col]
      if (kind === 'eq') return cell === val
      if (kind === 'gte') return cmp(cell, val) >= 0
      if (kind === 'lte') return cmp(cell, val) <= 0
      if (kind === 'ilike')
        return String(cell ?? '').toLowerCase().includes(String(val).replace(/%/g, '').toLowerCase())
      if (kind === 'is') return val === null ? cell == null : cell === val
      return true
    })
  }

  private run() {
    try {
      const rows = store[this.table] as any[]

      if (this.op === 'insert') {
        let items = Array.isArray(this.payload) ? this.payload : [this.payload]
        // Stands in for the unique index on crm_activities.client_ref: a retry
        // from the offline queue is a no-op here too.
        if (this.table === 'crm_activities') {
          items = items.filter(
            (it: any) => !it.client_ref || !rows.some((r) => r.client_ref === it.client_ref)
          )
          if (items.length === 0) return { data: this.one ? null : [], error: null }
        }
        const inserted = items.map((it: any, i: number) => ({
          id: it.id ?? `demo-${this.table}-${rows.length + i + 1}`,
          created_at: it.created_at ?? new Date().toISOString(),
          ...it,
          // Stands in for the generated column on crm_prospects.
          ...(this.table === 'crm_prospects'
            ? {
                phone_digits: String(it.phone ?? '').replace(/\D/g, ''),
                updated_at: it.updated_at ?? new Date().toISOString(),
              }
            : {}),
        }))
        rows.push(...inserted)
        if (this.table === 'crm_activities') {
          inserted.forEach((a: any) => applyDemoActivity(a as CrmActivity))
        }
        return { data: this.one ? inserted[0] : inserted, error: null }
      }

      if (this.op === 'update') {
        const matched = rows.filter((r) => this.matches(r))
        matched.forEach((r) => Object.assign(r, this.payload))
        return { data: this.one ? matched[0] ?? null : matched, error: null }
      }

      if (this.op === 'delete') {
        ;(store as any)[this.table] = rows.filter((r) => !this.matches(r))
        return { data: null, error: null }
      }

      // select
      let res = rows.filter((r) => this.matches(r))
      for (const [col, asc] of [...this.orders].reverse()) {
        res = res.slice().sort((a, b) => (asc ? cmp(a[col], b[col]) : -cmp(a[col], b[col])))
      }
      if (this.limitN != null) res = res.slice(0, this.limitN)
      if (this.counting || this.headOnly) {
        return { data: this.headOnly ? null : res, count: res.length, error: null }
      }
      return { data: this.one ? res[0] ?? null : res, error: null }
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'demo_error' } }
    }
  }

  then(onF: (v: any) => any, onR?: (e: any) => any) {
    return Promise.resolve(this.run()).then(onF, onR)
  }
}

export function createDemoClient(scope?: string, repScope?: string): any {
  let userCounter = store.users.length
  return {
    from(table: keyof DemoStore) {
      return new DemoQuery(table, scope, repScope)
    },
    rpc(name: string, args?: Record<string, any>) {
      // The only RPC the browsable demo needs to answer for real: without it
      // the overlap warning on the new clinic form could not be demonstrated.
      if (name === 'crm_find_duplicates') {
        const digits = String(args?.p_phone ?? '').replace(/\D/g, '')
        const needle = String(args?.p_name ?? '').trim().toLowerCase()
        if (digits.length < 6 && needle.length < 3) {
          return Promise.resolve({ data: [], error: null })
        }
        const matches = (n: string, phone: string | null) =>
          (digits.length >= 6 && (phone ?? '').replace(/\D/g, '') === digits) ||
          (needle.length >= 3 && n.toLowerCase().includes(needle))

        const data = [
          ...store.crm_prospects
            .filter((p) => matches(p.name, p.phone))
            .map((p) => ({
              kind: 'prospect',
              id: p.id,
              name: p.name,
              zone: p.zone,
              phone: p.phone,
              rep_name: store.crm_reps.find((r) => r.id === p.rep_id)?.full_name ?? null,
              stage: p.stage,
            })),
          ...store.clinics
            .filter((c) => matches(c.name, c.phone))
            .map((c) => ({
              kind: 'client',
              id: c.id,
              name: c.name,
              zone: null,
              phone: c.phone,
              rep_name: null,
              stage: c.status,
            })),
        ]
        return Promise.resolve({ data, error: null })
      }
      // The two the simulated call needs. Without them the demo could show the
      // form and nothing else: no agenda would move, no minute would be spent,
      // and the one thing the demo exists to show is the loop closing.
      if (name === 'available_slots') {
        return Promise.resolve({ data: demoAvailableSlots(args ?? {}), error: null })
      }
      if (name === 'record_call') {
        return Promise.resolve({ data: demoRecordCall(args ?? {}), error: null })
      }

      return Promise.resolve({ data: {}, error: null })
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      admin: {
        createUser: () =>
          Promise.resolve({ data: { user: { id: `demo-user-${++userCounter}` } }, error: null }),
      },
    },
  }
}
