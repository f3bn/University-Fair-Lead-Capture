const PUBLIC_PATHS = new Set<string>(['/', '/login'])

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return false
}

export function shouldRequireAuth(pathname: string): boolean {
  if (pathname.startsWith('/api')) return false
  return !isPublicPath(pathname)
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}
