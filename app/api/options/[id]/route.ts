import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { selectOptionSchema, leadIdSchema } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { requireCsrf } from '@/lib/security'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError
  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })
    const { id } = await params

    const parsedId = leadIdSchema.safeParse({ id })
    if (!parsedId.success) {
      return NextResponse.json({ error: 'الخيار غير موجود' }, { status: 404 })
    }

    const option = await prisma.selectOption.findFirst({
      where: { id, expoId: expo.id },
    })

    if (!option) {
      return NextResponse.json(
        { error: 'الخيار غير موجود' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const parsed = selectOptionSchema.partial().safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'البيانات غير صالحة' },
        { status: 400 }
      )
    }

    const updated = await prisma.selectOption.updateMany({
      where: { id, expoId: expo.id },
      data: parsed.data,
    })

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'الخيار غير موجود' },
        { status: 404 }
      )
    }

    const updatedOption = await prisma.selectOption.findUnique({ where: { id } })

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'option_updated',
      entityType: 'option',
      entityId: id,
      metadata: { changes: Object.keys(parsed.data) },
    })

    return NextResponse.json({ option: updatedOption })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'حدث خطأ في تحديث الخيار' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError
  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })
    const { id } = await params

    const parsedId = leadIdSchema.safeParse({ id })
    if (!parsedId.success) {
      return NextResponse.json({ error: 'الخيار غير موجود' }, { status: 404 })
    }

    const option = await prisma.selectOption.findFirst({
      where: { id, expoId: expo.id },
    })

    if (!option) {
      return NextResponse.json(
        { error: 'الخيار غير موجود' },
        { status: 404 }
      )
    }

    const deleted = await prisma.selectOption.deleteMany({
      where: { id, expoId: expo.id },
    })

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: 'الخيار غير موجود' },
        { status: 404 }
      )
    }

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'option_deleted',
      entityType: 'option',
      entityId: id,
      metadata: { category: option.category },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'حدث خطأ في حذف الخيار' },
      { status: 500 }
    )
  }
}
