import { NextRequest, NextResponse } from 'next/server'
import { logout, getCurrentUser, getOrCreateExpo } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'
import { requireCsrf } from '@/lib/security'

export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request)
  if (csrfError) return csrfError
  try {
    const user = await getCurrentUser()
    
    if (user) {
      const expo = await getOrCreateExpo()
      await createAuditLog({
        expoId: expo.id,
        userId: user.id,
        action: 'logout',
        entityType: 'user',
        entityId: user.id,
      })
    }
    
    await logout()
    
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true })
  }
}
