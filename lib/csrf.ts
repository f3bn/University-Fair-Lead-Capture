export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  if (!match) return null
  return decodeURIComponent(match.split('=')[1])
}

export function withCsrf(headers: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken()
  if (!token) return headers
  return {
    ...headers,
    'x-csrf-token': token,
  }
}
