import { store, type DemoStore } from './data'
import { stageFromResult, type CrmActivity } from '@/lib/crm/types'

type Filter = ['eq' | 'gte' | 'lte' | 'ilike', string, any]
type Order = [string, boolean]

const isIso = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
const cmp = (a: any, b: any) => (isIso(a) ? +new Date(a) - +new Date(b) : a < b ? -1 : a > b ? 1 : 0)

// Stands in for the crm_apply_activity trigger, so logging a call in demo mode
// moves the clinic's stage and next action exactly as it would in Postgres.
function applyDemoActivity(activity: CrmActivity): void {
  const p = store.crm_prospects.find((x) => x.id === activity.prospect_id)
  if (!p) return
  if (p.last_activity_at && activity.created_at < p.last_activity_at) return

  const stage = stageFromResult(activity.result)
  const closed = stage === 'won' || stage === 'lost'
  if (stage) p.stage = stage
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

// A tiny chainable stand in for the Supabase query builder, backed by the
// in memory demo store. Supports the handful of operations the app uses.
class DemoQuery<K extends keyof DemoStore> {
  private filters: Filter[] = []
  private orders: Order[] = []
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: any = null
  private one = false
  private limitN?: number

  constructor(private table: K, private scope?: string, private repScope?: string) {}

  select() {
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
