'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Lead, SelectOption } from '@/lib/types'
import { useI18n } from '@/lib/i18n/context'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Copy,
  Check,
  Save,
  XCircle,
  RotateCcw,
  ZoomIn,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { SearchableCombobox } from './searchable-combobox'
import { withCsrf } from '@/lib/csrf'
import { buildImageUrl, cn } from '@/lib/utils'

interface LeadDetailDrawerProps {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onUpdate: (lead: Lead) => void
  onDirtyChange?: (dirty: boolean) => void
}

export function LeadDetailDrawer({ lead, open, onClose, onUpdate, onDirtyChange }: LeadDetailDrawerProps) {
  const { t, dir } = useI18n()
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [imageZoom, setImageZoom] = useState<string | null>(null)
  const [imageRotation, setImageRotation] = useState(0)
  const [options, setOptions] = useState<SelectOption[]>([])
  const [manualQr, setManualQr] = useState('')
  const labelClassName = dir === 'rtl' ? 'text-right' : ''
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phoneCountry: '',
    phoneNumber: '',
    qualification: '',
    degreeLevel: '',
    major: '',
    majorLanguage: '',
    notes: '',
  })

  useEffect(() => {
    if (lead) {
      setFormData({
        name: lead.name || '',
        phoneCountry: lead.phoneCountry || '',
        phoneNumber: lead.phoneNumber || '',
        qualification: lead.qualification || '',
        degreeLevel: lead.degreeLevel || '',
        major: lead.major || '',
        majorLanguage: lead.majorLanguage || '',
        notes: lead.notes || '',
      })
      setManualQr(lead.qrRaw || '')
      setImageRotation(0)
    }
  }, [lead])

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch('/api/options')
        if (res.ok) {
          const data = await res.json()
          setOptions(data.options)
        }
      } catch (error) {
        console.error('Error fetching options:', error)
      }
    }
    if (open) {
      fetchOptions()
    }
  }, [open])

  const isDirty = useMemo(() => {
    if (!lead) return false
    const fieldsChanged =
      formData.name !== (lead.name || '') ||
      formData.phoneCountry !== (lead.phoneCountry || '') ||
      formData.phoneNumber !== (lead.phoneNumber || '') ||
      formData.qualification !== (lead.qualification || '') ||
      formData.degreeLevel !== (lead.degreeLevel || '') ||
      formData.major !== (lead.major || '') ||
      formData.majorLanguage !== (lead.majorLanguage || '') ||
      formData.notes !== (lead.notes || '')

    const manualChanged = lead.qrDecodeStatus === 'failed' ? manualQr !== '' : false
    return fieldsChanged || manualChanged
  }, [lead, formData, manualQr])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    if (!imageZoom) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImageZoom(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [imageZoom])

  const handleCopy = async () => {
    if (lead?.qrRaw) {
      await navigator.clipboard.writeText(lead.qrRaw)
      setCopied(true)
      toast.success(t.common.copied)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSave = async (status: 'draft' | 'done') => {
    if (!lead) return
    setIsSubmitting(true)
    
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...formData, status }),
      })
      
      if (res.ok) {
        const data = await res.json()
        onUpdate(data.lead)
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!lead) return
    setIsSubmitting(true)
    
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'cancelled' }),
      })
      
      if (res.ok) {
        const data = await res.json()
        onUpdate(data.lead)
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRestore = async () => {
    if (!lead) return
    setIsSubmitting(true)
    
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'draft' }),
      })
      
      if (res.ok) {
        const data = await res.json()
        onUpdate(data.lead)
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResolveQr = async () => {
    if (!lead || !manualQr) return
    setIsResolving(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ qrRaw: manualQr }),
      })

      if (res.ok) {
        const data = await res.json()
        onUpdate(data.lead)
        toast.success(t.common.success)
        setManualQr('')
      } else if (res.status === 409) {
        toast.error(t.dashboard.alreadyCaptured)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsResolving(false)
    }
  }

  const getOptionsForCategory = (category: SelectOption['category']) => {
    return options
      .filter(o => o.category === category && o.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(o => o.valueAr)
  }

  if (!lead) return null

  const getStatusBadge = () => {
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

  return (
    <>
      <Sheet open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen && imageZoom) {
          setImageZoom(null)
          return
        }
        onClose()
      }}>
        <SheetContent
          side={dir === 'rtl' ? 'left' : 'right'}
          className={cn(
            'w-full sm:max-w-lg p-0 bg-gradient-to-b from-white to-slate-50',
            imageZoom && 'pointer-events-none'
          )}
          dir={dir}
        >
          <SheetHeader className="p-6 pb-4 border-b border-border bg-gradient-to-l from-primary/10 via-white to-transparent">
            <div className={cn('flex items-center justify-between', dir === 'rtl' && 'flex-row-reverse')}>
              <SheetTitle className={cn('text-lg', dir === 'rtl' && 'text-right')}>{t.lead.qrRaw}</SheetTitle>
              {getStatusBadge()}
            </div>
          </SheetHeader>
          
          <ScrollArea className="h-[calc(100vh-180px)]" dir={dir}>
            <div className="p-6 space-y-6">
              {lead.qrDecodeStatus === 'failed' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    {t.lead.needsReview}
                  </div>
                  <p className="text-sm text-amber-700">{t.lead.needsReviewHint}</p>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.manualQr}</Label>
                    <Input
                      value={manualQr}
                      onChange={(e) => setManualQr(e.target.value)}
                      className="rounded-xl font-mono text-sm"
                      dir="ltr"
                    />
                  </div>
                  <Button
                    onClick={handleResolveQr}
                    disabled={!manualQr || isResolving}
                    className="w-full gap-2 rounded-xl"
                  >
                    {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t.lead.saveGenerateQr}
                  </Button>
                </div>
              )}

              {/* QR Summary */}
              {(lead.qrRaw || lead.scanCount > 1) && (
                <div className="rounded-2xl border border-border bg-white/80 p-4 space-y-3 shadow-sm">
                  {lead.qrRaw && (
                    <div className="space-y-2">
                      <Label className={labelClassName}>{t.lead.qrRaw}</Label>
                      <div className={cn('flex gap-2', dir === 'rtl' && 'flex-row-reverse')}>
                        <Input
                          value={lead.qrRaw}
                          readOnly
                          className="font-mono text-sm rounded-xl bg-muted/40"
                          dir="ltr"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleCopy}
                          className="rounded-xl shrink-0 bg-white/80"
                        >
                          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}

                  {lead.scanCount > 1 && (
                    <div className="text-sm text-muted-foreground">
                      {t.lead.scanCount}: {lead.scanCount}
                    </div>
                  )}
                </div>
              )}

              {/* Images */}
              {(lead.evidenceImagePath || lead.generatedQrImagePath) && (
                <div className="rounded-2xl border border-border bg-white/80 p-4 space-y-4 shadow-sm">
                  <div className="grid gap-4 md:grid-cols-2" dir={dir}>
                    {lead.evidenceImagePath && (
                      <div className="space-y-2">
                        <Label className={labelClassName}>{t.lead.evidenceImage}</Label>
                        <div className="relative">
                          <img
                            src={buildImageUrl(lead.evidenceImagePath)}
                            alt={t.lead.evidenceImage}
                            className="w-full h-36 object-cover rounded-xl border border-border cursor-pointer hover:opacity-90 transition-opacity"
                            style={{ transform: `rotate(${imageRotation}deg)` }}
                            onClick={() => setImageZoom(lead.evidenceImagePath!)}
                          />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute top-2 end-2 h-8 w-8 rounded-lg bg-white/90"
                            onClick={() => setImageZoom(lead.evidenceImagePath!)}
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="absolute top-2 end-12 h-8 w-8 rounded-lg bg-white/90"
                            onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {lead.generatedQrImagePath && (
                      <div className="space-y-2">
                        <Label className={labelClassName}>{t.lead.generatedQr}</Label>
                        <div className="rounded-xl border border-border p-3 flex items-center justify-center bg-muted/30 h-36">
                          <img
                            src={buildImageUrl(lead.generatedQrImagePath)}
                            alt={t.lead.generatedQr}
                            className="h-28 w-28 object-contain"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Form Fields */}
              <div className="rounded-2xl border border-border bg-white/80 p-4 space-y-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2" dir={dir}>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.name}</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className={cn('rounded-xl bg-muted/30', dir === 'rtl' && 'text-right')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.phone}</Label>
                    <Input
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                      className="rounded-xl bg-muted/30"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3" dir={dir}>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.phoneCountry}</Label>
                    <SearchableCombobox
                      options={getOptionsForCategory('country_code')}
                      value={formData.phoneCountry}
                      onChange={(value) => setFormData(prev => ({ ...prev, phoneCountry: value }))}
                      placeholder="+966"
                      dir={dir}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.qualification}</Label>
                    <SearchableCombobox
                      options={getOptionsForCategory('qualification')}
                      value={formData.qualification}
                      onChange={(value) => setFormData(prev => ({ ...prev, qualification: value }))}
                      placeholder={t.lead.qualification}
                      dir={dir}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.degreeLevel}</Label>
                    <SearchableCombobox
                      options={getOptionsForCategory('degree_level')}
                      value={formData.degreeLevel}
                      onChange={(value) => setFormData(prev => ({ ...prev, degreeLevel: value }))}
                      placeholder={t.lead.degreeLevel}
                      dir={dir}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2" dir={dir}>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.major}</Label>
                    <SearchableCombobox
                      options={getOptionsForCategory('major')}
                      value={formData.major}
                      onChange={(value) => setFormData(prev => ({ ...prev, major: value }))}
                      placeholder={t.lead.major}
                      dir={dir}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.majorLanguage}</Label>
                    <SearchableCombobox
                      options={getOptionsForCategory('major_language')}
                      value={formData.majorLanguage}
                      onChange={(value) => setFormData(prev => ({ ...prev, majorLanguage: value }))}
                      placeholder={t.lead.majorLanguage}
                      dir={dir}
                    />
                  </div>
                </div>

                  <div className="space-y-2">
                    <Label className={labelClassName}>{t.lead.notes}</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className={cn('rounded-xl min-h-[110px] bg-muted/30', dir === 'rtl' && 'text-right')}
                    />
                  </div>
                </div>
            </div>
          </ScrollArea>

          {/* Actions */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-border">
            <div className={cn('flex gap-2', dir === 'rtl' && 'flex-row-reverse')}>
              {lead.status === 'cancelled' ? (
                <Button
                  onClick={handleRestore}
                  disabled={isSubmitting}
                  className="flex-1 gap-2 rounded-xl"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {t.common.restore}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleSave('draft')}
                    disabled={isSubmitting}
                    className="flex-1 gap-2 rounded-xl"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t.lead.saveDraft}
                  </Button>
                  <Button
                    onClick={() => handleSave('done')}
                    disabled={isSubmitting}
                    className="flex-1 gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {t.lead.saveDone}
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="rounded-xl shrink-0"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Image Zoom Modal */}
      {imageZoom && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] bg-black/80 pointer-events-auto"
              onPointerDown={(event) => {
                event.stopPropagation()
                setImageZoom(null)
              }}
              onClick={(event) => {
                event.stopPropagation()
                setImageZoom(null)
              }}
            >
              <div
                className="relative z-10 flex items-center justify-center h-full p-4"
                role="dialog"
                aria-modal="true"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-4 end-4 h-10 w-10 rounded-full bg-white/90"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setImageZoom(null)
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    setImageZoom(null)
                  }}
                >
                  <X className="h-5 w-5" />
                </Button>
                <img
                  src={buildImageUrl(imageZoom)}
                  alt={t.lead.evidenceImage}
                  className="max-w-full max-h-full object-contain rounded-xl"
                  style={{ transform: `rotate(${imageRotation}deg)` }}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
