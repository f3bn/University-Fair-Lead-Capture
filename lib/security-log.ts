import { createHash } from 'crypto'
import { env } from '@/lib/env'

type SecurityEvent =
  | { event: 'login_success'; userId: string; expoId?: string; ip?: string }
  | { event: 'login_failed'; ip?: string; reason?: string }
  | { event: 'rate_limit'; key: string; ip?: string }
  | { event: 'permission_denied'; reason: string; userId?: string; expoId?: string }
  | { event: 'export'; format: 'excel' | 'pdf'; userId: string; expoId: string; count: number }
  | { event: 'scan'; type: 'created' | 'duplicate' | 'needs_review'; userId: string; expoId: string }
  | { event: 'socket_rejected'; reason: string; ip?: string }

function hashIp(ip: string | undefined): string | undefined {
  if (!ip || ip === 'unknown') return undefined
  return createHash('sha256').update(`${env.APP_SECRET}:${ip}`).digest('hex')
}

export function logSecurityEvent(event: SecurityEvent) {
  const ip = 'ip' in event ? event.ip : undefined
  const payload = {
    ts: new Date().toISOString(),
    ...event,
    ip: hashIp(ip),
  }
  // Structured log without PII
  console.info(JSON.stringify(payload))
}
