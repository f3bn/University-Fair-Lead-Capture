type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function rateLimit(
  key: string,
  options: { windowMs: number; max: number }
): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, retryAfter: Math.ceil(options.windowMs / 1000) }
  }

  if (entry.count >= options.max) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count += 1
  store.set(key, entry)
  return { allowed: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
}
