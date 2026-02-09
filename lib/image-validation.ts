import { fileTypeFromBuffer } from 'file-type'
import { readFile } from 'fs/promises'
import type { UploadedFile } from './multipart'
import { ALLOWED_IMAGE_TYPES } from './validations'

export async function validateImageUpload(
  file: UploadedFile,
  maxBytes: number,
  allowed: string[] = ALLOWED_IMAGE_TYPES
): Promise<{ ok: boolean; mimeType?: string; error?: string }> {
  if (file.size > maxBytes) {
    return { ok: false, error: 'FILE_TOO_LARGE' }
  }
  if (allowed.includes('image/svg+xml') && file.mimeType === 'image/svg+xml') {
    return { ok: true, mimeType: 'image/svg+xml' }
  }
  const buffer = await readFile(file.tempPath)
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !allowed.includes(detected.mime)) {
    return { ok: false, error: 'UNSUPPORTED_TYPE' }
  }
  return { ok: true, mimeType: detected.mime }
}
