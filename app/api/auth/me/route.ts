import { NextResponse } from 'next/server'
import { getCurrentUser, ensureCsrfCookie } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 })
    }
    await ensureCsrfCookie()
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch {
    return NextResponse.json({ user: null }, { status: 401 })
  }
}
