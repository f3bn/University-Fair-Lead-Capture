import { describe, expect, it } from 'vitest'
import { shouldRequireAuth, isAdminPath } from '@/lib/route-guard'
import { assertRole, assertExpoScope } from '@/lib/authorization'
import { requireCsrf, requireOrigin, enforceCors } from '@/lib/security'
import { checkLockout, recordLoginFailure, clearLoginFailures } from '@/lib/login-security'
import { isSocketOriginAllowed, getSessionTokenFromCookie } from '@/lib/socket-auth'
import { allowedOrigins } from '@/lib/env'

function makeRequest(method: string, headers: Record<string, string> = {}) {
  return {
    method,
    headers: new Headers(headers),
  } as unknown as Request
}

describe('route protection', () => {
  it('blocks unauthenticated access to protected pages', () => {
    expect(shouldRequireAuth('/login')).toBe(false)
    expect(shouldRequireAuth('/')).toBe(false)
    expect(shouldRequireAuth('/dashboard')).toBe(true)
    expect(shouldRequireAuth('/leads')).toBe(true)
    expect(shouldRequireAuth('/scan')).toBe(true)
    expect(shouldRequireAuth('/admin/settings')).toBe(true)
    expect(isAdminPath('/admin/settings')).toBe(true)
  })

  it('enforces admin role for admin routes/exports', () => {
    expect(() => assertRole('operator', 'admin')).toThrow()
    expect(() => assertRole('admin', 'admin')).not.toThrow()
  })
})

describe('csrf + origin checks', () => {
  it('blocks state-changing requests without csrf token', () => {
    const req = makeRequest('POST', { origin: allowedOrigins[0] })
    const res = requireCsrf(req as any)
    expect(res?.status).toBe(403)
  })

  it('allows csrf when token and origin are valid', () => {
    const token = 'csrf-token'
    const req = makeRequest('POST', {
      origin: allowedOrigins[0],
      'x-csrf-token': token,
      cookie: `csrf_token=${token}`,
    })
    const res = requireCsrf(req as any)
    expect(res).toBeNull()
  })

  it('blocks invalid origins on sensitive GET endpoints', () => {
    const req = makeRequest('GET', { origin: 'https://evil.example' })
    const res = requireOrigin(req as any)
    expect(res?.status).toBe(403)
  })

  it('rejects CORS for invalid origin', () => {
    const req = makeRequest('POST', { origin: 'https://evil.example' })
    const res = enforceCors(req as any)
    expect(res?.status).toBe(403)
  })
})

describe('login lockout', () => {
  it('locks out after repeated failures', () => {
    const key = 'login:test'
    clearLoginFailures(key)
    recordLoginFailure(key)
    expect(checkLockout(key).locked).toBe(false)
    recordLoginFailure(key)
    expect(checkLockout(key).locked).toBe(false)
    recordLoginFailure(key)
    expect(checkLockout(key).locked).toBe(true)
  })
})

describe('idor protection', () => {
  it('rejects cross-expo access', () => {
    expect(() => assertExpoScope('expoA', 'expoB')).toThrow()
  })
})

describe('socket security', () => {
  it('rejects invalid origin and missing session token', () => {
    expect(isSocketOriginAllowed('https://evil.example')).toBe(false)
    expect(isSocketOriginAllowed(allowedOrigins[0])).toBe(true)
    expect(getSessionTokenFromCookie(null)).toBeNull()
  })
})
