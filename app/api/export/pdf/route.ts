import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeRequest } from '@/lib/auth'
import { escapeHtml } from '@/lib/validations'
import { createAuditLog } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp, requireOrigin } from '@/lib/security'
import { env } from '@/lib/env'
import { logSecurityEvent } from '@/lib/security-log'
import puppeteer from 'puppeteer'
import sharp from 'sharp'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { resolveUploadsPath } from '@/lib/image-processing'

export const runtime = 'nodejs'

const sanitizePhoneForExport = (value: string | null | undefined) => {
  if (!value) return ''
  const str = String(value).trim()
  if (/^\+?[0-9\s\-()]+$/.test(str)) return str
  return str
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
    const buffer = await readFile(fullPath)
    const png = await sharp(buffer)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    return png.toString('base64')
  } catch {
    return null
  }
}

async function toLogoDataUri(relativePath: string, maxSize: number, expoId: string): Promise<string | null> {
  try {
    if (!isSafeLogoPath(relativePath, expoId)) return null
    const fullPath = resolveUploadsPath(relativePath)
    const buffer = await readFile(fullPath)
    const png = await sharp(buffer)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
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

  const rate = rateLimit(`export-pdf:${getClientIp(request)}`, { windowMs: 60_000, max: 5 })
  if (!rate.allowed) {
    logSecurityEvent({ event: 'rate_limit', key: 'export-pdf', ip: getClientIp(request) })
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
      action: 'export_pdf',
      entityType: 'export',
      metadata: { count: leads.length },
    })
    logSecurityEvent({ event: 'export', format: 'pdf', userId: user.id, expoId: expo.id, count: leads.length })

    const fontPath = join(process.cwd(), 'public', 'fonts', 'ibm-plex-sans-arabic.woff2')
    const fontBase64 = (await readFile(fontPath)).toString('base64')

    const logoImages = await Promise.all(logos.map((logo) => toLogoDataUri(logo, 140, expo.id)))
    const headerLogos = logoImages
      .filter(Boolean)
      .map(
        (logo) =>
          `<img src="${logo}" style="height:48px; width:auto; object-fit:contain; display:inline-block;" />`
      )
      .join('')

    const taqahostSvg = await readFile(join(process.cwd(), 'public', 'brand', 'taqahost.svg'))
    const taqahostPng = await sharp(taqahostSvg).png().toBuffer()
    const taqahostBase64 = taqahostPng.toString('base64')

    const rowsHtml = await Promise.all(
      leads.map(async (lead, index) => {
        const evidence = lead.evidenceImagePath ? await toBase64Png(lead.evidenceImagePath, 120, expo.id) : null
        const qr = lead.generatedQrImagePath ? await toBase64Png(lead.generatedQrImagePath, 120, expo.id) : null
        const qrValue = lead.qrRaw || '\u064a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629'
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(lead.scannedAt ? new Date(lead.scannedAt).toLocaleString('ar-SA') : '')}</td>
            <td>${escapeHtml(qrValue)}</td>
            <td>${escapeHtml(lead.name)}</td>
            <td dir="ltr">${escapeHtml(sanitizePhoneForExport([lead.phoneCountry, lead.phoneNumber].filter(Boolean).join(' ')))}</td>
            <td>${escapeHtml(lead.qualification)}</td>
            <td>${escapeHtml(lead.degreeLevel)}</td>
            <td>${escapeHtml(lead.major)}</td>
            <td>${escapeHtml(lead.majorLanguage)}</td>
            <td>${escapeHtml(lead.notes)}</td>
            <td>${qr ? `<img src="data:image/png;base64,${qr}" class="img-cell" />` : ''}</td>
            <td>${evidence ? `<img src="data:image/png;base64,${evidence}" class="img-cell" />` : ''}</td>
          </tr>
        `
      })
    )

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <style>
          @font-face {
            font-family: 'IBM Plex Sans Arabic';
            src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
            font-weight: 400;
            font-style: normal;
          }
          body {
            font-family: 'IBM Plex Sans Arabic', sans-serif;
            direction: rtl;
            font-size: 11px;
            margin: 0;
            padding: 0;
          }
          .content {
            padding: 0 24px 24px 24px;
          }
          h1 {
            margin: 0;
            font-size: 18px;
            color: #0f172a;
          }
          .subtitle {
            margin: 4px 0 16px;
            color: #475569;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #1f2937;
            padding: 6px;
            text-align: center;
            vertical-align: middle;
            word-wrap: break-word;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
          }
          .img-cell {
            width: 70px;
            height: 70px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <div class="content">
          <h1>${escapeHtml(expo.name)}</h1>
          <div class="subtitle">${escapeHtml(expo.location || '')} ${expo.date ? `- ${escapeHtml(new Date(expo.date).toLocaleDateString('ar-SA'))}` : ''}</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>\u0648\u0642\u062a \u0627\u0644\u0645\u0633\u062d</th>
                <th>\u0643\u0648\u062f QR</th>
                <th>\u0627\u0644\u0627\u0633\u0645</th>
                <th>\u0627\u0644\u0647\u0627\u062a\u0641</th>
                <th>\u0627\u0644\u0645\u0624\u0647\u0644</th>
                <th>\u062f\u0631\u062c\u0629 \u0627\u0644\u062a\u062e\u0635\u0635</th>
                <th>\u0627\u0644\u062a\u062e\u0635\u0635</th>
                <th>\u0644\u063a\u0629 \u0627\u0644\u062a\u062e\u0635\u0635</th>
                <th>\u0645\u0644\u0627\u062d\u0638\u0627\u062a</th>
                <th>QR \u0627\u0644\u0645\u0648\u0644\u062f</th>
                <th>\u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0623\u0635\u0644\u064a\u0629</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml.join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
    })
    try {
      const page = await browser.newPage()
      await page.setJavaScriptEnabled(false)
      await page.setDefaultNavigationTimeout(env.EXPORT_PDF_TIMEOUT_MS)
      await page.setDefaultTimeout(env.EXPORT_PDF_TIMEOUT_MS)

      await page.setRequestInterception(true)
      page.on('request', (req) => {
        const url = req.url()
        if (url.startsWith('data:') || url === 'about:blank') {
          req.continue()
        } else {
          req.abort()
        }
      })

      await page.setContent(html, { waitUntil: 'load', timeout: env.EXPORT_PDF_TIMEOUT_MS })

      const headerTemplate = `
      <style>
        @font-face {
          font-family: 'IBM Plex Sans Arabic';
          src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
          font-weight: 400;
          font-style: normal;
        }
      </style>
      <div style="width:100%; display:flex; justify-content:center; align-items:center; gap:12px; padding:4px 24px; font-family:'IBM Plex Sans Arabic', sans-serif;">
        ${headerLogos || ''}
      </div>
    `

      const footerTemplate = `
      <style>
        @font-face {
          font-family: 'IBM Plex Sans Arabic';
          src: url(data:font/woff2;base64,${fontBase64}) format('woff2');
          font-weight: 400;
          font-style: normal;
        }
      </style>
      <div style="width:100%; display:flex; justify-content:center; align-items:center; gap:8px; font-size:10px; color:#475569; padding:4px 24px; font-family:'IBM Plex Sans Arabic', sans-serif; direction:rtl;">
        <span style="font-family:'IBM Plex Sans Arabic', sans-serif;">\u062a\u0637\u0648\u064a\u0631</span>
        <a href="https://www.taqahost.com" style="display:inline-block;">
          <img src="data:image/png;base64,${taqahostBase64}" style="height:18px;" />
        </a>
      </div>
    `

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '110px', bottom: '60px', left: '24px', right: '24px' },
      })

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="leads_${Date.now()}.pdf"`,
        },
      })
    } finally {
      await browser.close()
    }
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
