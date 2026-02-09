import { cookies } from 'next/headers'
import { prisma } from './prisma'
import { createHash, randomBytes } from 'crypto'
import argon2 from 'argon2'
import { env } from './env'
import { logSecurityEvent } from './security-log'

const SESSION_COOKIE_NAME = 'session_token'
const CSRF_COOKIE_NAME = 'csrf_token'
const SESSION_DURATION_MS = env.SESSION_TTL_MINUTES * 60 * 1000
const SESSION_REFRESH_MS = env.SESSION_REFRESH_MINUTES * 60 * 1000

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  })
}

function verifyLegacyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const computedHash = createHash('sha256').update(password + salt).digest('hex')
  return hash === computedHash
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (storedHash.startsWith('$argon2')) {
    const ok = await argon2.verify(storedHash, password)
    const needsRehash = ok && argon2.needsRehash(storedHash, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    })
    return { ok, needsRehash }
  }
  const ok = verifyLegacyPassword(password, storedHash)
  return { ok, needsRehash: ok }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  })

  return token
}

export async function rotateSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } })
}

export async function revokeSession(token: string) {
  await prisma.session.deleteMany({ where: { token } })
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  })
}

export async function setCsrfCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  })
}

export async function ensureCsrfCookie(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(CSRF_COOKIE_NAME)?.value
  if (existing) return existing
  const token = generateCsrfToken()
  await setCsrfCookie(token)
  return token
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null
}

export async function deleteSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function deleteCsrfCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(CSRF_COOKIE_NAME)
}

export async function getCurrentUser() {
  const token = await getSessionToken()
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } })
    }
    return null
  }

  const now = Date.now()
  const expiresAtMs = session.expiresAt.getTime()
  if (expiresAtMs - now < SESSION_REFRESH_MS) {
    const nextExpiry = new Date(now + SESSION_DURATION_MS)
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: nextExpiry },
    })
    await setSessionCookie(session.token)
  }

  return session.user
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

export async function requireAdmin() {
  const user = await requireAuth()
  if (user.role !== 'admin') {
    logSecurityEvent({ event: 'permission_denied', reason: 'admin_required', userId: user.id })
    throw new Error('Forbidden: Admin access required')
  }
  return user
}

export async function authorizeRequest(options?: { role?: 'admin' | 'operator' }) {
  const user = options?.role === 'admin' ? await requireAdmin() : await requireAuth()
  const expo = await getOrCreateExpo()
  return { user, expo }
}

export async function logout() {
  const token = await getSessionToken()
  if (token) {
    await prisma.session.deleteMany({ where: { token } })
  }
  await deleteSessionCookie()
  await deleteCsrfCookie()
}

export async function getOrCreateExpo() {
  let expo = await prisma.expo.findFirst({
    include: { settings: true },
  })

  if (!expo) {
    expo = await prisma.expo.create({
      data: {
        name: 'معرض الجامعات',
        location: '',
        date: new Date(),
        settings: {
          create: {
            logosJson: '[]',
            exportIncludeNeedsReview: false,
          },
        },
      },
      include: { settings: true },
    })
  }

  return expo
}
