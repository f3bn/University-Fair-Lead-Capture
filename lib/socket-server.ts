import type { Server as IOServer } from 'socket.io'

type GlobalWithIO = typeof globalThis & { __io?: IOServer }

function getGlobal(): GlobalWithIO {
  return globalThis as GlobalWithIO
}

export function setSocketServer(io: IOServer) {
  const g = getGlobal()
  g.__io = io
}

export function getSocketServer(): IOServer | null {
  const g = getGlobal()
  return g.__io ?? null
}

export function emitLeadEvent(expoId: string, payload: Record<string, unknown>) {
  const io = getSocketServer()
  if (!io) return
  io.to(`expo:${expoId}`).emit('lead_event', payload)
}
