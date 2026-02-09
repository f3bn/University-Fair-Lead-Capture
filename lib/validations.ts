import { z } from 'zod'

// CSV/Excel injection protection
export function sanitizeForExport(value: string | null | undefined): string {
  if (!value) return ''
  const str = String(value)
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str
  }
  return str
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const loginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

export const scanSchema = z.object({
  qrRaw: z.string().min(1).max(2000),
})

export const leadUpdateSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  phoneCountry: z.string().max(8).optional().nullable(),
  phoneNumber: z.string().max(32).optional().nullable(),
  qualification: z.string().max(255).optional().nullable(),
  degreeLevel: z.string().max(255).optional().nullable(),
  major: z.string().max(255).optional().nullable(),
  majorLanguage: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(['draft', 'done', 'cancelled']).optional(),
})

export const leadResolveSchema = z.object({
  qrRaw: z.string().min(1).max(2000),
})

export const selectOptionSchema = z.object({
  category: z.enum(['qualification', 'degree_level', 'major', 'major_language', 'country_code']),
  valueAr: z.string().min(1).max(255),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
})

export const expoSettingsSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().max(500).optional(),
  date: z.string().optional(),
  exportIncludeDrafts: z.boolean().optional(),
  exportIncludeNeedsReview: z.boolean().optional(),
  exportIncludeCancelled: z.boolean().optional(),
  exportScope: z.enum(['all', 'today']).optional(),
})

export const leadIdSchema = z.object({
  id: z.string().cuid(),
})

export const leadListQuerySchema = z.object({
  filter: z.enum(['all', 'today', 'draft', 'done', 'cancelled', 'needsReview']).optional(),
  search: z.string().max(200).optional(),
})

export const optionsQuerySchema = z.object({
  category: z.enum(['qualification', 'degree_level', 'major', 'major_language', 'country_code']).optional(),
})

export const logoDeleteSchema = z.object({
  path: z.string().min(1).max(300),
})

export const exportFormatSchema = z.object({
  format: z.enum(['excel', 'pdf']).optional(),
})

export const evidenceUploadSchema = z.object({
  leadId: z.string().cuid(),
})

export const passwordPolicySchema = z
  .string()
  .min(12)
  .regex(/[a-z]/, 'Lowercase required')
  .regex(/[A-Z]/, 'Uppercase required')
  .regex(/[0-9]/, 'Number required')
  .regex(/[^A-Za-z0-9]/, 'Symbol required')

// File upload validation (client-side hints only)
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB
export const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ALLOWED_LOGO_TYPES = [...ALLOWED_IMAGE_TYPES, 'image/svg+xml']

export function validateImageFile(file: File, maxBytes: number = MAX_UPLOAD_BYTES): { valid: boolean; error?: string } {
  if (file.size > maxBytes) {
    return { valid: false, error: 'حجم الملف كبير جداً' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'نوع الملف غير مدعوم' }
  }
  return { valid: true }
}

export function validateLogoFile(file: File, maxBytes: number = MAX_LOGO_BYTES): { valid: boolean; error?: string } {
  if (file.size > maxBytes) {
    return { valid: false, error: 'حجم الملف كبير جداً' }
  }
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return { valid: false, error: 'نوع الملف غير مدعوم' }
  }
  return { valid: true }
}

