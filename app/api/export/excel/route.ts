import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { sanitizeForExport } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp, requireOrigin } from '@/lib/security'
import { env } from '@/lib/env'
import { logSecurityEvent } from '@/lib/security-log'
import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { resolveUploadsPath } from '@/lib/image-processing'

export const runtime = 'nodejs'

const sanitizePhoneForExport = (value: string | null | undefined) => {
  if (!value) return ''
  const str = String(value).trim()
  if (/^\+?[0-9\s\-()]+$/.test(str)) return str
  return sanitizeForExport(str)
}

function isSafeLogoPath(path: string, expoId: string): boolean {
  return path.startsWith(`uploads/logos/${expoId}/`)
}

function isSafeScanPath(path: string, expoId: string): boolean {
  return path.startsWith(`uploads/scans/${expoId}/`)
}

async function toBase64Png(relativePath: string, maxSize: number, expoId: string): Promise<string | null> {
  try {
    if (!isSafeScanPath(relativePath, expoId)) return null
    const fullPath = resolveUploadsPath(relativePath)
    const input = await readFile(fullPath)
    const png = await sharp(input)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

async function toLogoPng(relativePath: string, width: number, height: number, expoId: string): Promise<string | null> {
  try {
    if (!isSafeLogoPath(relativePath, expoId)) return null
    const fullPath = resolveUploadsPath(relativePath)
    const input = await readFile(fullPath)
    const png = await sharp(input)
      .resize({
        width,
        height,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const originError = requireOrigin(request)
  if (originError) return originError

  const rate = rateLimit(`export-excel:${getClientIp(request)}`, { windowMs: 60_000, max: 5 })
  if (!rate.allowed) {
    logSecurityEvent({ event: 'rate_limit', key: 'export-excel', ip: getClientIp(request) })
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': rate.retryAfter.toString() } }
    )
  }

  try {
    const { user, expo } = await authorizeRequest({ role: 'admin' })

    const settings = await prisma.settings.findUnique({
      where: { expoId: expo.id },
    })

    const logos: string[] = settings?.logosJson ? JSON.parse(settings.logosJson) : []

    const exportIncludeDrafts = settings?.exportIncludeDrafts ?? true
    const exportIncludeNeedsReview = settings?.exportIncludeNeedsReview ?? false
    const exportIncludeCancelled = settings?.exportIncludeCancelled ?? false
    const exportScope = settings?.exportScope ?? 'all'

    const statusSet: Array<'draft' | 'done' | 'cancelled'> = ['done']
    if (exportIncludeDrafts) statusSet.push('draft')
    if (exportIncludeCancelled) statusSet.push('cancelled')

    const where: {
      expoId: string
      scannedAt?: { gte: Date }
      status?: { in: Array<'draft' | 'done' | 'cancelled'> }
      qrDecodeStatus?: { not: 'failed' }
      OR?: Array<Record<string, unknown>>
    } = { expoId: expo.id }

    if (exportScope === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      where.scannedAt = { gte: today }
    }

    if (exportIncludeNeedsReview) {
      where.OR = [
        { status: { in: statusSet } },
        { qrDecodeStatus: 'failed' },
      ]
    } else {
      where.status = { in: statusSet }
      where.qrDecodeStatus = { not: 'failed' }
    }

    const maxRows = env.EXPORT_MAX_ROWS
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { scannedAt: 'asc' },
      take: maxRows + 1,
    })

    if (leads.length > maxRows) {
      return NextResponse.json({ error: 'Export limit exceeded' }, { status: 413 })
    }

    await createAuditLog({
      expoId: expo.id,
      userId: user.id,
      action: 'export_excel',
      entityType: 'export',
      metadata: { count: leads.length },
    })
    logSecurityEvent({ event: 'export', format: 'excel', userId: user.id, expoId: expo.id, count: leads.length })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Lead Capture'
    const worksheet = workbook.addWorksheet('Leads', {
      views: [{ rightToLeft: true }],
    })

    worksheet.properties.defaultRowHeight = 20

    const columnWidths = [5, 20, 25, 20, 16, 16, 18, 18, 18, 16, 24, 18, 18]
    worksheet.columns = columnWidths.map((width) => ({ width }))

    let currentRow = 1

    if (logos.length > 0) {
      const logoWidth = 160
      const logoHeight = 64
      const logoGap = 20
      worksheet.getRow(currentRow).height = 80

      const columnPixels = columnWidths.map((width) => Math.floor(width * 7 + 5))
      const totalWidth = columnPixels.reduce((sum, width) => sum + width, 0)
      const blockWidth = logos.length * logoWidth + Math.max(0, logos.length - 1) * logoGap
      const startX = Math.max(0, (totalWidth - blockWidth) / 2)

      const pxToCol = (px: number) => {
        let col = 0
        let remaining = px
        while (col < columnPixels.length && remaining > columnPixels[col]) {
          remaining -= columnPixels[col]
          col += 1
        }
        const colWidth = columnPixels[col] || columnPixels[columnPixels.length - 1] || 1
        const offset = remaining / colWidth
        return col + offset
      }

      let cursor = startX
      for (let i = 0; i < logos.length; i += 1) {
        const png = await toLogoPng(logos[i], logoWidth, logoHeight, expo.id)
        if (!png) continue
        const imageId = workbook.addImage({ base64: png, extension: 'png' })
        worksheet.addImage(imageId, {
          tl: { col: pxToCol(cursor), row: currentRow - 1 },
          ext: { width: logoWidth, height: logoHeight },
        })
        cursor += logoWidth + logoGap
      }
      currentRow += 1
    }

    const titleRow = worksheet.getRow(currentRow)
    const expoDate = expo.date ? new Date(expo.date).toLocaleDateString('ar-SA') : ''
    titleRow.getCell(1).value = `${expo.name} ${expoDate ? `- ${expoDate}` : ''}`
    titleRow.getCell(1).font = { bold: true, size: 16, name: 'IBM Plex Sans Arabic' }
    titleRow.getCell(1).alignment = { horizontal: 'center' }
    worksheet.mergeCells(currentRow, 1, currentRow, 13)
    currentRow += 2

    const headers = [
      '#',
      '\u0648\u0642\u062a \u0627\u0644\u0645\u0633\u062d',
      '\u0643\u0648\u062f QR',
      '\u0627\u0644\u0627\u0633\u0645',
      '\u0631\u0645\u0632 \u0627\u0644\u062f\u0648\u0644\u0629',
      '\u0627\u0644\u0647\u0627\u062a\u0641',
      '\u0627\u0644\u0645\u0624\u0647\u0644',
      '\u062f\u0631\u062c\u0629 \u0627\u0644\u062a\u062e\u0635\u0635',
      '\u0627\u0644\u062a\u062e\u0635\u0635',
      '\u0644\u063a\u0629 \u0627\u0644\u062a\u062e\u0635\u0635',
      '\u0645\u0644\u0627\u062d\u0638\u0627\u062a',
      'QR \u0627\u0644\u0645\u0648\u0644\u062f',
      '\u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0623\u0635\u0644\u064a\u0629',
    ]

    const headerRow = worksheet.getRow(currentRow)
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1)
      cell.value = header
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'IBM Plex Sans Arabic' }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
    currentRow += 1

    for (let i = 0; i < leads.length; i += 1) {
      const lead = leads[i]
      const row = worksheet.getRow(currentRow)
      row.height = 80

      const values = [
        i + 1,
        lead.scannedAt ? new Date(lead.scannedAt).toLocaleString('ar-SA') : '',
        sanitizeForExport(lead.qrRaw || '\u064a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629'),
        sanitizeForExport(lead.name),
        sanitizePhoneForExport(lead.phoneCountry),
        sanitizePhoneForExport(lead.phoneNumber),
        sanitizeForExport(lead.qualification),
        sanitizeForExport(lead.degreeLevel),
        sanitizeForExport(lead.major),
        sanitizeForExport(lead.majorLanguage),
        sanitizeForExport(lead.notes),
        '',
        '',
      ]

      values.forEach((value, colIndex) => {
        const cell = row.getCell(colIndex + 1)
        cell.value = value
        cell.font = { name: 'IBM Plex Sans Arabic', size: 11 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })

      if (lead.evidenceImagePath) {
        const png = await toBase64Png(lead.evidenceImagePath, 120, expo.id)
        if (png) {
          const imageId = workbook.addImage({ base64: png, extension: 'png' })
          worksheet.addImage(imageId, {
            tl: { col: 12, row: currentRow - 1 },
            ext: { width: 90, height: 90 },
          })
        }
      }

      if (lead.generatedQrImagePath) {
        const png = await toBase64Png(lead.generatedQrImagePath, 120, expo.id)
        if (png) {
          const imageId = workbook.addImage({ base64: png, extension: 'png' })
          worksheet.addImage(imageId, {
            tl: { col: 11, row: currentRow - 1 },
            ext: { width: 90, height: 90 },
          })
        }
      }

      currentRow += 1
    }

    const taqahostSvgPath = join(process.cwd(), 'public', 'brand', 'taqahost.svg')
    try {
      const svg = await readFile(taqahostSvgPath)
      const png = await sharp(svg).png().toBuffer()
      const imageId = workbook.addImage({ base64: `data:image/png;base64,${png.toString('base64')}`, extension: 'png' })
      const footerRow = currentRow + 1
      worksheet.getRow(footerRow).height = 30
      worksheet.getCell(footerRow, 1).value = 'تطوير'
      worksheet.getCell(footerRow, 1).font = { name: 'IBM Plex Sans Arabic', size: 10 }
      worksheet.addImage(imageId, {
        tl: { col: 1, row: footerRow - 1 },
        ext: { width: 90, height: 22 },
      })
    } catch {
      // ignore footer branding errors
    }

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leads_${Date.now()}.xlsx"`,
      },
    })
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
