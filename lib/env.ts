import { z } from 'zod'

const optionalNumber = (schema: z.ZodNumber, fallback: number) =>
  z
    .preprocess((value) => (value === undefined || value === '' ? fallback : value), schema)
    .optional()
    .transform((value) => (value === undefined ? fallback : value))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  ALLOWED_HOSTS: z.string().min(1, 'ALLOWED_HOSTS is required'),
  TRUST_PROXY: z
    .preprocess((value) => (value === undefined || value === '' ? false : value), z.coerce.boolean())
    .optional()
    .transform((value) => (value === undefined ? false : value)),
  SESSION_TTL_MINUTES: optionalNumber(z.coerce.number().int().min(5).max(7 * 24 * 60), 240),
  SESSION_REFRESH_MINUTES: optionalNumber(z.coerce.number().int().min(1).max(7 * 24 * 60), 30),
  UPLOAD_MAX_BYTES: optionalNumber(z.coerce.number().int().min(1024).max(50 * 1024 * 1024), 10 * 1024 * 1024),
  LOGO_MAX_BYTES: optionalNumber(z.coerce.number().int().min(1024).max(20 * 1024 * 1024), 5 * 1024 * 1024),
  EXPORT_MAX_ROWS: optionalNumber(z.coerce.number().int().min(100).max(20000), 5000),
  EXPORT_PDF_TIMEOUT_MS: optionalNumber(z.coerce.number().int().min(1000).max(120000), 30000),
  LOGIN_RATE_LIMIT_MAX: optionalNumber(z.coerce.number().int().min(1).max(100), 10),
  LOGIN_RATE_LIMIT_WINDOW_MS: optionalNumber(z.coerce.number().int().min(1000).max(60 * 60 * 1000), 60_000),
  LOGIN_LOCKOUT_THRESHOLD: optionalNumber(z.coerce.number().int().min(3).max(20), 5),
  LOGIN_LOCKOUT_WINDOW_MS: optionalNumber(z.coerce.number().int().min(60_000).max(24 * 60 * 60 * 1000), 15 * 60_000),
  LOGIN_LOCKOUT_DURATION_MS: optionalNumber(z.coerce.number().int().min(60_000).max(24 * 60 * 60 * 1000), 15 * 60_000),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => issue.path[0])
    .filter(Boolean)
    .join(', ')
  throw new Error(`Missing or invalid environment variables: ${missing}`)
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeOrigin(origin: string): string {
  const url = new URL(origin)
  return url.origin
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase()
}

const env = parsed.data

const allowedOrigins = parseCsv(env.ALLOWED_ORIGINS).map(normalizeOrigin)
const allowedHosts = parseCsv(env.ALLOWED_HOSTS).map(normalizeHost)

if (allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS must contain at least one origin')
}

if (allowedHosts.length === 0) {
  throw new Error('ALLOWED_HOSTS must contain at least one host')
}

export { env, allowedOrigins, allowedHosts }
