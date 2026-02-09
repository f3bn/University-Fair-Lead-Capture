import { NextResponse, type NextRequest } from 'next/server'
import { enforceCors, enforceHost, getAllowedOrigins, getCorsHeaders } from '@/lib/security'
import { shouldRequireAuth } from '@/lib/route-guard'
import { env } from '@/lib/env'

export async function middleware(request: NextRequest) {
  const hostCheck = enforceHost(request)
  if (hostCheck) return hostCheck

  if (request.nextUrl.pathname.startsWith('/api')) {
    const corsCheck = enforceCors(request)
    if (corsCheck) return corsCheck

    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('origin')
      const allowed = getAllowedOrigins()
      const headers = getCorsHeaders(origin, allowed)
      return new NextResponse(null, {
        status: 204,
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
        },
      })
    }
  }

  if (shouldRequireAuth(request.nextUrl.pathname)) {
    const sessionCookie = request.cookies.get('session_token')?.value
    if (!sessionCookie) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
  }

  const response = NextResponse.next()

  const isProd = env.NODE_ENV === 'production'
  const socketOrigins = getAllowedOrigins()
    .map((origin) => origin.replace('https://', 'wss://').replace('http://', 'ws://'))
    .join(' ')
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "script-src-attr 'none'",
    `connect-src 'self' ${socketOrigins}`.trim(),
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  const allowCamera = request.nextUrl.pathname.startsWith('/scan')
  response.headers.set(
    'Permissions-Policy',
    allowCamera ? 'camera=(self), microphone=(), geolocation=()' : 'camera=(), microphone=(), geolocation=()'
  )
  if (isProd) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }

  if (request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin')
    const allowed = getAllowedOrigins()
    const headers = getCorsHeaders(origin, allowed)
    Object.entries(headers).forEach(([key, value]) => {
      if (value) response.headers.set(key, value)
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
