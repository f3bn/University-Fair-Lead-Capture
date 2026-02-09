'use client'

import { ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import { I18nProvider } from '@/lib/i18n/context'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </I18nProvider>
  )
}
