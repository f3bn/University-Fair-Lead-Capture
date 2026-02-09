import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { requireOrigin } from '@/lib/security'
import { exportFormatSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const originError = requireOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const parsed = exportFormatSchema.safeParse({
      format: searchParams.get('format') || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'البيانات غير صالحة' }, { status: 400 })
    }
    const format = parsed.data.format || 'excel'
    const target = format === 'pdf' ? '/api/export/pdf' : '/api/export/excel'
    return NextResponse.redirect(new URL(target, request.url))
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'صلاحيات المدير مطلوبة' }, { status: 403 })
    }
    return NextResponse.json({ error: 'حدث خطأ في التصدير' }, { status: 500 })
  }
}
