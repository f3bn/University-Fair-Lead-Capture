'use client'

import { ReactNode, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RequireAuth, useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/context'
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  LayoutDashboard,
  List,
  ScanLine,
  Monitor,
  Settings,
  ListChecks,
  LogOut,
  Menu,
  Languages,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExpoLogos } from '@/components/expo-logos'

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  adminOnly?: boolean
}

type AppUser = {
  name: string
  email?: string
  role: 'admin' | 'operator'
} | null

interface SidebarContentProps {
  navItems: NavItem[]
  pathname: string
  onNavigate: () => void
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Dictionary
  user: AppUser
}

function NavLink({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem
  isActive: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {item.icon}
      <span className="font-medium">{item.label}</span>
    </Link>
  )
}

function SidebarContent({
  navItems,
  pathname,
  onNavigate,
  locale,
  setLocale,
  t,
  user,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <div className="flex items-center justify-center">
          <ExpoLogos
            imgClassName="h-16"
            className="max-w-[400px] justify-center"
            fallbackText=""
            maxCount={1}
          />
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={pathname === item.href}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            className="gap-2 rounded-xl"
          >
            <Languages className="h-4 w-4" />
            {locale === 'ar' ? 'EN' : 'العربية'}
          </Button>
        </div>
        {user && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.role === 'admin' ? t.common.roleAdmin : t.common.roleOperator}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth()
  const { t, locale, setLocale, dir } = useI18n()
  const pathname = usePathname() || ''
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: t.nav.dashboard,
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      href: '/leads',
      label: t.nav.leads,
      icon: <List className="h-5 w-5" />,
    },
    {
      href: '/scan',
      label: t.nav.scan,
      icon: <ScanLine className="h-5 w-5" />,
    },
    {
      href: '/receiver',
      label: t.nav.receiver,
      icon: <Monitor className="h-5 w-5" />,
    },
    {
      href: '/admin/options',
      label: t.nav.options,
      icon: <ListChecks className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      href: '/admin/settings',
      label: t.nav.settings,
      icon: <Settings className="h-5 w-5" />,
      adminOnly: true,
    },
  ]

  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin)

  return (
    <RequireAuth>
      <div className={cn('min-h-screen bg-background', dir === 'rtl' ? 'rtl' : 'ltr')} dir={dir}>
        {/* Desktop Sidebar */}
        <aside className="hidden lg:fixed lg:inset-y-0 lg:start-0 lg:flex lg:w-64 lg:flex-col bg-card border-e border-border">
          <SidebarContent
            navItems={filteredNavItems}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
            locale={locale}
            setLocale={setLocale}
            t={t}
            user={user}
          />
        </aside>

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-card border-b border-border">
          <div className="flex items-center justify-between h-16 px-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={dir === 'rtl' ? 'right' : 'left'} className="p-0 w-72">
                <SidebarContent
                  navItems={filteredNavItems}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                  locale={locale}
                  setLocale={setLocale}
                  t={t}
                  user={user}
                />
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <ExpoLogos imgClassName="h-6" className="max-w-[140px] justify-center" fallbackText="" maxCount={1} />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {user?.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={dir === 'rtl' ? 'start' : 'end'} className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
                  <Languages className="h-4 w-4 me-2" />
                  {locale === 'ar' ? 'English' : 'العربية'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="h-4 w-4 me-2" />
                  {t.common.logout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content */}
        <main className="lg:ps-64" dir={dir} style={{ direction: dir }}>
          <div
            className={cn('p-4 lg:p-6', dir === 'rtl' && 'text-right')}
            dir={dir}
            style={{ direction: dir }}
          >
            {children}
          </div>
          <footer className="px-4 pb-6 lg:px-6">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>{t.common.developedBy}</span>
              <a
                href="https://www.taqahost.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TAQAHOST"
              >
                <img src="/brand/taqahost.svg" alt="TAQAHOST" className="h-4 w-auto opacity-80" />
              </a>
            </div>
          </footer>
        </main>
      </div>
    </RequireAuth>
  )
}
