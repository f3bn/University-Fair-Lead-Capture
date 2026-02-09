import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { requireOrigin } from '@/lib/security'
import { leadListQuerySchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const originError = requireOrigin(request)
    if (originError) return originError
    const { expo } = await authorizeRequest()

    const { searchParams } = new URL(request.url)
    const parsed = leadListQuerySchema.safeParse({
      filter: searchParams.get('filter') || undefined,
      search: searchParams.get('search') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'البيانات غير صالحة' }, { status: 400 })
    }

    const filter = parsed.data.filter || 'all'
    const search = parsed.data.search || ''

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    type LeadWhereInput = {
      expoId: string
      status?: 'draft' | 'done' | 'cancelled'
      qrDecodeStatus?: 'failed'
      scannedAt?: { gte: Date }
      OR?: Array<{
        qrRaw?: { contains: string }
        name?: { contains: string }
        phoneNumber?: { contains: string }
      }>
    }

    const where: LeadWhereInput = { expoId: expo.id }

    switch (filter) {
      case 'today':
        where.scannedAt = { gte: today }
        break
      case 'draft':
        where.status = 'draft'
        break
      case 'done':
        where.status = 'done'
        break
      case 'cancelled':
        where.status = 'cancelled'
        break
      case 'needsReview':
        where.qrDecodeStatus = 'failed'
        break
    }

    if (search) {
      where.OR = [
        { qrRaw: { contains: search } },
        { name: { contains: search } },
        { phoneNumber: { contains: search } },
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { scannedAt: 'asc' },
      take: 500,
    })

    return NextResponse.json({ leads })
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
