import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  createSession,
  setSessionCookie,
  setCsrfCookie,
  generateCsrfToken,
  hashPassword,
  getOrCreateExpo,
  revokeSession,
} from '@/lib/auth'
import { loginSchema } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp, requireCsrf } from '@/lib/security'
import { env } from '@/lib/env'
import { checkLockout, recordLoginFailure, clearLoginFailures } from '@/lib/login-security'
import { logSecurityEvent } from '@/lib/security-log'

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  const ip = getClientIp(request)
  const rate = rateLimit(`login:${ip}`, {
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
    max: env.LOGIN_RATE_LIMIT_MAX,
  })
  if (!rate.allowed) {
    logSecurityEvent({ event: 'rate_limit', key: 'login', ip })
    return NextResponse.json(
      { error: 'طلبات كثيرة، حاول لاحقًا' },
      { status: 429, headers: { 'Retry-After': rate.retryAfter.toString() } }
    )
  }

  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'البيانات غير صالحة' }, { status: 400 })
    }

    const { email, password } = parsed.data
    const normalizedEmail = email.toLowerCase()
    const lockKey = `login:${normalizedEmail}:${ip}`
    const lock = checkLockout(lockKey)
    if (lock.locked) {
      return NextResponse.json(
        { error: 'طلبات كثيرة، حاول لاحقًا' },
        { status: 429, headers: { 'Retry-After': Math.ceil(lock.retryAfterMs / 1000).toString() } }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!user) {
      recordLoginFailure(lockKey)
      logSecurityEvent({ event: 'login_failed', ip, reason: 'invalid_credentials' })
      return NextResponse.json({ error: 'البيريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 })
    }

    const verification = await verifyPassword(password, user.passwordHash)

    if (!verification.ok) {
      recordLoginFailure(lockKey)
      logSecurityEvent({ event: 'login_failed', ip, reason: 'invalid_credentials' })
      return NextResponse.json({ error: 'البيريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 })
    }

    if (verification.needsRehash) {
      const newHash = await hashPassword(password)
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      })
    }

    clearLoginFailures(lockKey)

    const existingToken = request.cookies.get('session_token')?.value
    if (existingToken) {
      await revokeSession(existingToken)
    }
    const token = await createSession(user.id)
    await setSessionCookie(token)
    await setCsrfCookie(generateCsrfToken())

    const expo = await getOrCreateExpo()
    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
    })
    logSecurityEvent({ event: 'login_success', userId: user.id, expoId: expo.id, ip })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch {
    return NextResponse.json({ error: 'حدث خطأ في تسجيل الدخول' }, { status: 500 })
  }
}
