'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { AppLayout } from '@/components/app-layout'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/lib/auth-context'
import { Lead } from '@/lib/types'
import { LeadDetailDrawer } from '@/components/lead-detail-drawer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useLeadSocket } from '@/hooks/use-lead-socket'
import type { LeadEvent } from '@/lib/socket'

export default function ReceiverPage() {
  const { t, dir } = useI18n()
  const { user } = useAuth()
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [pendingLead, setPendingLead] = useState<Lead | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [recentLeads, setRecentLeads] = useState<Lead[]>([])
  const selectedLeadRef = useRef<Lead | null>(null)
  const dirtyRef = useRef(false)
  const lastSeenLeadIdRef = useRef<string | null>(null)
  const lastSeenUpdatedAtRef = useRef<number>(0)
  const initialSyncDoneRef = useRef(false)
  const suppressUntilRef = useRef<Record<string, number>>({})

  useEffect(() => {
    selectedLeadRef.current = selectedLead
  }, [selectedLead])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  const handleIncomingLead = useCallback(
    (lead: Lead, options?: { isDuplicate?: boolean; needsReview?: boolean; focusLead?: boolean }) => {
      setRecentLeads((prev) => [lead, ...prev.filter((item) => item.id !== lead.id)].slice(0, 5))

      if (options?.isDuplicate) {
        toast.info(t.dashboard.alreadyCaptured)
      }
      if (options?.needsReview) {
        toast.warning(t.lead.needsReview)
      }

      if (options?.focusLead) {
        const current = selectedLeadRef.current
        if (dirtyRef.current && current && current.id !== lead.id) {
          setPendingLead(lead)
        } else {
          setSelectedLead(lead)
        }
      }
    },
    [t.dashboard.alreadyCaptured, t.lead.needsReview]
  )

  const handleLeadEvent = useCallback(
    (event: LeadEvent) => {
      const lead = event.lead as Lead
      lastSeenLeadIdRef.current = lead.id
      lastSeenUpdatedAtRef.current = new Date(lead.updatedAt).getTime()
      handleIncomingLead(lead, {
        isDuplicate: event.isDuplicate,
        needsReview: event.needsReview,
        focusLead: event.focusLead,
      })
    },
    [handleIncomingLead]
  )

  const fetchLatestLead = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/leads?filter=today')
      if (!res.ok) return
      const data = await res.json()
      const leads = (data.leads || []) as Lead[]
      if (!leads.length) return
      const latest = leads.reduce((best, current) => {
        return new Date(current.updatedAt).getTime() > new Date(best.updatedAt).getTime()
          ? current
          : best
      }, leads[0])
      const latestUpdated = new Date(latest.updatedAt).getTime()
      if (!initialSyncDoneRef.current) {
        lastSeenLeadIdRef.current = latest.id
        lastSeenUpdatedAtRef.current = latestUpdated
        initialSyncDoneRef.current = true
        return
      }
      const suppressUntil = suppressUntilRef.current[latest.id]
      if (suppressUntil && Date.now() < suppressUntil) {
        lastSeenLeadIdRef.current = latest.id
        lastSeenUpdatedAtRef.current = latestUpdated
        return
      }
      if (
        latest.id !== lastSeenLeadIdRef.current ||
        latestUpdated > lastSeenUpdatedAtRef.current
      ) {
        lastSeenLeadIdRef.current = latest.id
        lastSeenUpdatedAtRef.current = latestUpdated
        handleIncomingLead(latest, {
          needsReview: latest.qrDecodeStatus === 'failed',
          focusLead: true,
        })
      }
    } catch {
      // ignore polling errors
    }
  }, [user, handleIncomingLead])

  useLeadSocket(!!user, handleLeadEvent)

  useEffect(() => {
    if (!user) return
    let interval: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (interval) return
      fetchLatestLead()
      interval = setInterval(fetchLatestLead, 500)
    }
    const stop = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        stop()
      }
    }
    handleVisibility()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    window.addEventListener('blur', handleVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      window.removeEventListener('blur', handleVisibility)
    }
  }, [user, fetchLatestLead])

  return (
    <AppLayout>
      <div className="space-y-6" dir={dir}>
        <div className={cn(dir === 'rtl' && 'text-right')}>
          <h1 className="text-2xl font-bold text-foreground">{t.receiver.title}</h1>
          <p className="text-muted-foreground">{t.receiver.subtitle}</p>
        </div>

        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.dashboard.liveScans}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.noLeads}</p>
            ) : (
              <div className="space-y-2">
                {recentLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="w-full rounded-xl border border-border p-3 text-start hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{lead.qrRaw || t.lead.needsReview}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(lead.scannedAt).toLocaleTimeString(dir === 'rtl' ? 'ar-SA' : 'en-US')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {pendingLead && (
        <div className="fixed bottom-6 end-6 z-50 max-w-sm rounded-2xl border border-border bg-card p-4 shadow-lg">
          <p className="text-sm font-medium text-foreground">{t.common.newScanPending}</p>
          <p className="text-xs text-muted-foreground mt-1">{t.common.unsavedChanges}</p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="rounded-xl"
              onClick={() => {
                setSelectedLead(pendingLead)
                setPendingLead(null)
              }}
            >
              {t.common.openNewScan}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setPendingLead(null)}
            >
              {t.common.keepEditing}
            </Button>
          </div>
        </div>
      )}

      <LeadDetailDrawer
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => {
          setSelectedLead(null)
          setIsDirty(false)
        }}
        onUpdate={(updatedLead) => {
          suppressUntilRef.current[updatedLead.id] = Date.now() + 15000
          lastSeenLeadIdRef.current = updatedLead.id
          lastSeenUpdatedAtRef.current = new Date(updatedLead.updatedAt).getTime()
          setSelectedLead(updatedLead)
          if (updatedLead.status === 'done' || updatedLead.status === 'cancelled') {
            setRecentLeads((prev) => prev.filter((item) => item.id !== updatedLead.id))
            setSelectedLead(null)
            setIsDirty(false)
          }
        }}
        onDirtyChange={(dirty) => {
          dirtyRef.current = dirty
          setIsDirty(dirty)
        }}
      />
    </AppLayout>
  )
}
