import { Router } from "express"
import { and, desc, eq, gte, isNull, lte, type SQL } from "drizzle-orm"
import {
  IdParam,
  PhotoQuery,
  PhotoUpdateInput,
  PhotoUploadFields,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { sitePhotos } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams, parseQuery } from "../lib/http.js"
import { createUpload } from "../lib/multer.js"
import { cursorCondition, decodeCursor, encodeCursor } from "../lib/pagination.js"
import { toPhoto } from "../lib/serializers.js"
import {
  assertMagic,
  encryptionKey,
  newStorageKey,
  PHOTO_MIMES,
  processPhoto,
  readEncrypted,
  removeStored,
  sha256Buffer,
  writeEncrypted,
} from "../lib/uploads.js"
import type { RateLimiters } from "../middleware/rate-limit.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

export function photosRouter(db: Database, env: Env, limiters: RateLimiters): Router {
  const router = Router()
  const auth = requireAuth(db, env)
  const upload = createUpload(env)
  const key = encryptionKey(env)

  router.get(
    "/photos",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const query = parseQuery(PhotoQuery, req.query)
      const conditions: SQL[] = [isNull(sitePhotos.deletedAt)]
      if (query.from) {
        conditions.push(gte(sitePhotos.takenAt, new Date(`${query.from}T00:00:00.000Z`)))
      }
      if (query.to) {
        conditions.push(lte(sitePhotos.takenAt, new Date(`${query.to}T23:59:59.999Z`)))
      }
      if (query.roomId) conditions.push(eq(sitePhotos.roomId, query.roomId))
      const cursor = decodeCursor(query.cursor)
      if (cursor) {
        const condition = cursorCondition(sitePhotos.takenAt, sitePhotos.id, cursor)
        if (condition) conditions.push(condition)
      }

      const rows = await db
        .select()
        .from(sitePhotos)
        .where(and(...conditions))
        .orderBy(desc(sitePhotos.takenAt), desc(sitePhotos.id))
        .limit(query.limit + 1)
      const hasMore = rows.length > query.limit
      const items = rows.slice(0, query.limit)
      const last = items.at(-1)
      res.json({
        items: items.map(toPhoto),
        nextCursor: hasMore && last ? encodeCursor(last.takenAt, last.id) : null,
      })
    }),
  )

  router.post(
    "/photos",
    auth,
    requireRole("admin", "invites"),
    limiters.upload,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const { user } = res.locals.auth as AuthLocals
      if (!req.file) {
        throw ApiError.unprocessable("Photo manquante", { file: ["Fichier requis"] })
      }
      const raw = req.body as Record<string, unknown>
      const cleaned: Record<string, unknown> = { ...raw }
      for (const keyName of ["lat", "lng", "accuracyM", "roomId", "caption"]) {
        if (cleaned[keyName] === "") delete cleaned[keyName]
      }
      if (cleaned.roomId === undefined) cleaned.roomId = null
      const fields = parseBody(PhotoUploadFields, cleaned)

      const [existing] = await db
        .select()
        .from(sitePhotos)
        .where(eq(sitePhotos.clientId, fields.clientId))
        .limit(1)
      if (existing) {
        res.status(200).json(toPhoto(existing))
        return
      }

      assertMagic(req.file.buffer, PHOTO_MIMES)
      const processed = await processPhoto(req.file.buffer).catch(() => {
        throw ApiError.unsupportedMedia("Image illisible ou corrompue", "image_invalid")
      })

      const storageKey = newStorageKey("photos", "jpg")
      const thumbKey = newStorageKey("thumbs", "jpg")
      const encrypted = await writeEncrypted(
        env.UPLOAD_DIR,
        storageKey,
        processed.original,
        key,
      )
      const thumbEncrypted = await writeEncrypted(
        env.UPLOAD_DIR,
        thumbKey,
        processed.thumbnail,
        key,
      )

      try {
        const [created] = await db
          .insert(sitePhotos)
          .values({
            caption: fields.caption ?? null,
            takenAt: new Date(fields.takenAt),
            lat: fields.lat === undefined ? null : String(fields.lat),
            lng: fields.lng === undefined ? null : String(fields.lng),
            accuracyM: fields.accuracyM === undefined ? null : String(fields.accuracyM),
            storageKey,
            thumbKey,
            mime: processed.mime,
            sizeBytes: processed.original.length,
            sha256: sha256Buffer(processed.original),
            encIv: encrypted.iv,
            encTag: encrypted.tag,
            thumbEncIv: thumbEncrypted.iv,
            thumbEncTag: thumbEncrypted.tag,
            magicVerified: true,
            uploadedBy: user.id,
            roomId: fields.roomId ?? null,
            clientId: fields.clientId,
          })
          .returning()
        if (!created) throw ApiError.internal("Enregistrement impossible", "photo_failed")

        await writeAudit(db, {
          actorId: user.id,
          action: "photo.uploaded",
          entity: "photo",
          entityId: created.id,
          ip: req.ip ?? null,
          userAgent: req.header("user-agent") ?? null,
          meta: { size: created.sizeBytes, geolocated: Boolean(created.lat) },
        })
        res.status(201).json(toPhoto(created))
      } catch (error) {
        await removeStored(env.UPLOAD_DIR, storageKey)
        await removeStored(env.UPLOAD_DIR, thumbKey)
        throw error
      }
    }),
  )

  router.patch(
    "/photos/:id",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(PhotoUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(sitePhotos)
        .where(and(eq(sitePhotos.id, id), isNull(sitePhotos.deletedAt)))
        .limit(1)
      if (!existing) throw ApiError.notFound("Photo introuvable", "photo_not_found")
      if (user.role !== "admin" && existing.uploadedBy !== user.id) {
        throw ApiError.forbidden("Seul l'auteur peut modifier sa photo", "photo_forbidden")
      }

      const [updated] = await db
        .update(sitePhotos)
        .set({
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
          ...(input.lat !== undefined ? { lat: String(input.lat) } : {}),
          ...(input.lng !== undefined ? { lng: String(input.lng) } : {}),
        })
        .where(eq(sitePhotos.id, id))
        .returning()
      if (!updated) throw ApiError.notFound("Photo introuvable", "photo_not_found")
      res.json(toPhoto(updated))
    }),
  )

  router.delete(
    "/photos/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [updated] = await db
        .update(sitePhotos)
        .set({ deletedAt: new Date() })
        .where(and(eq(sitePhotos.id, id), isNull(sitePhotos.deletedAt)))
        .returning({ id: sitePhotos.id })
      if (!updated) throw ApiError.notFound("Photo introuvable", "photo_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "photo.deleted",
        entity: "photo",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  router.get(
    "/photos/:id/:variant(file|thumb)",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const variant = req.params.variant === "thumb" ? "thumb" : "file"
      const [row] = await db
        .select()
        .from(sitePhotos)
        .where(and(eq(sitePhotos.id, id), isNull(sitePhotos.deletedAt)))
        .limit(1)
      if (!row) throw ApiError.notFound("Photo introuvable", "photo_not_found")

      const isThumb = variant === "thumb"
      const storageKey = isThumb ? row.thumbKey : row.storageKey
      const iv = isThumb ? row.thumbEncIv : row.encIv
      const tag = isThumb ? row.thumbEncTag : row.encTag
      if (!storageKey || !iv || !tag) {
        throw ApiError.notFound("Variante indisponible", "photo_variant_missing")
      }

      const buffer = await readEncrypted(env.UPLOAD_DIR, storageKey, key, iv, tag)
      res.setHeader("Content-Type", "image/jpeg")
      res.setHeader("Content-Length", String(buffer.length))
      res.setHeader("Content-Disposition", "inline")
      res.setHeader("X-Content-Type-Options", "nosniff")
      res.setHeader("Content-Security-Policy", "sandbox")
      res.setHeader("Cache-Control", "private, no-store")
      res.send(buffer)
    }),
  )

  return router
}
