'use client'

import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react'
import { AppLayout } from '@/components/app-layout'
import { useI18n } from '@/lib/i18n/context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Camera,
  Upload,
  ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ScanLine,
  SwitchCamera,
  Flashlight,
  FlashlightOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { BrowserQRCodeReader, Result } from '@zxing/library'
import { withCsrf } from '@/lib/csrf'

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error' | 'duplicate'

export default function ScanPage() {
  const { t, dir } = useI18n()
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [cameraActive, setCameraActive] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [scannedCount, setScannedCount] = useState(0)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const readerRef = useRef<BrowserQRCodeReader | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const queueRef = useRef<Array<{ qrRaw: string; evidencePromise?: Promise<Blob | undefined> }>>([])
  const inFlightRef = useRef(0)
  const cameraActiveRef = useRef(false)
  const lastScanTimeRef = useRef<number>(0)
  const lastScanValueRef = useRef<string>('')

  const MAX_IN_FLIGHT = 2

  const uploadEvidence = useCallback(async (leadId: string, evidenceBlob: Blob) => {
    const formData = new FormData()
    formData.append('leadId', leadId)
    formData.append('evidence', evidenceBlob, 'evidence.webp')
    try {
      await fetch('/api/scan/evidence', {
        method: 'POST',
        headers: withCsrf(),
        body: formData,
      })
    } catch (error) {
      console.warn('Evidence upload failed', error)
    }
  }, [])

  const sendScan = useCallback(
    async (qrRaw: string, evidencePromise?: Promise<Blob | undefined>) => {
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: withCsrf({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ qrRaw }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.isDuplicate) {
            toast.info(t.dashboard.alreadyCaptured)
          } else {
            setScannedCount((prev) => prev + 1)
          }
          if (data.lead?.id && evidencePromise) {
            void evidencePromise
              .then((blob) => {
                if (blob) {
                  void uploadEvidence(data.lead.id, blob)
                }
              })
              .catch(() => undefined)
          }
        } else {
          let errorMessage = t.scan.scanError
          try {
            const data = await res.json()
            if (data?.error) errorMessage = data.error
          } catch {
            // ignore
          }
          toast.error(errorMessage)
        }
      } catch {
        toast.error(t.scan.scanError)
      }
    },
    [t.dashboard.alreadyCaptured, t.scan.scanError, uploadEvidence]
  )

  const drainQueue = useCallback(function drainQueueFn() {
    while (inFlightRef.current < MAX_IN_FLIGHT) {
      const next = queueRef.current.shift()
      if (!next) return
      inFlightRef.current += 1
      void sendScan(next.qrRaw, next.evidencePromise).finally(() => {
        inFlightRef.current -= 1
        drainQueueFn()
      })
    }
  }, [sendScan])

  const processQrCode = useCallback(
    (qrRaw: string, evidencePromise?: Promise<Blob | undefined>) => {
      // Debounce: ignore if same code within 20 seconds
      const now = Date.now()
      if (qrRaw === lastScanValueRef.current && now - lastScanTimeRef.current < 20000) {
        return
      }

      lastScanTimeRef.current = now
      lastScanValueRef.current = qrRaw

      setLastScanned(qrRaw)
      setStatus('success')
      toast.success(t.scan.scanSuccess)

      setTimeout(() => {
        setStatus(cameraActiveRef.current ? 'scanning' : 'idle')
      }, 600)

      queueRef.current.push({ qrRaw, evidencePromise })
      drainQueue()
    },
    [drainQueue, t.scan.scanSuccess]
  )

  const captureEvidenceSnapshot = useCallback(async (): Promise<Blob | undefined> => {
    if (!videoRef.current) return undefined
    const video = videoRef.current
    const width = video.videoWidth || 0
    const height = video.videoHeight || 0
    if (!width || !height) return undefined

    const maxDim = 2400
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(video)
        ctx.drawImage(bitmap, 0, 0, targetW, targetH)
        bitmap.close?.()
      } catch {
        return undefined
      }
    } else {
      ctx.drawImage(video, 0, 0, targetW, targetH)
    }

    return await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/webp', 0.9)
    })
  }, [])

  const attachTrackFromVideo = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null
    if (!stream) return
    streamRef.current = stream
    const track = stream.getVideoTracks()[0] || null
    trackRef.current = track
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
    setTorchAvailable(Boolean(capabilities?.torch))
    setTorchOn(false)
  }, [])

  const startCamera = useCallback(async () => {
    try {
      if (!videoRef.current) return

      readerRef.current?.reset()
      readerRef.current = new BrowserQRCodeReader()

      videoRef.current.onloadedmetadata = () => {
        attachTrackFromVideo()
        videoRef.current?.play().catch(() => undefined)
      }

      readerRef.current.decodeFromConstraints(
        { video: { facingMode: { ideal: facingMode } } },
        videoRef.current,
        (result: Result | undefined) => {
          if (result) {
            const qrRaw = result.getText()
            const evidencePromise = captureEvidenceSnapshot()
            processQrCode(qrRaw, evidencePromise)
          }
        }
      ).catch((error) => {
        console.error('Camera decode error:', error)
        setHasPermission(false)
      })

      setCameraActive(true)
      setHasPermission(true)
      setStatus('scanning')
    } catch (error) {
      console.error('Camera error:', error)
      setHasPermission(false)
      toast.error(t.scan.cameraPermission)
    }
  }, [attachTrackFromVideo, captureEvidenceSnapshot, facingMode, processQrCode, t.scan.cameraPermission])

  const stopCamera = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    trackRef.current = null
    setTorchOn(false)
    setTorchAvailable(false)
    setCameraActive(false)
    setStatus('idle')
  }, [])

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }, [])

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current
    if (!track || !track.getCapabilities) return
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
    if (!capabilities.torch) {
      setTorchAvailable(false)
      return
    }

    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] } as MediaTrackConstraints)
      setTorchOn((prev) => !prev)
    } catch (error) {
      console.warn('Torch toggle failed', error)
    }
  }, [torchOn])

  useEffect(() => {
    cameraActiveRef.current = cameraActive
  }, [cameraActive])

  useEffect(() => {
    // Auto-start camera on mount or when switching camera
    startCamera()

    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setStatus('processing')
    
    try {
      const formData = new FormData()
      formData.append('image', file)
      
      const res = await fetch('/api/scan/upload-photo', {
        method: 'POST',
        headers: withCsrf(),
        body: formData,
      })
      
      if (res.ok) {
        const data = await res.json()
        if (data.isDuplicate) {
          setStatus('duplicate')
          setLastScanned(data.lead?.qrRaw)
          toast.info(t.dashboard.alreadyCaptured)
        } else if (data.needsReview) {
          setStatus('error')
          toast.warning(t.lead.needsReview)
        } else {
          setStatus('success')
          setLastScanned(data.lead?.qrRaw)
          setScannedCount(prev => prev + 1)
          toast.success(t.scan.scanSuccess)
        }
      } else {
        setStatus('error')
        toast.error(t.scan.scanError)
      }
    } catch {
      setStatus('error')
      toast.error(t.scan.scanError)
    }
    
    // Reset file input
    e.target.value = ''
    
    setTimeout(() => {
      setStatus(cameraActiveRef.current ? 'scanning' : 'idle')
    }, 2000)
  }

  const getStatusDisplay = () => {
    switch (status) {
      case 'scanning':
        return (
          <Badge className="bg-primary/90 text-primary-foreground gap-2 px-4 py-2 text-sm">
            <ScanLine className="h-4 w-4 animate-pulse" />
            {t.scan.scanning}
          </Badge>
        )
      case 'processing':
        return (
          <Badge className="bg-amber-500 text-white gap-2 px-4 py-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.scan.processing}
          </Badge>
        )
      case 'success':
        return (
          <Badge className="bg-green-500 text-white gap-2 px-4 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            {t.scan.scanSuccess}
          </Badge>
        )
      case 'duplicate':
        return (
          <Badge className="bg-amber-500 text-white gap-2 px-4 py-2 text-sm">
            <AlertTriangle className="h-4 w-4" />
            {t.scan.duplicate}
          </Badge>
        )
      case 'error':
        return (
          <Badge className="bg-destructive text-destructive-foreground gap-2 px-4 py-2 text-sm">
            <XCircle className="h-4 w-4" />
            {t.scan.scanError}
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]" dir={dir}>
        <div className="w-full max-w-md space-y-4">
          {/* Camera View */}
          <Card className="rounded-2xl border-0 shadow-lg overflow-hidden">
            <CardContent className="p-0 relative aspect-square bg-muted">
              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} className="hidden" />
              
              {/* Video element */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={cn(
                  'w-full h-full object-cover',
                  !cameraActive && 'hidden'
                )}
              />

              
              {/* Camera off state */}
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  {hasPermission === false ? (
                    <>
                      <XCircle className="h-16 w-16 text-destructive" />
                      <p className="text-muted-foreground text-center px-4">
                        {t.scan.cameraPermission}
                      </p>
                    </>
                  ) : (
                    <>
                      <Camera className="h-16 w-16 text-muted-foreground" />
                      <Button onClick={startCamera} className="gap-2 rounded-xl">
                        <Camera className="h-4 w-4" />
                        {t.scan.title}
                      </Button>
                    </>
                  )}
                </div>
              )}
              
              {/* Scan overlay */}
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner guides */}
                  <div className="absolute inset-8 border-2 border-white/30 rounded-2xl">
                    <div className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                    <div className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  </div>
                  
                  {/* Scan line animation */}
                  <div className="absolute left-8 right-8 h-0.5 bg-primary/80 animate-[scan_2s_ease-in-out_infinite]" style={{
                    top: '50%',
                    animation: 'scan 2s ease-in-out infinite',
                  }} />
                </div>
              )}
              
              {/* Status Badge */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                {getStatusDisplay()}
              </div>
            </CardContent>
          </Card>

          {cameraActive && (
            <div className={cn('flex items-center justify-between gap-2', dir === 'rtl' && 'flex-row-reverse')}>
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 rounded-xl h-11 bg-transparent"
                onClick={toggleTorch}
                disabled={!torchAvailable}
              >
                {torchOn ? (
                  <FlashlightOff className="h-4 w-4" />
                ) : (
                  <Flashlight className="h-4 w-4" />
                )}
                {torchOn ? t.scan.flashOff : t.scan.flashOn}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 rounded-xl h-11 bg-transparent"
                onClick={switchCamera}
              >
                <SwitchCamera className="h-4 w-4" />
                {t.scan.flipCamera}
              </Button>
            </div>
          )}

          {/* Last Scanned */}
          {lastScanned && (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">{t.lead.qrRaw}</p>
                <p className="font-mono text-sm truncate" dir="ltr">{lastScanned}</p>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {scannedCount > 0 && `${scannedCount} ${t.dashboard.leads}`}
            </p>
          </div>

          {/* Upload Options */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 rounded-xl h-12 bg-transparent"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = ''
                  fileInputRef.current.removeAttribute('capture')
                  fileInputRef.current.click()
                }
              }}
            >
              <Upload className="h-4 w-4" />
              {t.scan.uploadPhoto}
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2 rounded-xl h-12 bg-transparent"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = ''
                  fileInputRef.current.capture = 'environment'
                  fileInputRef.current.click()
                }
              }}
            >
              <ImageIcon className="h-4 w-4" />
              {t.scan.takePhoto}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Camera Toggle */}
          {cameraActive && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={stopCamera}
            >
              {t.common.close}
            </Button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes scan {
          0%, 100% { top: 20%; opacity: 0.5; }
          50% { top: 80%; opacity: 1; }
        }
      `}</style>
    </AppLayout>
  )
}
