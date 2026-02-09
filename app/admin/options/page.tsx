'use client'

import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/app-layout'
import { RequireAdmin } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/context'
import { SelectOption } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GripVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { withCsrf } from '@/lib/csrf'

type Category = 'qualification' | 'degree_level' | 'major' | 'major_language' | 'country_code'

export default function AdminOptionsPage() {
  const { t, dir } = useI18n()
  const [options, setOptions] = useState<SelectOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Category>('qualification')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<SelectOption | null>(null)
  const [formValue, setFormValue] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchOptions = async () => {
    try {
      const res = await fetch('/api/options')
      if (res.ok) {
        const data = await res.json()
        setOptions(data.options)
      }
    } catch (error) {
      console.error('Error fetching options:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOptions()
  }, [])

  const categoryLabels: Record<Category, string> = {
    qualification: t.options.qualification,
    degree_level: t.options.degreeLevel,
    major: t.options.major,
    major_language: t.options.majorLanguage,
    country_code: t.options.countryCode,
  }

  const filteredOptions = options
    .filter(o => o.category === activeTab)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const openAddDialog = () => {
    setEditingOption(null)
    setFormValue('')
    setFormActive(true)
    setIsDialogOpen(true)
  }

  const openEditDialog = (option: SelectOption) => {
    setEditingOption(option)
    setFormValue(option.valueAr)
    setFormActive(option.isActive)
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formValue.trim()) return
    
    setIsSubmitting(true)
    
    try {
      if (editingOption) {
        // Update
        const res = await fetch(`/api/options/${editingOption.id}`, {
          method: 'PATCH',
          headers: withCsrf({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ valueAr: formValue, isActive: formActive }),
        })
        
        if (res.ok) {
          const data = await res.json()
          setOptions(prev => prev.map(o => o.id === editingOption.id ? data.option : o))
          toast.success(t.common.success)
        } else {
          toast.error(t.common.error)
        }
      } else {
        // Create
        const res = await fetch('/api/options', {
          method: 'POST',
          headers: withCsrf({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            category: activeTab,
            valueAr: formValue,
            isActive: formActive,
            sortOrder: filteredOptions.length,
          }),
        })
        
        if (res.ok) {
          const data = await res.json()
          setOptions(prev => [...prev, data.option])
          toast.success(t.common.success)
        } else {
          toast.error(t.common.error)
        }
      }
      
      setIsDialogOpen(false)
    } catch {
      toast.error(t.common.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (option: SelectOption) => {
    if (!confirm(t.options.deleteConfirm)) return
    
    try {
      const res = await fetch(`/api/options/${option.id}`, {
        method: 'DELETE',
        headers: withCsrf(),
      })
      
      if (res.ok) {
        setOptions(prev => prev.filter(o => o.id !== option.id))
        toast.success(t.common.success)
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    }
  }

  const handleToggleActive = async (option: SelectOption) => {
    try {
      const res = await fetch(`/api/options/${option.id}`, {
        method: 'PATCH',
        headers: withCsrf({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ isActive: !option.isActive }),
      })
      
      if (res.ok) {
        const data = await res.json()
        setOptions(prev => prev.map(o => o.id === option.id ? data.option : o))
      } else {
        toast.error(t.common.error)
      }
    } catch {
      toast.error(t.common.error)
    }
  }

  return (
    <RequireAdmin>
      <AppLayout>
        <div className="space-y-6" dir={dir}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.options.title}</h1>
              <p className="text-muted-foreground">{options.length} {t.dashboard.leads}</p>
            </div>
            <Button onClick={openAddDialog} className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              {t.options.addOption}
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Category)}>
            <TabsList className="grid grid-cols-5 w-full max-w-3xl rounded-xl h-auto p-1">
              {(Object.keys(categoryLabels) as Category[]).map((cat) => (
                <TabsTrigger
                  key={cat}
                  value={cat}
                  className="rounded-lg py-2 text-sm"
                >
                  {categoryLabels[cat]}
                </TabsTrigger>
              ))}
            </TabsList>

            {(Object.keys(categoryLabels) as Category[]).map((cat) => (
              <TabsContent key={cat} value={cat} className="mt-4">
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{categoryLabels[cat]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : filteredOptions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {t.dashboard.noLeads}
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {filteredOptions.map((option) => (
                            <div
                              key={option.id}
                              className={cn(
                                'flex items-center gap-3 p-3 rounded-xl border border-border transition-colors',
                                !option.isActive && 'opacity-50'
                              )}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                              <span className="flex-1 font-medium">{option.valueAr}</span>
                              <Switch
                                checked={option.isActive}
                                onCheckedChange={() => handleToggleActive(option)}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(option)}
                                className="h-8 w-8"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(option)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingOption ? t.options.editOption : t.options.addOption}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t.options.value}</Label>
                <Input
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  className="rounded-xl"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{formActive ? t.options.active : t.options.inactive}</Label>
                <Switch
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="rounded-xl"
              >
                {t.common.cancel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !formValue.trim()}
                className="rounded-xl"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t.common.save
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    </RequireAdmin>
  )
}
