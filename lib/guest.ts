import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { env } from './env'

const GUEST_COOKIE_NAME = 'guest_token'
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000

export function getGuestCookieName() {
  return GUEST_COOKIE_NAME
}

export function getAppSecret(): string {
  return env.APP_SECRET
}

export function createGuestToken(expoId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs
  const nonce = randomBytes(8).toString('hex')
  const payload = `${exp}.${expoId}.${nonce}`
  const signature = createHmac('sha256', getAppSecret()).update(payload).digest('hex')
  return `${payload}.${signature}`
}

export function verifyGuestToken(token: string | null | undefined, expoId?: string): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 4) return false
  const [expPart, tokenExpoId, nonce, signature] = parts
  const exp = Number(expPart)
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  if (expoId && tokenExpoId !== expoId) return false
  const payload = `${expPart}.${tokenExpoId}.${nonce}`
  const expected = createHmac('sha256', getAppSecret()).update(payload).digest('hex')
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}
