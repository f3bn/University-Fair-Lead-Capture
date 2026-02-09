import { createHash } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { dirname } from 'path'
import QRCode from 'qrcode'
import { resolveUploadsPath } from './image-processing'

export function computeQrHash(qrRaw: string): string {
  return createHash('sha256').update(qrRaw).digest('hex')
}

export function getImageBasePath(expoId: string, leadId: string): string {
  const date = new Date().toISOString().split('T')[0]
  return `uploads/scans/${expoId}/${date}/${leadId}`
}

export async function saveEvidenceImage(
  expoId: string,
  leadId: string,
  imageData: Buffer,
  extension: string = 'webp'
): Promise<string> {
  const basePath = getImageBasePath(expoId, leadId)
  const filePath = `${basePath}_evidence.${extension}`
  const fullPath = resolveUploadsPath(filePath)
  
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, imageData)
  
  return filePath
}

export async function saveGeneratedQrImage(
  expoId: string,
  leadId: string,
  imageData: Buffer
): Promise<string> {
  const basePath = getImageBasePath(expoId, leadId)
  const filePath = `${basePath}_qr.png`
  const fullPath = resolveUploadsPath(filePath)
  
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, imageData)
  
  return filePath
}

export async function generateQrPngBuffer(qrRaw: string): Promise<Buffer> {
  return QRCode.toBuffer(qrRaw, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
  })
}
