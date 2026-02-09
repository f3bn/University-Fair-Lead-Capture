import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { ALLOWED_IMAGE_TYPES, evidenceUploadSchema } from '@/lib/validations'
import { parseMultipart } from '@/lib/multipart'
import { cleanupTemp, normalizeToWebp, resolveUploadsPath } from '@/lib/image-processing'
import { getImageBasePath } from '@/lib/images'
import { getClientIp, requireCsrf } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { validateImageUpload } from '@/lib/image-validation'
import { env } from '@/lib/env'
import { logSecurityEvent } from '@/lib/security-log'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  const rate = rateLimit(`scan-evidence:${getClientIp(request)}`, { windowMs: 60_000, max: 60 })
  if (!rate.allowed) {
    logSecurityEvent({ event: 'rate_limit', key: 'scan-evidence', ip: getClientIp(request) })
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': rate.retryAfter.toString() } }
    )
  }

  try {
    const { expo } = await authorizeRequest()

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

    const evidenceFile = parsedBody.files.evidence || parsedBody.files.image
    const parsed = evidenceUploadSchema.safeParse({ leadId: parsedBody.fields.leadId || '' })
    if (!parsed.success) {
      if (evidenceFile) {
        await cleanupTemp(evidenceFile.tempPath)
      }
      return NextResponse.json({ error: 'Invalid lead' }, { status: 400 })
    }

    if (!evidenceFile) {
      return NextResponse.json({ error: 'No image uploaded' }, { status: 400 })
    }

    const validation = await validateImageUpload(evidenceFile, env.UPLOAD_MAX_BYTES)
    if (!validation.ok) {
      await cleanupTemp(evidenceFile.tempPath)
      return NextResponse.json(
        { error: validation.error === 'FILE_TOO_LARGE' ? 'File too large' : 'Unsupported file type' },
        { status: validation.error === 'FILE_TOO_LARGE' ? 413 : 415 }
      )
    }

    const lead = await prisma.lead.findFirst({
      where: { id: parsed.data.leadId, expoId: expo.id },
      select: { id: true, evidenceImagePath: true },
    })
    if (!lead) {
      await cleanupTemp(evidenceFile.tempPath)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.evidenceImagePath) {
      await cleanupTemp(evidenceFile.tempPath)
      return NextResponse.json({ success: true })
    }

    const basePath = getImageBasePath(expo.id, lead.id)
    const evidenceRelative = `${basePath}_evidence.webp`
    const evidenceFull = resolveUploadsPath(evidenceRelative)

    try {
      await normalizeToWebp(evidenceFile.tempPath, evidenceFull, { maxDimension: 3600, quality: 92 })
      await prisma.lead.update({
        where: { id: lead.id },
        data: { evidenceImagePath: evidenceRelative, evidenceImageSource: 'frame' },
      })
    } catch {
      await cleanupTemp(evidenceFile.tempPath)
      return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
    } finally {
      await cleanupTemp(evidenceFile.tempPath)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    return NextResponse.json({ error: 'حدث خطأ في المعالجة' }, { status: 500 })
  }
}
