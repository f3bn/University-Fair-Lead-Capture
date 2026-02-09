import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getOrCreateExpo } from '@/lib/auth'
import { createGuestToken, getGuestCookieName } from '@/lib/guest'

export async function GET() {
  try {
    const expo = await getOrCreateExpo()
    const settings = await prisma.settings.findUnique({
      where: { expoId: expo.id },
    })

    const response = NextResponse.json({
      expo: {
        id: expo.id,
        name: expo.name,
      },
      settings: settings
        ? {
            logos: settings.logosJson ? JSON.parse(settings.logosJson) : [],
          }
        : { logos: [] },
    })

    response.cookies.set(getGuestCookieName(), createGuestToken(expo.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60,
    })

    return response
  } catch {
    return NextResponse.json({ expo: null, settings: { logos: [] } }, { status: 200 })
  }
}
