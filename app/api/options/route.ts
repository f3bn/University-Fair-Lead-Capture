import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { selectOptionSchema, optionsQuerySchema } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { requireCsrf, requireOrigin } from '@/lib/security'

export async function GET(request: NextRequest) {
  try {
    const originError = requireOrigin(request)
    if (originError) return originError
    const { expo } = await authorizeRequest()

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const parsed = optionsQuerySchema.safeParse({ category })
    if (!parsed.success) {
      return NextResponse.json({ error: 'البيانات غير صالحة' }, { status: 400 })
    }

    type OptionWhereInput = {
      expoId: string
      category?: 'qualification' | 'degree_level' | 'major' | 'major_language' | 'country_code'
    }

    const where: OptionWhereInput = { expoId: expo.id }

    if (parsed.data.category) {
      where.category = parsed.data.category
    }

    const options = await prisma.selectOption.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' },
        { valueAr: 'asc' },
      ],
    })

    return NextResponse.json({ options })
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

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError
  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })

    const body = await request.json()
    const parsed = selectOptionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'البيانات غير صالحة' },
        { status: 400 }
      )
    }

    const option = await prisma.selectOption.create({
      data: {
        expoId: expo.id,
        category: parsed.data.category,
        valueAr: parsed.data.valueAr,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    })

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'option_created',
      entityType: 'option',
      entityId: option.id,
      metadata: { category: parsed.data.category },
    })

    return NextResponse.json({ option })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'حدث خطأ في إنشاء الخيار' },
      { status: 500 }
    )
  }
}
