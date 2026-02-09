import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { leadUpdateSchema, leadResolveSchema, leadIdSchema } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { computeQrHash, generateQrPngBuffer, saveGeneratedQrImage } from '@/lib/images'
import { requireCsrf, requireOrigin } from '@/lib/security'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const originError = requireOrigin(request)
    if (originError) return originError
    const { expo } = await authorizeRequest()
    const { id } = await params

    const parsedId = leadIdSchema.safeParse({ id })
    if (!parsedId.success) {
      return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
    }

    const lead = await prisma.lead.findFirst({
      where: { id, expoId: expo.id },
    })

    if (!lead) {
      return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    return NextResponse.json({ error: 'حدث خطأ في جلب البيانات' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError

  try {
    const { user, expo } = await authorizeRequest()
    const { id } = await params

    const parsedId = leadIdSchema.safeParse({ id })
    if (!parsedId.success) {
      return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
    }

    const lead = await prisma.lead.findFirst({
      where: { id, expoId: expo.id },
    })

    if (!lead) {
      return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
    }

    const body = await request.json()
    const { qrRaw, ...rest } = body as { qrRaw?: string }

    if (typeof qrRaw === 'string' && qrRaw.length > 0) {
      const resolved = leadResolveSchema.safeParse({ qrRaw })
      if (!resolved.success) {
        return NextResponse.json({ error: 'محتوى QR غير صالح' }, { status: 400 })
      }

      const updateParsed = leadUpdateSchema.safeParse(rest)
      if (!updateParsed.success) {
        return NextResponse.json({ error: 'البيانات غير صالحة' }, { status: 400 })
      }

      const qrHash = computeQrHash(qrRaw)
      const existing = await prisma.lead.findUnique({
        where: { expo_qr_unique: { expoId: expo.id, qrHash } },
      })

      if (existing && existing.id !== lead.id) {
        return NextResponse.json(
          { error: 'QR مكرر', duplicateLeadId: existing.id },
          { status: 409 }
        )
      }

      const qrPng = await generateQrPngBuffer(qrRaw)
      const qrPath = await saveGeneratedQrImage(expo.id, lead.id, qrPng)

      const updated = await prisma.lead.updateMany({
        where: { id: lead.id, expoId: expo.id },
        data: {
          ...updateParsed.data,
          qrRaw,
          qrHash,
          qrDecodeStatus: 'decoded',
          qrDecodeError: null,
          generatedQrImagePath: qrPath,
        },
      })

      if (updated.count === 0) {
        return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
      }

      const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } })

      await createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'lead_resolved',
        entityType: 'lead',
        entityId: lead.id,
      })

      return NextResponse.json({ lead: updatedLead })
    }

    const parsed = leadUpdateSchema.safeParse(rest)
    if (!parsed.success) {
      return NextResponse.json({ error: 'البيانات غير صالحة' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { ...parsed.data }

    if (parsed.data.status === 'cancelled' && lead.status !== 'cancelled') {
      updateData.cancelledAt = new Date()
      await createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'lead_cancelled',
        entityType: 'lead',
        entityId: id,
      })
    } else if (parsed.data.status && parsed.data.status !== 'cancelled' && lead.status === 'cancelled') {
      updateData.cancelledAt = null
      await createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'lead_restored',
        entityType: 'lead',
        entityId: id,
      })
    } else {
      await createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'lead_updated',
        entityType: 'lead',
        entityId: id,
        metadata: { changes: Object.keys(parsed.data) },
      })
    }

    const updated = await prisma.lead.updateMany({
      where: { id, expoId: expo.id },
      data: updateData,
    })

    if (updated.count === 0) {
      return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
    }

    const updatedLead = await prisma.lead.findUnique({ where: { id } })

    return NextResponse.json({ lead: updatedLead })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    return NextResponse.json({ error: 'حدث خطأ في تحديث البيانات' }, { status: 500 })
  }
}
