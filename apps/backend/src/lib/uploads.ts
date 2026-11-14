import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import type { Env } from "@casarenous/shared"
import { ApiError } from "./errors.js"

const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF = Buffer.from("%PDF-", "ascii")
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])

export interface DetectedType {
  mime: string
  extension: string
  family: "image" | "pdf" | "office"
}

function detect(buffer: Buffer): DetectedType | null {
  if (buffer.subarray(0, 3).equals(JPEG)) {
    return { mime: "image/jpeg", extension: "jpg", family: "image" }
  }
  if (buffer.subarray(0, 8).equals(PNG)) {
    return { mime: "image/png", extension: "png", family: "image" }
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp", family: "image" }
  }
  if (buffer.subarray(0, 5).equals(PDF)) {
    return { mime: "application/pdf", extension: "pdf", family: "pdf" }
  }
  if (buffer.subarray(0, 4).equals(ZIP)) {
    const text = buffer.toString("latin1")
    if (text.includes("[Content_Types].xml")) {
      if (text.includes("word/")) {
        return {
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          extension: "docx",
          family: "office",
        }
      }
      if (text.includes("xl/")) {
        return {
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          extension: "xlsx",
          family: "office",
        }
      }
    }
  }
  return null
}

export const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"])
export const DOCUMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

export function assertMagic(
  buffer: Buffer,
  allowed: ReadonlySet<string>,
): DetectedType {
  const detected = detect(buffer)
  if (!detected || !allowed.has(detected.mime)) {
    throw ApiError.unsupportedMedia(
      "Format non autorisé. Formats acceptés : JPEG, PNG, WebP, PDF, DOCX, XLSX.",
    )
  }
  return detected
}

export function encryptionKey(env: Env): Buffer {
  return Buffer.from(env.FILE_ENCRYPTION_KEY, "base64")
}

export interface EncryptedBuffer {
  data: Buffer
  iv: string
  tag: string
}

export function encrypt(buffer: Buffer, key: Buffer): EncryptedBuffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(buffer), cipher.final()])
  return {
    data,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  }
}

export function decrypt(data: Buffer, key: Buffer, iv: string, tag: string): Buffer {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(data), decipher.final()])
  } catch {
    throw ApiError.internal("Impossible de déchiffrer le fichier", "decrypt_failed")
  }
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export function safeOriginalName(name: string): string {
  const cleaned = Array.from(path.basename(name))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code >= 32 && code !== 127
    })
    .join("")
    .trim()
  return (cleaned || "fichier").slice(0, 200)
}

export function newStorageKey(kind: "documents" | "photos" | "thumbs", extension: string): string {
  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${kind}/${year}/${month}/${randomUUID()}.${extension}`
}

export function resolveStoragePath(uploadDir: string, storageKey: string): string {
  const root = path.resolve(uploadDir)
  const target = path.resolve(root, storageKey)
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw ApiError.badRequest("Chemin de stockage invalide", "invalid_storage_path")
  }
  return target
}

export async function writeEncrypted(
  uploadDir: string,
  storageKey: string,
  buffer: Buffer,
  key: Buffer,
): Promise<EncryptedBuffer> {
  const encrypted = encrypt(buffer, key)
  const target = resolveStoragePath(uploadDir, storageKey)
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
  await writeFile(target, encrypted.data, { mode: 0o600 })
  return encrypted
}

export async function readEncrypted(
  uploadDir: string,
  storageKey: string,
  key: Buffer,
  iv: string,
  tag: string,
): Promise<Buffer> {
  const target = resolveStoragePath(uploadDir, storageKey)
  const data = await readFile(target).catch(() => {
    throw ApiError.notFound("Fichier introuvable sur le stockage", "file_missing")
  })
  return decrypt(data, key, iv, tag)
}

export async function removeStored(uploadDir: string, storageKey: string): Promise<void> {
  try {
    await unlink(resolveStoragePath(uploadDir, storageKey))
  } catch {
    // Suppression best-effort.
  }
}

export interface ProcessedPhoto {
  original: Buffer
  thumbnail: Buffer
  mime: "image/jpeg"
}

/**
 * Ré-encode systématiquement les photos : supprime EXIF/GPS/payloads,
 * normalise l'orientation et borne les dimensions.
 */
export async function processPhoto(buffer: Buffer): Promise<ProcessedPhoto> {
  const original = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()

  const thumbnail = await sharp(original)
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer()

  return { original, thumbnail, mime: "image/jpeg" }
}

export function maxUploadBytes(env: Env): number {
  return env.MAX_UPLOAD_MB * 1024 * 1024
}
