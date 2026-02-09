import { env } from '@/lib/env'

type LockoutEntry = {
  count: number
  firstAttemptAt: number
  lockedUntil?: number
}

const store = new Map<string, LockoutEntry>()

export function checkLockout(key: string): { locked: boolean; retryAfterMs: number } {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry) return { locked: false, retryAfterMs: 0 }
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now }
  }
  return { locked: false, retryAfterMs: 0 }
}

export function recordLoginFailure(key: string) {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now - entry.firstAttemptAt > env.LOGIN_LOCKOUT_WINDOW_MS) {
    store.set(key, { count: 1, firstAttemptAt: now })
    return
  }
  const nextCount = entry.count + 1
  const updated: LockoutEntry = { ...entry, count: nextCount }
  if (nextCount >= env.LOGIN_LOCKOUT_THRESHOLD) {
    updated.lockedUntil = now + env.LOGIN_LOCKOUT_DURATION_MS
  }
  store.set(key, updated)
}

export function clearLoginFailures(key: string) {
  store.delete(key)
}
