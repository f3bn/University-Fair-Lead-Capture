import { prisma } from './prisma'

export type AuditAction = 
  | 'scan_created'
  | 'scan_duplicate'
  | 'scan_needs_review'
  | 'lead_updated'
  | 'lead_resolved'
  | 'lead_cancelled'
  | 'lead_restored'
  | 'option_created'
  | 'option_updated'
  | 'option_deleted'
  | 'settings_updated'
  | 'logo_uploaded'
  | 'logo_deleted'
  | 'export_excel'
  | 'export_pdf'
  | 'login'
  | 'logout'

export type EntityType = 'lead' | 'option' | 'settings' | 'user' | 'export'

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 200)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value
    } else if (value === null) {
      sanitized[key] = null
    }
  }
  return sanitized
}

export async function createAuditLog(params: {
  expoId: string
  userId: string
  action: AuditAction
  entityType: EntityType
  entityId?: string
  metadata?: Record<string, unknown>
}) {
  const metadata = params.metadata ? sanitizeMetadata(params.metadata) : null
  return prisma.auditLog.create({
    data: {
      expoId: params.expoId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  })
}
