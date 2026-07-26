import { store, type DemoStore } from './data'

type Filter = ['eq' | 'gte' | 'lte' | 'ilike', string, any]
type Order = [string, boolean]

const isIso = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
const cmp = (a: any, b: any) => (isIso(a) ? +new Date(a) - +new Date(b) : a < b ? -1 : a > b ? 1 : 0)

// A tiny chainable stand in for the Supabase query builder, backed by the
// in memory demo store. Supports the handful of operations the app uses.
class DemoQuery<K extends keyof DemoStore> {
  private filters: Filter[] = []
  private orders: Order[] = []
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: any = null
  private one = false
  private limitN?: number

  constructor(private table: K, private scope?: string) {}

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

  private matches(row: any): boolean {
    if (this.scope) {
      if ('clinic_id' in row && row.clinic_id !== this.scope) return false
      if (this.table === 'clinics' && row.id !== this.scope) return false
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
        const items = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted = items.map((it: any, i: number) => ({
          id: it.id ?? `demo-${this.table}-${rows.length + i + 1}`,
          created_at: it.created_at ?? new Date().toISOString(),
          ...it,
        }))
        rows.push(...inserted)
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

export function createDemoClient(scope?: string): any {
  let userCounter = store.users.length
  return {
    from(table: keyof DemoStore) {
      return new DemoQuery(table, scope)
    },
    rpc() {
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
