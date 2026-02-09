import { NextRequest, NextResponse } from 'next/server'
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
  } catch (error) {
    console.error('Failed to generate QR image in background')
  }
}

async function attachEvidenceInBackground(
  expoId: string,
  leadId: string,
  evidenceFile: { tempPath: string; mimeType: string },
  source: 'frame' | 'upload'
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
  } catch (error) {
    console.error('Failed to attach evidence in background')
    await cleanupTemp(evidenceFile.tempPath)
  }
}

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  const rate = rateLimit(`scan:${getClientIp(request)}`, { windowMs: 60_000, max: 60 })
  if (!rate.allowed) {
    logSecurityEvent({ event: 'rate_limit', key: 'scan', ip: getClientIp(request) })
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': rate.retryAfter.toString() } }
    )
  }

  try {
    const { user, expo } = await authorizeRequest()

    const contentType = request.headers.get('content-type') || ''
    let qrRaw = ''
    let evidenceFile: { tempPath: string; mimeType: string } | undefined

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { qrRaw?: string }
      qrRaw = body?.qrRaw || ''
    } else {
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
          return NextResponse.json({ error: 'File too large' }, { status: 413 })
        }
        if (message === 'UNSUPPORTED_TYPE') {
          return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 })
        }
        return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
      }

      qrRaw = parsedBody.fields.qrRaw || ''
      const evidence = parsedBody.files.evidence
      if (evidence) {
        const validation = await validateImageUpload(evidence, env.UPLOAD_MAX_BYTES)
        if (!validation.ok) {
          await cleanupTemp(evidence.tempPath)
          return NextResponse.json(
            { error: validation.error === 'FILE_TOO_LARGE' ? 'File too large' : 'Unsupported file type' },
            { status: validation.error === 'FILE_TOO_LARGE' ? 413 : 415 }
          )
        }
        evidenceFile = { tempPath: evidence.tempPath, mimeType: validation.mimeType || evidence.mimeType }
      }
    }
    const parsed = scanSchema.safeParse({ qrRaw })
    if (!parsed.success) {
      return NextResponse.json({ error: 'محتوى QR غير صالح' }, { status: 400 })
    }

    const qrHash = computeQrHash(qrRaw)

    let lead = await prisma.lead.findUnique({
      where: { expo_qr_unique: { expoId: expo.id, qrHash } },
    })

    if (lead) {
      const nextLead = { ...lead, scanCount: lead.scanCount + 1 }
      emitLeadEvent(expo.id, {
        leadId: lead.id,
        lead: nextLead,
        isDuplicate: true,
        focusLead: true,
      })

      void prisma.lead.update({
        where: { id: lead.id },
        data: { scanCount: { increment: 1 } },
      })

      if (evidenceFile && !lead.evidenceImagePath) {
        void attachEvidenceInBackground(expo.id, lead.id, evidenceFile, 'frame')
      } else if (evidenceFile) {
        await cleanupTemp(evidenceFile.tempPath)
      }

      if (!lead.generatedQrImagePath) {
        void generateQrInBackground(expo.id, lead.id, qrRaw)
      }

      void createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'scan_duplicate',
        entityType: 'lead',
        entityId: lead.id,
      })
      logSecurityEvent({ event: 'scan', type: 'duplicate', userId: user.id, expoId: expo.id })

      return NextResponse.json({
        success: true,
        isDuplicate: true,
        lead: nextLead,
      })
    }

    lead = await prisma.lead.create({
      data: {
        expoId: expo.id,
        createdByUserId: user.id,
        qrRaw,
        qrHash,
        qrDecodeStatus: 'decoded',
        evidenceImageSource: 'frame',
        status: 'draft',
        scannedAt: new Date(),
      },
    })

    emitLeadEvent(expo.id, {
      leadId: lead.id,
      lead,
      isDuplicate: false,
      focusLead: true,
    })

    if (evidenceFile) {
      void attachEvidenceInBackground(expo.id, lead.id, evidenceFile, 'frame')
    }

    void generateQrInBackground(expo.id, lead.id, qrRaw)

    void createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'scan_created',
      entityType: 'lead',
      entityId: lead.id,
    })
    logSecurityEvent({ event: 'scan', type: 'created', userId: user.id, expoId: expo.id })

    return NextResponse.json({
      success: true,
      isDuplicate: false,
      lead,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    return NextResponse.json({ error: 'حدث خطأ في المسح' }, { status: 500 })
  }
}
