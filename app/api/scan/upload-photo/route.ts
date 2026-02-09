import { NextRequest, NextResponse } from 'next/server'
import jsQR from 'jsqr'
import sharp from 'sharp'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { scanSchema, ALLOWED_IMAGE_TYPES } from '@/lib/validations'
import { computeQrHash, generateQrPngBuffer, getImageBasePath, saveGeneratedQrImage } from '@/lib/images'
import { createAuditLog } from '@/lib/audit'
import { parseMultipart } from '@/lib/multipart'
import { cleanupTemp, normalizeToWebp, resolveUploadsPath } from '@/lib/image-processing'
import { emitLeadEvent } from '@/lib/socket-server'
import { getClientIp, requireCsrf } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { validateImageUpload } from '@/lib/image-validation'
import { env } from '@/lib/env'
import { logSecurityEvent } from '@/lib/security-log'

export const runtime = 'nodejs'

async function generateQrInBackground(expoId: string, leadId: string, qrRaw: string) {
  try {
    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { generatedQrImagePath: true },
    })
    if (existing?.generatedQrImagePath) return
    const qrPng = await generateQrPngBuffer(qrRaw)
    const qrPath = await saveGeneratedQrImage(expoId, leadId, qrPng)
    await prisma.lead.update({
      where: { id: leadId },
      data: { generatedQrImagePath: qrPath },
    })
  } catch {
    console.error('Failed to generate QR image in background')
  }
}

async function attachEvidenceInBackground(
  expoId: string,
  leadId: string,
  evidenceFile: { tempPath: string; mimeType: string },
  source: 'upload'
) {
  try {
    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { evidenceImagePath: true },
    })
    if (existing?.evidenceImagePath) {
      await cleanupTemp(evidenceFile.tempPath)
      return
    }

    const basePath = getImageBasePath(expoId, leadId)
    const evidenceRelative = `${basePath}_evidence.webp`
    const evidenceFull = resolveUploadsPath(evidenceRelative)
    try {
      await normalizeToWebp(evidenceFile.tempPath, evidenceFull, { maxDimension: 3600, quality: 92 })
      await prisma.lead.update({
        where: { id: leadId },
        data: { evidenceImagePath: evidenceRelative, evidenceImageSource: source },
      })
    } catch {
      await cleanupTemp(evidenceFile.tempPath)
      return
    } finally {
      await cleanupTemp(evidenceFile.tempPath)
    }
  } catch {
    console.error('Failed to attach evidence in background')
    await cleanupTemp(evidenceFile.tempPath)
  }
}

async function decodeQrFromImage(filePath: string): Promise<{ success: boolean; qrRaw?: string; error?: string }> {
  try {
    const { data, info } = await sharp(filePath, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height)
    if (code?.data) {
      return { success: true, qrRaw: code.data }
    }
    return { success: false, error: 'qr_not_found' }
  } catch {
    return { success: false, error: 'image_decode_failed' }
  }
}

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  const rate = rateLimit(`scan-upload:${getClientIp(request)}`, { windowMs: 60_000, max: 20 })
  if (!rate.allowed) {
    logSecurityEvent({ event: 'rate_limit', key: 'scan-upload', ip: getClientIp(request) })
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': rate.retryAfter.toString() } }
    )
  }

  try {
    const { user, expo } = await authorizeRequest()

    let parsedBody
    try {
      parsedBody = await parseMultipart(request, {
        maxFileSize: env.UPLOAD_MAX_BYTES,
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        maxFiles: 1,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INVALID_UPLOAD'
      if (message === 'FILE_TOO_LARGE') {
        return NextResponse.json({ error: 'الملف كبير جدًا' }, { status: 413 })
      }
      if (message === 'UNSUPPORTED_TYPE') {
        return NextResponse.json({ error: 'نوع الملف غير مدعوم' }, { status: 415 })
      }
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }

    const imageFile = parsedBody.files.image
    if (!imageFile) {
      return NextResponse.json({ error: 'لم يتم إرفاق صورة' }, { status: 400 })
    }

    const validation = await validateImageUpload(imageFile, env.UPLOAD_MAX_BYTES)
    if (!validation.ok) {
      await cleanupTemp(imageFile.tempPath)
      return NextResponse.json(
        { error: validation.error === 'FILE_TOO_LARGE' ? 'الملف كبير جدًا' : 'نوع الملف غير مدعوم' },
        { status: validation.error === 'FILE_TOO_LARGE' ? 413 : 415 }
      )
    }

    const decodeResult = await decodeQrFromImage(imageFile.tempPath)

    if (decodeResult.success && decodeResult.qrRaw) {
      const parsed = scanSchema.safeParse({ qrRaw: decodeResult.qrRaw })
      if (!parsed.success) {
        await cleanupTemp(imageFile.tempPath)
        return NextResponse.json({ error: 'محتوى QR غير صالح' }, { status: 400 })
      }

      const qrHash = computeQrHash(decodeResult.qrRaw)
      let lead = await prisma.lead.findUnique({
        where: { expo_qr_unique: { expoId: expo.id, qrHash } },
      })

      if (lead) {
        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: { scanCount: { increment: 1 } },
        })

        if (!lead.evidenceImagePath) {
          void attachEvidenceInBackground(expo.id, lead.id, imageFile, 'upload')
        } else {
          await cleanupTemp(imageFile.tempPath)
        }

        if (!lead.generatedQrImagePath) {
          void generateQrInBackground(expo.id, lead.id, decodeResult.qrRaw)
        }

        await createAuditLog({
          expoId: expo.id,
          userId: user.id,
          action: 'scan_duplicate',
          entityType: 'lead',
          entityId: lead.id,
        })
        logSecurityEvent({ event: 'scan', type: 'duplicate', userId: user.id, expoId: expo.id })

        emitLeadEvent(expo.id, {
          leadId: lead.id,
          lead,
          isDuplicate: true,
          focusLead: true,
        })

        return NextResponse.json({ success: true, isDuplicate: true, lead })
      }

      lead = await prisma.lead.create({
        data: {
          expoId: expo.id,
          createdByUserId: user.id,
          qrRaw: decodeResult.qrRaw,
          qrHash,
          qrDecodeStatus: 'decoded',
          evidenceImageSource: 'upload',
          status: 'draft',
          scannedAt: new Date(),
        },
      })

      void attachEvidenceInBackground(expo.id, lead.id, imageFile, 'upload')
      void generateQrInBackground(expo.id, lead.id, decodeResult.qrRaw)

      await createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'scan_created',
        entityType: 'lead',
        entityId: lead.id,
      })
      logSecurityEvent({ event: 'scan', type: 'created', userId: user.id, expoId: expo.id })

      emitLeadEvent(expo.id, {
        leadId: lead.id,
        lead,
        isDuplicate: false,
        focusLead: true,
      })

      return NextResponse.json({ success: true, isDuplicate: false, lead })
    }

    const decodeError = decodeResult.error || 'qr_not_found'

    const lead = await prisma.lead.create({
      data: {
        expoId: expo.id,
        createdByUserId: user.id,
        qrRaw: null,
        qrHash: null,
        qrDecodeStatus: 'failed',
        qrDecodeError: decodeError,
        evidenceImageSource: 'upload',
        status: 'draft',
        scannedAt: new Date(),
      },
    })

    void attachEvidenceInBackground(expo.id, lead.id, imageFile, 'upload')

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'scan_needs_review',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { reason: decodeError },
    })
    logSecurityEvent({ event: 'scan', type: 'needs_review', userId: user.id, expoId: expo.id })

    emitLeadEvent(expo.id, {
      leadId: lead.id,
      lead,
      needsReview: true,
      focusLead: true,
    })

    return NextResponse.json({ success: true, needsReview: true, lead })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    return NextResponse.json({ error: 'حدث خطأ في المعالجة' }, { status: 500 })
  }
}
