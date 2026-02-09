import { mkdir, rm, copyFile } from 'fs/promises'
import { dirname, extname, join, sep } from 'path'
import sharp from 'sharp'

export const MAX_IMAGE_DIMENSION = 2400
const MAX_INPUT_PIXELS = 40_000_000

export async function normalizeToWebp(
  inputPath: string,
  outputPath: string,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<void> {
  const maxDimension = options.maxDimension ?? MAX_IMAGE_DIMENSION
  const quality = options.quality ?? 82

  await mkdir(dirname(outputPath), { recursive: true })
  await sharp(inputPath, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toFile(outputPath)
}

export async function moveAsIs(inputPath: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true })
  if (inputPath !== outputPath) {
    await copyFile(inputPath, outputPath)
  }
}

export function replaceExtension(filePath: string, ext: string): string {
  const base = filePath.replace(extname(filePath), '')
  const safeExt = ext.startsWith('.') ? ext.slice(1) : ext
  return `${base}.${safeExt}`
}

export async function cleanupTemp(path: string) {
  try {
    await rm(path, { force: true })
  } catch {
    // ignore
  }
}

export function resolveUploadsPath(relativePath: string): string {
  const uploadsRoot = join(process.cwd(), 'uploads') + sep
  const fullPath = join(process.cwd(), relativePath)
  if (!fullPath.startsWith(uploadsRoot)) {
    throw new Error('Invalid upload path')
  }
  return fullPath
}
