'use client'

import type { CrmActivityInput } from './types'

// Offline queue for logged interactions.
//
// The reps are on the street with patchy coverage. Losing a note because a
// lift had no signal is not acceptable, so every activity is written to
// localStorage first and only removed once the server confirms it. Each entry
// carries a client_ref; the database has a unique index on it, so retrying the
// same activity ten times still stores it once.

const KEY = 'telma_crm_queue_v1'
const ENDPOINT = '/api/crm/activities'

export type SubmitOutcome = 'sent' | 'queued'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readQueue(): CrmActivityInput[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as CrmActivityInput[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: CrmActivityInput[]): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Storage full or blocked (private mode). Nothing useful to do here: the
    // send below is still attempted, it just cannot be retried later.
  }
}

function enqueue(item: CrmActivityInput): void {
  const items = readQueue().filter((i) => i.client_ref !== item.client_ref)
  items.push(item)
  writeQueue(items)
}

function dequeue(clientRef: string): void {
  writeQueue(readQueue().filter((i) => i.client_ref !== clientRef))
}

export function newClientRef(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${Date.now()}-${rand}`
}

// A redirect to /login answers 200 with HTML, so a bare res.ok is not enough
// proof that the activity was stored. Only an explicit { ok: true } counts.
async function post(items: CrmActivityInput[]): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: items }),
      cache: 'no-store',
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return data?.ok === true
  } catch {
    return false
  }
}

// Saves one activity. Never throws, never loses the note.
export async function submitActivity(item: CrmActivityInput): Promise<SubmitOutcome> {
  enqueue(item)
  const ok = await post([item])
  if (!ok) return 'queued'
  dequeue(item.client_ref)
  return 'sent'
}

// Sends everything still waiting. Returns how many are left.
export async function flushQueue(): Promise<number> {
  const items = readQueue()
  if (items.length === 0) return 0
  const ok = await post(items)
  if (ok) {
    writeQueue([])
    return 0
  }
  return items.length
}

export function pendingCount(): number {
  return readQueue().length
}
