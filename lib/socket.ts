'use client'

import { io, Socket } from 'socket.io-client'
import type { Lead } from '@/lib/types'

let socket: Socket | null = null

export interface LeadEvent {
  leadId: string
  lead: Lead
  isDuplicate?: boolean
  needsReview?: boolean
  focusLead?: boolean
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/api/socketio',
      withCredentials: true,
      transports: ['websocket'],
      upgrade: false,
      timeout: 5000,
      autoConnect: false,
    })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  s.connect()
  return s
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
  }
}
