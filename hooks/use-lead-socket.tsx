import { useEffect } from 'react'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import type { LeadEvent } from '@/lib/socket'

export function useLeadSocket(enabled: boolean, onEvent: (event: LeadEvent) => void) {
  useEffect(() => {
    if (!enabled) return
    const socket = connectSocket()
    socket.on('lead_event', onEvent)

    return () => {
      socket.off('lead_event', onEvent)
      disconnectSocket()
    }
  }, [enabled, onEvent])
}
