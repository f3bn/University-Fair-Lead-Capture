import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await requireAdmin()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Admin')) {
      redirect('/dashboard')
    }
    redirect('/login')
  }
  return <>{children}</>
}
