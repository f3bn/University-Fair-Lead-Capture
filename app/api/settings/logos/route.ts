import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { rm } from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { parseMultipart } from '@/lib/multipart'
import { ALLOWED_LOGO_TYPES, logoDeleteSchema } from '@/lib/validations'
import { cleanupTemp, moveAsIs, normalizeToWebp, resolveUploadsPath } from '@/lib/image-processing'
import { createAuditLog } from '@/lib/audit'
import { requireCsrf } from '@/lib/security'
import { validateImageUpload } from '@/lib/image-validation'
import { env } from '@/lib/env'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })

    const settings = await prisma.settings.findUnique({
      where: { expoId: expo.id },
    })

    const existingLogos: string[] = settings?.logosJson ? JSON.parse(settings.logosJson) : []
    if (existingLogos.length >= 3) {
      return NextResponse.json({ error: 'تم الوصول للحد الأقصى للشعارات' }, { status: 400 })
    }

    let parsedBody
    try {
      parsedBody = await parseMultipart(request, {
        maxFileSize: env.LOGO_MAX_BYTES,
        allowedMimeTypes: ALLOWED_LOGO_TYPES,
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

    const imageFile = parsedBody.files.logo
    if (!imageFile) {
      return NextResponse.json({ error: 'لم يتم إرفاق شعار' }, { status: 400 })
    }

    const validation = await validateImageUpload(imageFile, env.LOGO_MAX_BYTES, ALLOWED_LOGO_TYPES)
    if (!validation.ok) {
      await cleanupTemp(imageFile.tempPath)
      return NextResponse.json(
        { error: validation.error === 'FILE_TOO_LARGE' ? 'الملف كبير جدًا' : 'نوع الملف غير مدعوم' },
        { status: validation.error === 'FILE_TOO_LARGE' ? 413 : 415 }
      )
    }

    const isSvg = validation.mimeType === 'image/svg+xml'

    const logoDir = join('uploads', 'logos', expo.id)
    const logoName = `${Date.now()}_${randomBytes(6).toString('hex')}.${isSvg ? 'svg' : 'webp'}`
    const logoRelative = join(logoDir, logoName).replace(/\\/g, '/')
    const logoFull = resolveUploadsPath(logoRelative)

    try {
      if (isSvg) {
        await moveAsIs(imageFile.tempPath, logoFull)
      } else {
        await normalizeToWebp(imageFile.tempPath, logoFull)
      }
    } catch {
      await cleanupTemp(imageFile.tempPath)
      return NextResponse.json({ error: 'تعذر معالجة الشعار' }, { status: 400 })
    }

    await cleanupTemp(imageFile.tempPath)

    const updatedLogos = [...existingLogos, logoRelative]

    await prisma.settings.upsert({
      where: { expoId: expo.id },
      update: { logosJson: JSON.stringify(updatedLogos) },
      create: { expoId: expo.id, logosJson: JSON.stringify(updatedLogos) },
    })

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'logo_uploaded',
      entityType: 'settings',
      metadata: { count: updatedLogos.length },
    })

    return NextResponse.json({ logos: updatedLogos })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json({ error: 'حدث خطأ في رفع الشعار' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })
    const body = await request.json()
    const parsed = logoDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'مسار غير صالح' }, { status: 400 })
    }

    const logoPath = parsed.data.path

    if (!logoPath.startsWith(`uploads/logos/${expo.id}/`)) {
      return NextResponse.json({ error: 'مسار غير صالح' }, { status: 400 })
    }

    const settings = await prisma.settings.findUnique({
      where: { expoId: expo.id },
    })

    const existingLogos: string[] = settings?.logosJson ? JSON.parse(settings.logosJson) : []
    const updatedLogos = existingLogos.filter((logo) => logo !== logoPath)

    await prisma.settings.upsert({
      where: { expoId: expo.id },
      update: { logosJson: JSON.stringify(updatedLogos) },
      create: { expoId: expo.id, logosJson: JSON.stringify(updatedLogos) },
    })

    await rm(resolveUploadsPath(logoPath), { force: true })

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'logo_deleted',
      entityType: 'settings',
      metadata: { count: updatedLogos.length },
    })

    return NextResponse.json({ logos: updatedLogos })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json({ error: 'حدث خطأ في حذف الشعار' }, { status: 500 })
  }
}
