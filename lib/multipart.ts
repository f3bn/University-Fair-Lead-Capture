import Busboy from 'busboy'
import { Readable } from 'stream'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join, extname } from 'path'
import { randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'

export interface UploadedFile {
  fieldname: string
  tempPath: string
  filename: string
  mimeType: string
  size: number
}

export interface MultipartResult {
  fields: Record<string, string>
  files: Record<string, UploadedFile | undefined>
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export async function parseMultipart(
  request: NextRequest,
  options: {
    maxFileSize: number
    allowedMimeTypes: string[]
    maxFiles?: number
    maxFields?: number
  }
): Promise<MultipartResult> {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('INVALID_CONTENT_TYPE')
  }

  const uploadDir = join(process.cwd(), 'uploads', 'tmp')
  await mkdir(uploadDir, { recursive: true })

  const busboy = Busboy({
    headers: { 'content-type': contentType },
    limits: {
      fileSize: options.maxFileSize,
      files: options.maxFiles ?? 5,
      fields: options.maxFields ?? 50,
    },
  })

  const fields: Record<string, string> = {}
  const files: Record<string, UploadedFile | undefined> = {}
  const cleanupPaths: string[] = []
  const filePromises: Promise<void>[] = []
  let encounteredError: Error | null = null

  busboy.on('field', (name, value) => {
    fields[name] = value
  })

  busboy.on('file', (fieldname, file, info) => {
    const mimeType = info.mimeType || ''
    if (!options.allowedMimeTypes.includes(mimeType)) {
      encounteredError = new Error('UNSUPPORTED_TYPE')
      file.resume()
      return
    }

    const ext =
      MIME_EXT[mimeType] ||
      extname(info.filename || '').replace('.', '') ||
      'bin'
    const filename = info.filename || `upload.${ext}`
    const tempPath = join(
      uploadDir,
      `${Date.now()}_${randomBytes(6).toString('hex')}.${ext}`
    )
    cleanupPaths.push(tempPath)

    const writeStream = createWriteStream(tempPath)
    let size = 0

    file.on('data', (data) => {
      size += data.length
    })

    file.on('limit', () => {
      encounteredError = new Error('FILE_TOO_LARGE')
      file.unpipe(writeStream)
      writeStream.destroy()
      file.resume()
    })

    const finished = new Promise<void>((resolve, reject) => {
      writeStream.on('error', reject)
      writeStream.on('close', () => resolve())
    })

    file.pipe(writeStream)

    filePromises.push(
      finished.then(() => {
        if (!encounteredError) {
          files[fieldname] = {
            fieldname,
            tempPath,
            filename,
            mimeType,
            size,
          }
        }
      })
    )
  })

  const stream = request.body
    ? Readable.fromWeb(request.body as unknown as NodeReadableStream)
    : null
  if (!stream) {
    throw new Error('EMPTY_BODY')
  }

  await new Promise<void>((resolve, reject) => {
    busboy.on('error', reject)
    busboy.on('finish', resolve)
    stream.pipe(busboy)
  })

  await Promise.all(filePromises)

  if (encounteredError) {
    await Promise.all(
      cleanupPaths.map(async (path) => {
        try {
          await rm(path, { force: true })
        } catch {
          // ignore cleanup errors
        }
      })
    )
    throw encounteredError
  }

  return { fields, files }
}
