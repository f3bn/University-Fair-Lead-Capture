import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { allowedHosts, allowedOrigins, env } from '@/lib/env'

export function getAllowedOrigins(): string[] {
  return allowedOrigins
}

export function getAllowedHosts(): string[] {
  return allowedHosts
}

export function isOriginAllowed(origin: string | null, allowed: string[] = allowedOrigins): boolean {
  if (!origin) return false
  return allowed.includes(origin)
}

export function getCorsHeaders(origin: string | null, allowed: string[] = allowedOrigins): Record<string, string> {
  if (origin && allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    }
  }
  return {}
}

export function getRequestHost(request: NextRequest): string | null {
  const forwarded = env.TRUST_PROXY ? request.headers.get('x-forwarded-host') : null
  const host = (forwarded || request.headers.get('host') || '').split(',')[0]?.trim().toLowerCase()
  return host || null
}

export function isHostAllowed(host: string | null, allowed: string[] = allowedHosts): boolean {
  if (!host) return false
  return allowed.includes(host)
}

export function enforceHost(request: NextRequest): NextResponse | null {
  const host = getRequestHost(request)
  if (!isHostAllowed(host)) {
    return NextResponse.json({ error: 'Invalid host' }, { status: 400 })
  }
  return null
}

export function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

export function enforceCors(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')
  const allowed = getAllowedOrigins()
  if (!origin) {
    if (isStateChangingMethod(request.method)) {
      return NextResponse.json({ error: 'Origin required' }, { status: 403 })
    }
    return null
  }
  if (!isOriginAllowed(origin, allowed)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }
  return null
}

export function getClientIp(request: NextRequest): string {
  if (env.TRUST_PROXY) {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    const realIp = request.headers.get('x-real-ip')
    if (realIp) return realIp
  }
  return 'unknown'
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {}
  if (!cookieHeader) return result
  cookieHeader.split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=')
    if (!key) return
    result[key] = decodeURIComponent(rest.join('=') || '')
  })
  return result
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function verifyOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (origin && isOriginAllowed(origin)) {
    return true
  }
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const url = new URL(referer)
      return isOriginAllowed(url.origin)
    } catch {
      return false
    }
  }
  return false
}

export function verifyCsrf(request: NextRequest): boolean {
  const headerToken = request.headers.get('x-csrf-token')
  if (!headerToken) return false
  const cookies = parseCookieHeader(request.headers.get('cookie'))
  const cookieToken = cookies['csrf_token']
  if (!cookieToken) return false
  return safeEqual(cookieToken, headerToken)
}

export function requireCsrf(request: NextRequest): NextResponse | null {
  if (!isStateChangingMethod(request.method)) {
    return null
  }
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Origin validation failed' }, { status: 403 })
  }
  if (!verifyCsrf(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
  }
  return null
}

export function requireOrigin(request: NextRequest): NextResponse | null {
  if (!verifyOrigin(request)) {
    return NextResponse.json({ error: 'Origin validation failed' }, { status: 403 })
  }
  return null
}
