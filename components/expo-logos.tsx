'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { buildImageUrl, cn } from '@/lib/utils'

interface ExpoLogosProps {
  className?: string
  imgClassName?: string
  fallbackText?: string
  publicOnly?: boolean
  maxCount?: number
}

export function ExpoLogos({ className, imgClassName, fallbackText, publicOnly, maxCount }: ExpoLogosProps) {
  const { t } = useI18n()
  const [logos, setLogos] = useState<string[]>([])
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fetchLogos = async () => {
      try {
        const res = await fetch(publicOnly ? '/api/settings/public' : '/api/settings')
        if (res.ok) {
          const data = await res.json()
          setLogos(data.settings?.logos || [])
        }
      } catch {
        setLogos([])
      }
    }
    fetchLogos()
  }, [publicOnly])

  const visibleLogos = useMemo(() => {
    const filtered = logos.filter((logo) => !broken[logo])
    if (!maxCount || maxCount <= 0) return filtered
    return filtered.slice(0, maxCount)
  }, [logos, broken, maxCount])

  if (visibleLogos.length === 0) {
    const fallback = fallbackText !== undefined ? fallbackText : t.common.appName
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        {fallback}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {visibleLogos.map((logo) => (
        <img
          key={logo}
          src={buildImageUrl(logo)}
          alt="Expo logo"
          className={cn('h-10 w-auto object-contain', imgClassName)}
          onError={() => setBroken((prev) => ({ ...prev, [logo]: true }))}
        />
      ))}
    </div>
  )
}
