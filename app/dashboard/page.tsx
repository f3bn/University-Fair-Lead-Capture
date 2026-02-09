'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { AppLayout } from '@/components/app-layout'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/lib/auth-context'
import { Lead } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  FileDown,
  Filter,
  RefreshCw,
  Radio,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Users,
} from 'lucide-react'
import { buildImageUrl, cn } from '@/lib/utils'
import { LeadDetailDrawer } from '@/components/lead-detail-drawer'
import { toast } from 'sonner'
import { useLeadSocket } from '@/hooks/use-lead-socket'
import type { LeadEvent } from '@/lib/socket'

type FilterType = 'all' | 'today' | 'draft' | 'done' | 'cancelled' | 'needsReview'

export default function DashboardPage() {
  const { t, dir } = useI18n()
  const { user, isAdmin } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [pendingLead, setPendingLead] = useState<Lead | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [liveScans, setLiveScans] = useState<Lead[]>([])
  const selectedLeadRef = useRef<Lead | null>(null)
  const dirtyRef = useRef(false)
  const lastSeenLeadIdRef = useRef<string | null>(null)
  const lastSeenUpdatedAtRef = useRef<number>(0)
  const initialSyncDoneRef = useRef(false)
  const suppressUntilRef = useRef<Record<string, number>>({})

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('filter', filter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/leads?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLeads(data.leads)
        if (Array.isArray(data.leads) && data.leads.length) {
          const latest = data.leads.reduce((best: Lead, current: Lead) => {
            return new Date(current.updatedAt).getTime() > new Date(best.updatedAt).getTime()
              ? current
              : best
          }, data.leads[0])
          lastSeenLeadIdRef.current = latest.id
          lastSeenUpdatedAtRef.current = new Date(latest.updatedAt).getTime()
          if (!initialSyncDoneRef.current) {
            initialSyncDoneRef.current = true
          }
        }
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    selectedLeadRef.current = selectedLead
  }, [selectedLead])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Update live scans when leads change
  useEffect(() => {
    const recent = leads
      .filter((l) => {
        const scannedAt = new Date(l.scannedAt)
        const now = new Date()
        const diff = now.getTime() - scannedAt.getTime()
        return diff < 60000 // Last 60 seconds
      })
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      .slice(0, 5)
    setLiveScans(recent)
  }, [leads])

  const handleIncomingLead = useCallback(
    (lead: Lead, options?: { isDuplicate?: boolean; needsReview?: boolean; focusLead?: boolean }) => {
      if (filter !== 'all' || search) {
        fetchLeads()
      } else {
        setLeads((prev) => {
          const index = prev.findIndex((item) => item.id === lead.id)
          if (index === -1) {
            return [...prev, lead]
          }
          const updated = [...prev]
          updated[index] = lead
          return updated
        })
      }

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
    [fetchLeads, filter, search, t.dashboard.alreadyCaptured, t.lead.needsReview]
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
      const list = (data.leads || []) as Lead[]
      if (!list.length) return
      const latest = list.reduce((best, current) => {
        return new Date(current.updatedAt).getTime() > new Date(best.updatedAt).getTime()
          ? current
          : best
      }, list[0])
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

  const stats = useMemo(() => {
    const todayKey = new Date().toDateString()
    const total = leads.length
    const today = leads.filter((lead) => new Date(lead.scannedAt).toDateString() === todayKey).length
    const done = leads.filter((lead) => lead.status === 'done').length
    const needsReview = leads.filter((lead) => lead.qrDecodeStatus === 'failed').length
    return { total, today, done, needsReview }
  }, [leads])

  const handleExport = async (format: 'excel' | 'pdf') => {
    if (!isAdmin) {
      toast.error(t.export.adminOnly)
      return
    }

    try {
      const res = await fetch(format === 'excel' ? '/api/export/excel' : '/api/export/pdf')
      if (res.ok) {
        if (format === 'excel') {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `leads_${Date.now()}.xlsx`
          a.click()
          URL.revokeObjectURL(url)
        } else {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const win = window.open(url, '_blank')
          if (!win) {
            const a = document.createElement('a')
            a.href = url
            a.download = `leads_${Date.now()}.pdf`
            a.click()
          }
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    }
  }

  const handleLeadUpdate = (updatedLead: Lead) => {
    suppressUntilRef.current[updatedLead.id] = Date.now() + 15000
    lastSeenLeadIdRef.current = updatedLead.id
    lastSeenUpdatedAtRef.current = new Date(updatedLead.updatedAt).getTime()
    setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)))
    setSelectedLead(updatedLead)
  }

  const filters: { key: FilterType; label: string; icon: ReactNode }[] = [
    { key: 'all', label: t.dashboard.filters.all, icon: <Filter className="h-4 w-4" /> },
    { key: 'today', label: t.dashboard.filters.today, icon: <Clock className="h-4 w-4" /> },
    { key: 'draft', label: t.dashboard.filters.draft, icon: <Clock className="h-4 w-4" /> },
    { key: 'done', label: t.dashboard.filters.done, icon: <CheckCircle2 className="h-4 w-4" /> },
    { key: 'cancelled', label: t.dashboard.filters.cancelled, icon: <XCircle className="h-4 w-4" /> },
    { key: 'needsReview', label: t.dashboard.filters.needsReview, icon: <AlertTriangle className="h-4 w-4" /> },
  ]

  const getStatusBadge = (lead: Lead) => {
    if (lead.qrDecodeStatus === 'failed') {
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{t.lead.needsReview}</Badge>
    }
    switch (lead.status) {
      case 'draft':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{t.lead.statusDraft}</Badge>
      case 'done':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{t.lead.statusDone}</Badge>
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{t.lead.statusCancelled}</Badge>
      default:
        return null
    }
  }

  const statCards = [
    {
      label: t.dashboard.leads,
      value: stats.total,
      icon: <Users className="h-4 w-4" />,
      tone: 'from-blue-50 via-white to-sky-50 border-blue-100',
      accent: 'text-blue-600',
    },
    {
      label: t.dashboard.filters.today,
      value: stats.today,
      icon: <Clock className="h-4 w-4" />,
      tone: 'from-amber-50 via-white to-orange-50 border-amber-100',
      accent: 'text-amber-600',
    },
    {
      label: t.dashboard.filters.done,
      value: stats.done,
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: 'from-emerald-50 via-white to-lime-50 border-emerald-100',
      accent: 'text-emerald-600',
    },
    {
      label: t.lead.needsReview,
      value: stats.needsReview,
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: 'from-rose-50 via-white to-orange-50 border-rose-100',
      accent: 'text-rose-600',
    },
  ]
  const orderedStats = dir === 'rtl' ? [...statCards].reverse() : statCards
  const orderedFilters = dir === 'rtl' ? [...filters].reverse() : filters

  return (
    <AppLayout>
      <div className="space-y-6" dir={dir}>
        <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-primary/10 via-white to-sky-50 p-6 shadow-sm">
          <div
            className={cn(
              'flex flex-col gap-4 lg:items-center lg:justify-between',
              dir === 'rtl' ? 'lg:flex-row-reverse' : 'lg:flex-row'
            )}
          >
            <div className={cn('space-y-1', dir === 'rtl' && 'text-right')}>
              <h1 className="text-3xl font-bold text-foreground">{t.dashboard.title}</h1>
              <p className="text-muted-foreground">{leads.length} {t.dashboard.leads}</p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2 rounded-full bg-white/60" onClick={() => handleExport('excel')}>
                  <FileDown className="h-4 w-4" />
                  {t.export.excel}
                </Button>
                <Button variant="outline" className="gap-2 rounded-full bg-white/60" onClick={() => handleExport('pdf')}>
                  <FileDown className="h-4 w-4" />
                  {t.export.pdf}
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {orderedStats.map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  'rounded-2xl border bg-gradient-to-br p-4 shadow-sm',
                  stat.tone
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('rounded-full bg-white/70 p-2', stat.accent)}>
                    {stat.icon}
                  </div>
                  <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <Card className="rounded-3xl border border-border/60 bg-white/80 shadow-sm backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary animate-pulse" />
                {t.dashboard.liveScans}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[320px]" dir={dir}>
                {liveScans.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">
                    {t.dashboard.noLeads}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {liveScans.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        dir={dir}
                        className={cn(
                          'w-full rounded-2xl border border-border bg-background/80 p-3 text-start shadow-sm transition hover:border-primary/40 hover:shadow-md',
                          dir === 'rtl' && 'text-right'
                        )}
                      >
                        <p className="text-sm font-semibold truncate">
                          {lead.qrRaw || t.lead.needsReview}
                        </p>
                        {lead.name && (
                          <p className="text-xs text-muted-foreground truncate mt-1">{lead.name}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(lead.scannedAt).toLocaleTimeString(dir === 'rtl' ? 'ar-SA' : 'en-US')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-4" dir={dir}>
            <Card className="rounded-3xl border border-border/60 bg-white/80 shadow-sm backdrop-blur">
              <CardContent className="p-4 space-y-4">
                <div className={cn('flex flex-wrap gap-2', dir === 'rtl' && 'justify-end')}>
                  {orderedFilters.map((f) => (
                    <Button
                      key={f.key}
                      variant={filter === f.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        'gap-2 rounded-full px-4',
                        filter === f.key && 'bg-primary text-primary-foreground'
                      )}
                    >
                      {f.icon}
                      {f.label}
                    </Button>
                  ))}
                </div>

                <div className={cn('flex gap-2', dir === 'rtl' && 'flex-row-reverse')}>
                  <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t.common.search}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="ps-10 rounded-xl"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={fetchLeads}
                    className="rounded-xl bg-transparent"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-border/60 bg-white/80 shadow-sm backdrop-blur">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : leads.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {t.dashboard.noLeads}
                  </div>
                ) : (
                  <ScrollArea className="h-[520px]" dir={dir}>
                  <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3" dir={dir}>
                    {leads.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        dir={dir}
                        className={cn(
                          'group w-full rounded-2xl border border-border bg-background/80 p-4 text-start shadow-sm transition hover:border-primary/40 hover:shadow-md',
                          dir === 'rtl' && 'text-right'
                        )}
                      >
                        <div className={cn('flex items-start gap-3', dir === 'rtl' && 'flex-row-reverse')}>
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40">
                              {lead.generatedQrImagePath ? (
                                <img
                                  src={buildImageUrl(lead.generatedQrImagePath)}
                                  alt={t.lead.generatedQr}
                                  className="h-full w-full object-contain p-2"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                  QR
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1 space-y-2">
                              <div className={cn('flex items-center justify-between gap-2', dir === 'rtl' && 'flex-row-reverse')}>
                                <p className="truncate font-semibold" dir={lead.qrRaw ? 'ltr' : undefined}>
                                  {lead.qrRaw || t.lead.needsReview}
                                </p>
                                {getStatusBadge(lead)}
                              </div>

                              {lead.name && (
                                <div className="text-sm text-muted-foreground truncate">{lead.name}</div>
                              )}

                              <div className={cn('flex flex-wrap gap-2 text-xs text-muted-foreground', dir === 'rtl' && 'justify-end')}>
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(lead.scannedAt).toLocaleString(dir === 'rtl' ? 'ar-SA' : 'en-US')}
                                </span>
                                {lead.degreeLevel && (
                                  <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                                    {lead.degreeLevel}
                                  </span>
                                )}
                                {lead.major && (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                                    {lead.major}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={cn('mt-3 flex items-center justify-between text-xs text-muted-foreground', dir === 'rtl' && 'flex-row-reverse')}>
                            {lead.phoneNumber ? (
                              <span className="font-mono" dir="ltr">
                                {[lead.phoneCountry, lead.phoneNumber].filter(Boolean).join(' ')}
                              </span>
                            ) : (
                              <span />
                            )}
                            {lead.scanCount > 1 && (
                              <span>{t.lead.scanCount}: {lead.scanCount}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
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
        onUpdate={handleLeadUpdate}
        onDirtyChange={setIsDirty}
      />
    </AppLayout>
  )
}
