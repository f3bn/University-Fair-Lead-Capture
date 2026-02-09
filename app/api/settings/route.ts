import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { expoSettingsSchema } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { requireCsrf, requireOrigin } from '@/lib/security'

export async function GET(request: NextRequest) {
  try {
    const originError = requireOrigin(request)
    if (originError) return originError
    const { expo } = await authorizeRequest()

    const settings = await prisma.settings.findUnique({
      where: { expoId: expo.id },
    })

    const exportDefaults = {
      exportIncludeDrafts: true,
      exportIncludeNeedsReview: false,
      exportIncludeCancelled: false,
      exportScope: 'all' as const,
    }

    return NextResponse.json({
      expo: {
        id: expo.id,
        name: expo.name,
        location: expo.location,
        date: expo.date,
      },
      settings: settings
        ? {
            logos: settings.logosJson ? JSON.parse(settings.logosJson) : [],
            exportIncludeDrafts: settings.exportIncludeDrafts,
            exportIncludeNeedsReview: settings.exportIncludeNeedsReview,
            exportIncludeCancelled: settings.exportIncludeCancelled,
            exportScope: settings.exportScope,
          }
        : {
            logos: [],
            ...exportDefaults,
          },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'حدث خطأ في جلب البيانات' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError
  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })

    const body = await request.json()
    const parsed = expoSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'البيانات غير صالحة' },
        { status: 400 }
      )
    }

    const updatedExpo = await prisma.expo.update({
      where: { id: expo.id },
      data: {
        name: parsed.data.name,
        location: parsed.data.location,
        date: parsed.data.date ? new Date(parsed.data.date) : null,
      },
    })

    const settingsUpdate: Record<string, unknown> = {}
    if (typeof parsed.data.exportIncludeDrafts === 'boolean') {
      settingsUpdate.exportIncludeDrafts = parsed.data.exportIncludeDrafts
    }
    if (typeof parsed.data.exportIncludeNeedsReview === 'boolean') {
      settingsUpdate.exportIncludeNeedsReview = parsed.data.exportIncludeNeedsReview
    }
    if (typeof parsed.data.exportIncludeCancelled === 'boolean') {
      settingsUpdate.exportIncludeCancelled = parsed.data.exportIncludeCancelled
    }
    if (parsed.data.exportScope) {
      settingsUpdate.exportScope = parsed.data.exportScope
    }

    if (Object.keys(settingsUpdate).length > 0) {
      await prisma.settings.upsert({
        where: { expoId: expo.id },
        update: settingsUpdate,
        create: {
          expoId: expo.id,
          logosJson: '[]',
          exportIncludeDrafts: (settingsUpdate.exportIncludeDrafts as boolean | undefined) ?? true,
          exportIncludeNeedsReview: (settingsUpdate.exportIncludeNeedsReview as boolean | undefined) ?? false,
          exportIncludeCancelled: (settingsUpdate.exportIncludeCancelled as boolean | undefined) ?? false,
          exportScope: (settingsUpdate.exportScope as 'all' | 'today' | undefined) ?? 'all',
        },
      })
    }

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'settings_updated',
      entityType: 'settings',
      metadata: { changes: Object.keys(parsed.data) },
    })

    return NextResponse.json({
      expo: {
        id: updatedExpo.id,
        name: updatedExpo.name,
        location: updatedExpo.location,
        date: updatedExpo.date,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'حدث خطأ في تحديث الإعدادات' },
      { status: 500 }
    )
  }
}
