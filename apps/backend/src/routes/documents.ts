import { Router } from "express"
import { and, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm"
import {
  AnalysisCorrectionInput,
  DocumentQuery,
  DocumentUpdateInput,
  DocumentUploadFields,
  IdParam,
  ReservedWorksUpdateInput,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { documentAnalyses, documentCategories, documents } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams, parseQuery } from "../lib/http.js"
import { createUpload } from "../lib/multer.js"
import { cursorCondition, decodeCursor, encodeCursor } from "../lib/pagination.js"
import { toDocument, toDocumentAnalysis } from "../lib/serializers.js"
import { requestDocumentAnalysis, saveReservedWorks } from "../services/invoice-analysis.js"
import { qualityFromExtraction, summarizeQuality } from "../services/analysis-quality.js"
import {
  assertMagic,
  DOCUMENT_MIMES,
  encryptionKey,
  newStorageKey,
  readEncrypted,
  removeStored,
  safeOriginalName,
  sha256Buffer,
  writeEncrypted,
} from "../lib/uploads.js"
import type { RateLimiters } from "../middleware/rate-limit.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

async function categoryName(
  db: Database,
  customCategoryId: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!customCategoryId) return null
  const [row] = await db
    .select({ id: documentCategories.id, name: documentCategories.name })
    .from(documentCategories)
    .where(eq(documentCategories.id, customCategoryId))
    .limit(1)
  return row ?? null
}

export function documentsRouter(
  db: Database,
  env: Env,
  limiters: RateLimiters,
): Router {
  const router = Router()
  const auth = requireAuth(db, env)
  const upload = createUpload(env)
  const key = encryptionKey(env)

  router.get(
    "/documents",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const query = parseQuery(DocumentQuery, req.query)
      const conditions: SQL[] = [isNull(documents.deletedAt)]
      if (query.category) conditions.push(eq(documents.category, query.category))
      if (query.customCategoryId) {
        conditions.push(eq(documents.customCategoryId, query.customCategoryId))
      }
      if (query.roomId) conditions.push(eq(documents.roomId, query.roomId))
      if (query.q) {
        conditions.push(
          or(
            ilike(documents.title, `%${query.q}%`),
            ilike(documents.originalName, `%${query.q}%`),
          ) as SQL,
        )
      }
      const cursor = decodeCursor(query.cursor)
      if (cursor) {
        const condition = cursorCondition(documents.createdAt, documents.id, cursor)
        if (condition) conditions.push(condition)
      }

      const rows = await db
        .select({ document: documents, categoryName: documentCategories.name })
        .from(documents)
        .leftJoin(documentCategories, eq(documents.customCategoryId, documentCategories.id))
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(query.limit + 1)

      const hasMore = rows.length > query.limit
      const items = rows.slice(0, query.limit)
      const last = items.at(-1)?.document
      res.json({
        items: items.map((row) => toDocument(row.document, row.categoryName ?? null)),
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      })
    }),
  )

  router.post(
    "/documents",
    auth,
    requireRole("admin"),
    limiters.upload,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const { user } = res.locals.auth as AuthLocals
      if (!req.file) {
        throw ApiError.unprocessable("Fichier manquant", { file: ["Fichier requis"] })
      }
      const raw = req.body as Record<string, unknown>
      const fields = parseBody(DocumentUploadFields, {
        ...raw,
        roomId: raw.roomId === "" ? null : raw.roomId,
        milestoneId: raw.milestoneId === "" ? null : raw.milestoneId,
      })

      const detected = assertMagic(req.file.buffer, DOCUMENT_MIMES)
      const originalName = safeOriginalName(req.file.originalname)
      const customCategory = await categoryName(db, fields.customCategoryId)
      if (fields.customCategoryId && !customCategory) {
        throw ApiError.unprocessable("Catégorie inconnue", {
          customCategoryId: ["Catégorie introuvable"],
        })
      }
      const storageKey = newStorageKey("documents", detected.extension)
      const encrypted = await writeEncrypted(env.UPLOAD_DIR, storageKey, req.file.buffer, key)

      try {
        const [created] = await db
          .insert(documents)
          .values({
            title: fields.title,
            category: fields.category,
            customCategoryId: customCategory?.id ?? null,
            mime: detected.mime,
            sizeBytes: req.file.buffer.length,
            originalName,
            storageKey,
            sha256: sha256Buffer(req.file.buffer),
            encIv: encrypted.iv,
            encTag: encrypted.tag,
            magicVerified: true,
            uploadedBy: user.id,
            roomId: fields.roomId ?? null,
            milestoneId: fields.milestoneId ?? null,
            notes: fields.notes ?? null,
          })
          .returning()
        if (!created) throw ApiError.internal("Enregistrement impossible", "document_failed")

        await writeAudit(db, {
          actorId: user.id,
          action: "document.uploaded",
          entity: "document",
          entityId: created.id,
          ip: req.ip ?? null,
          userAgent: req.header("user-agent") ?? null,
          meta: { category: created.category, size: created.sizeBytes, mime: created.mime },
        })
        res.status(201).json(toDocument(created, customCategory?.name ?? null))
      } catch (error) {
        await removeStored(env.UPLOAD_DIR, storageKey)
        throw error
      }
    }),
  )

  router.patch(
    "/documents/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(DocumentUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      let customCategory: { id: string; name: string } | null = null
      if (input.customCategoryId !== undefined) {
        customCategory = await categoryName(db, input.customCategoryId)
        if (input.customCategoryId && !customCategory) {
          throw ApiError.unprocessable("Catégorie inconnue", {
            customCategoryId: ["Catégorie introuvable"],
          })
        }
      }

      const [updated] = await db
        .update(documents)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.customCategoryId !== undefined
            ? { customCategoryId: customCategory?.id ?? null }
            : {}),
          ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
          ...(input.milestoneId !== undefined ? { milestoneId: input.milestoneId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .returning()
      if (!updated) throw ApiError.notFound("Document introuvable", "document_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "document.updated",
        entity: "document",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json(toDocument(updated, customCategory?.name ?? null))
    }),
  )

  router.delete(
    "/documents/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [updated] = await db
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .returning({ id: documents.id })
      if (!updated) throw ApiError.notFound("Document introuvable", "document_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "document.deleted",
        entity: "document",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  router.post(
    "/documents/:id/analyze",
    auth,
    requireRole("admin", "invites"),
    limiters.analysis,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const { analysis } = await requestDocumentAnalysis(db, env, id)

      await writeAudit(db, {
        actorId: user.id,
        action: "document.analyzed",
        entity: "document",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: {
          status: analysis.status,
          engine: analysis.engine,
          textLength: analysis.textLength,
        },
      })

      res.json(analysis)
    }),
  )

  router.post(
    "/documents/:id/analysis/reserved-works",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(ReservedWorksUpdateInput, req.body)
      const analysis = await saveReservedWorks(db, id, input.items)
      res.json(analysis)
    }),
  )

  router.get(
    "/documents/:id/analysis",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const [row] = await db
        .select()
        .from(documentAnalyses)
        .where(eq(documentAnalyses.documentId, id))
        .limit(1)
      if (!row) {
        throw ApiError.notFound("Aucune analyse pour ce document", "analysis_not_found")
      }
      res.json(toDocumentAnalysis(row))
    }),
  )

  router.get(
    "/documents/analysis-quality",
    auth,
    requireRole("admin"),
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({
          status: documentAnalyses.status,
          analyzedAt: documentAnalyses.analyzedAt,
          documentId: documentAnalyses.documentId,
          quality: documentAnalyses.quality,
          extraction: documentAnalyses.extraction,
          title: documents.title,
        })
        .from(documentAnalyses)
        .innerJoin(documents, eq(documentAnalyses.documentId, documents.id))
        .where(isNull(documents.deletedAt))
      res.json(summarizeQuality(rows))
    }),
  )

  router.post(
    "/documents/:id/analysis/correction",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(AnalysisCorrectionInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      const [row] = await db
        .select()
        .from(documentAnalyses)
        .where(eq(documentAnalyses.documentId, id))
        .limit(1)
      if (!row) throw ApiError.notFound("Analyse introuvable", "analysis_not_found")

      const quality = {
        ...qualityFromExtraction(row.extraction),
        corrected: true,
        correctedAmountCents: input.amountCents,
      }
      await db
        .update(documentAnalyses)
        .set({ quality })
        .where(eq(documentAnalyses.documentId, id))

      await writeAudit(db, {
        actorId: user.id,
        action: "document.analysis_corrected",
        entity: "document",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { amountCents: input.amountCents },
      })
      res.json({ ok: true })
    }),
  )

  router.get(
    "/documents/:id/file",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [row] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .limit(1)
      if (!row) throw ApiError.notFound("Document introuvable", "document_not_found")

      const buffer = await readEncrypted(
        env.UPLOAD_DIR,
        row.storageKey,
        key,
        row.encIv,
        row.encTag,
      )

      await writeAudit(db, {
        actorId: user.id,
        action: "document.downloaded",
        entity: "document",
        entityId: row.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })

      const fallback = row.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_")
      res.setHeader("Content-Type", row.mime)
      res.setHeader("Content-Length", String(buffer.length))
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      )
      res.setHeader("X-Content-Type-Options", "nosniff")
      res.setHeader("Content-Security-Policy", "sandbox")
      res.setHeader("Cache-Control", "private, no-store")
      res.send(buffer)
    }),
  )

  return router
}
