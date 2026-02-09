import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const env = process.env as Record<string, string>
env.NODE_ENV = 'test'
env.DATABASE_URL = env.DATABASE_URL || 'mysql://user:pass@localhost:3306/test'
env.APP_SECRET = env.APP_SECRET || 'test-secret-32-characters-long-123456'
env.ALLOWED_ORIGINS = env.ALLOWED_ORIGINS || 'http://localhost:3000'
env.ALLOWED_HOSTS = env.ALLOWED_HOSTS || 'localhost:3000'
env.TRUST_PROXY = env.TRUST_PROXY || 'false'
env.SESSION_TTL_MINUTES = env.SESSION_TTL_MINUTES || '60'
env.SESSION_REFRESH_MINUTES = env.SESSION_REFRESH_MINUTES || '15'
env.UPLOAD_MAX_BYTES = env.UPLOAD_MAX_BYTES || '1048576'
env.LOGO_MAX_BYTES = env.LOGO_MAX_BYTES || '524288'
env.EXPORT_MAX_ROWS = env.EXPORT_MAX_ROWS || '100'
env.EXPORT_PDF_TIMEOUT_MS = env.EXPORT_PDF_TIMEOUT_MS || '5000'
env.LOGIN_RATE_LIMIT_MAX = env.LOGIN_RATE_LIMIT_MAX || '3'
env.LOGIN_RATE_LIMIT_WINDOW_MS = env.LOGIN_RATE_LIMIT_WINDOW_MS || '60000'
env.LOGIN_LOCKOUT_THRESHOLD = env.LOGIN_LOCKOUT_THRESHOLD || '3'
env.LOGIN_LOCKOUT_WINDOW_MS = env.LOGIN_LOCKOUT_WINDOW_MS || '60000'
env.LOGIN_LOCKOUT_DURATION_MS = env.LOGIN_LOCKOUT_DURATION_MS || '60000'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
})
