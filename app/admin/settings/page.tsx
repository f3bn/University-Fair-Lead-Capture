'use client'

import { useState, useEffect, useRef } from 'react'
import { AppLayout } from '@/components/app-layout'
import { RequireAdmin, useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/context'
import { ExpoSettings } from '@/lib/types'
import { validateLogoFile, MAX_LOGO_BYTES } from '@/lib/validations'
import { withCsrf } from '@/lib/csrf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Save,
  Upload,
  X,
  FileDown,
  Loader2,
  Calendar,
  MapPin,
  Building,
} from 'lucide-react'
import { toast } from 'sonner'
import { buildImageUrl } from '@/lib/utils'

export default function AdminSettingsPage() {
  const { t, dir } = useI18n()
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState<ExpoSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    date: '',
    exportIncludeDrafts: true,
    exportIncludeNeedsReview: false,
    exportIncludeCancelled: false,
    exportScope: 'all' as 'all' | 'today',
  })
  const [logos, setLogos] = useState<string[]>([])
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
          setFormData({
            name: data.expo.name || '',
            location: data.expo.location || '',
            date: data.expo.date ? new Date(data.expo.date).toISOString().split('T')[0] : '',
            exportIncludeDrafts: data.settings.exportIncludeDrafts ?? true,
            exportIncludeNeedsReview: data.settings.exportIncludeNeedsReview ?? false,
            exportIncludeCancelled: data.settings.exportIncludeCancelled ?? false,
            exportScope: data.settings.exportScope ?? 'all',
          })
          setLogos(data.settings.logos || [])
        }
      } catch (error) {
        console.error('Error fetching settings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(formData),
      })
      
      if (res.ok) {
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async (format: 'excel' | 'pdf') => {
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

  const handleLogoUpload = async (file: File) => {
    if (logos.length >= 3) return
    const validation = validateLogoFile(file, MAX_LOGO_BYTES)
    if (!validation.valid) {
      toast.error(validation.error || t.common.error)
      return
    }

    setIsUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await fetch('/api/settings/logos', {
        method: 'POST',
        headers: withCsrf(),
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setLogos(data.logos || [])
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleLogoDelete = async (path: string) => {
    if (!confirm(t.settings.removeLogoConfirm)) return
    try {
      const res = await fetch('/api/settings/logos', {
        method: 'DELETE',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path }),
      })
      if (res.ok) {
        const data = await res.json()
        setLogos(data.logos || [])
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    }
  }

  if (isLoading) {
    return (
      <RequireAdmin>
        <AppLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </AppLayout>
      </RequireAdmin>
    )
  }

  return (
    <RequireAdmin>
      <AppLayout>
        <div className="space-y-6 max-w-2xl" dir={dir}>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
            <p className="text-muted-foreground">{settings?.expo.name}</p>
          </div>

          {/* Expo Details */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                {t.settings.expoName}
              </CardTitle>
              <CardDescription>
                {t.settings.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t.settings.expoName}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {t.settings.expoLocation}
                </Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t.settings.expoDate}
                </Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="rounded-xl"
                  dir="ltr"
                />
              </div>
              
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full gap-2 rounded-xl"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t.common.save}
              </Button>
            </CardContent>
          </Card>

          {/* Logos */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t.settings.logos}</CardTitle>
              <CardDescription>
                {t.settings.uploadLogo} (1-3)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {logos.map((logo, index) => (
                  <div key={index} className="relative aspect-square bg-muted rounded-xl overflow-hidden">
                    <img
                      src={buildImageUrl(logo)}
                      alt={`Logo ${index + 1}`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.opacity = '0'
                      }}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 end-1 h-6 w-6 rounded-md"
                      onClick={() => handleLogoDelete(logo)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {logos.length < 3 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square bg-muted hover:bg-muted/80 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 transition-colors"
                    disabled={isUploadingLogo}
                  >
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {isUploadingLogo ? t.common.uploading : t.settings.uploadLogo}
                    </span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && logos.length < 3) {
                    handleLogoUpload(file)
                  }
                  e.target.value = ''
                }}
              />
            </CardContent>
          </Card>

          {/* Export Settings */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t.settings.exportFiltersTitle}</CardTitle>
              <CardDescription>{t.settings.exportPreview}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t.settings.exportScopeLabel}</Label>
                <Select
                  value={formData.exportScope}
                  onValueChange={(value) => setFormData((prev) => ({
                    ...prev,
                    exportScope: value as 'all' | 'today',
                  }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.settings.exportScopeAll}</SelectItem>
                    <SelectItem value="today">{t.settings.exportScopeToday}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <span className="text-sm">{t.settings.exportIncludeDrafts}</span>
                  <Switch
                    checked={formData.exportIncludeDrafts}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, exportIncludeDrafts: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <span className="text-sm">{t.settings.exportIncludeNeedsReview}</span>
                  <Switch
                    checked={formData.exportIncludeNeedsReview}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, exportIncludeNeedsReview: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <span className="text-sm">{t.settings.exportIncludeCancelled}</span>
                  <Switch
                    checked={formData.exportIncludeCancelled}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, exportIncludeCancelled: checked }))
                    }
                  />
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full gap-2 rounded-xl"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t.settings.saveExportSettings}
              </Button>
            </CardContent>
          </Card>

          {/* Export */}
          {isAdmin && (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">{t.export.title}</CardTitle>
                <CardDescription>
                  {t.settings.exportPreview}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl h-12 bg-transparent"
                    onClick={() => handleExport('excel')}
                  >
                    <FileDown className="h-4 w-4" />
                    {t.export.excel}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl h-12 bg-transparent"
                    onClick={() => handleExport('pdf')}
                  >
                    <FileDown className="h-4 w-4" />
                    {t.export.pdf}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </AppLayout>
    </RequireAdmin>
  )
}
