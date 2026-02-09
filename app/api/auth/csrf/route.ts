import { NextResponse } from 'next/server'
import { ensureCsrfCookie } from '@/lib/auth'

export async function GET() {
  await ensureCsrfCookie()
  return NextResponse.json({ ok: true })
}
