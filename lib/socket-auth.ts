import { allowedOrigins } from '@/lib/env'
import { parseCookieHeader } from '@/lib/security'

export function isSocketOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) return false
  return allowedOrigins.includes(origin)
}

export function getSessionTokenFromCookie(cookieHeader: string | null | undefined): string | null {
  const cookies = parseCookieHeader(cookieHeader || null)
  return cookies['session_token'] ?? null
}
