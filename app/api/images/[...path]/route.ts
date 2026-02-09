import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, getOrCreateExpo } from '@/lib/auth'
import { assertExpoScope } from '@/lib/authorization'
import { readFile } from 'fs/promises'
import { join, sep } from 'path'
import { getGuestCookieName, verifyGuestToken } from '@/lib/guest'
import { resolveUploadsPath } from '@/lib/image-processing'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    if (path.some((segment) => segment.includes('..') || segment.includes('\\'))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    const relativePath = path.join('/')
    if (!relativePath.startsWith('uploads/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    const uploadsRoot = join(process.cwd(), 'uploads')
    const filePath = resolveUploadsPath(relativePath)
    if (!filePath.startsWith(`${uploadsRoot}${sep}`)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    const segments = relativePath.split('/')
    const isLogoPath = segments[1] === 'logos'
    const isScanPath = segments[1] === 'scans'
    const expoId = segments[2]

    if (!expoId || (!isLogoPath && !isScanPath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    const user = await getCurrentUser().catch(() => null)
    if (user) {
      const expo = await getOrCreateExpo()
      assertExpoScope(expoId, expo.id)
    } else {
      if (!isLogoPath) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const guestToken = request.cookies.get(getGuestCookieName())?.value
      if (!verifyGuestToken(guestToken, expoId)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const ext = filePath.split('.').pop()?.toLowerCase()
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg' && isLogoPath
        ? 'image/svg+xml'
        : null

    if (!contentType) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 })
    }

    const file = await readFile(filePath)

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Expo scope')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }
}
