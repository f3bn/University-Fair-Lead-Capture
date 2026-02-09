import type { NextApiRequest, NextApiResponse } from 'next'
import { Server as IOServer } from 'socket.io'
import { prisma } from '@/lib/prisma'
import { setSocketServer } from '@/lib/socket-server'
import { getOrCreateExpo } from '@/lib/auth'
import { allowedOrigins, env } from '@/lib/env'
import { rateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/security-log'
import { z } from 'zod'
import { getSessionTokenFromCookie, isSocketOriginAllowed } from '@/lib/socket-auth'

export const config = {
  api: {
    bodyParser: false,
  },
}

type SocketServerWithIO = {
  server: { io?: IOServer }
}

const allowedEventSchemas: Record<string, z.ZodTypeAny> = {}

function getSocketIp(req: NextApiRequest): string {
  if (env.TRUST_PROXY && req.headers['x-forwarded-for']) {
    const forwarded = String(req.headers['x-forwarded-for'])
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return 'unknown'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!res.socket) {
    res.status(500).end()
    return
  }
  const socket = res.socket as unknown as SocketServerWithIO
  if (!socket.server.io) {
    const io = new IOServer(socket.server as any, {
      path: '/api/socketio',
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },
      allowRequest: (request, callback) => {
        const origin = request.headers.origin
        if (!isSocketOriginAllowed(origin)) {
          return callback('Origin not allowed', false)
        }
        return callback(null, true)
      },
    })

    io.use(async (socket, next) => {
      try {
        const token = getSessionTokenFromCookie(socket.request.headers.cookie || null)
        if (!token) {
          logSecurityEvent({ event: 'socket_rejected', reason: 'missing_session' })
          return next(new Error('Unauthorized'))
        }

        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        })

        if (!session || session.expiresAt < new Date()) {
          logSecurityEvent({ event: 'socket_rejected', reason: 'invalid_session' })
          return next(new Error('Unauthorized'))
        }

        const ip = getSocketIp(req)
        const rate = rateLimit(`socket:${session.userId}:${ip}`, { windowMs: 60_000, max: 30 })
        if (!rate.allowed) {
          logSecurityEvent({ event: 'socket_rejected', reason: 'rate_limited', ip })
          return next(new Error('Rate limited'))
        }

        const expo = await getOrCreateExpo()
        socket.data.userId = session.userId
        socket.data.role = session.user.role
        socket.data.expoId = expo.id
        socket.join(`expo:${expo.id}`)
        return next()
      } catch {
        logSecurityEvent({ event: 'socket_rejected', reason: 'auth_error' })
        return next(new Error('Unauthorized'))
      }
    })

    io.on('connection', (socket) => {
      socket.emit('connected', { ok: true })

      socket.onAny((event, payload) => {
        const schema = allowedEventSchemas[event]
        if (!schema) {
          logSecurityEvent({ event: 'socket_rejected', reason: `event_not_allowed:${event}` })
          socket.disconnect(true)
          return
        }
        const parsed = schema.safeParse(payload)
        if (!parsed.success) {
          logSecurityEvent({ event: 'socket_rejected', reason: `invalid_payload:${event}` })
          socket.disconnect(true)
        }
      })
    })

    socket.server.io = io
    setSocketServer(io)
  }

  res.end()
}
