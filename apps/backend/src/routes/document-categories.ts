import { Router } from "express"
import { asc, eq, isNull, sql, and } from "drizzle-orm"
import {
  DocumentCategoryCreateInput,
  DocumentCategoryUpdateInput,
  IdParam,
  type DocumentCategoryItem,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { documentCategories, documents } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams } from "../lib/http.js"
import { toDocumentCategory } from "../lib/serializers.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim()
}

async function findByName(db: Database, name: string, excludeId?: string) {
  const [row] = await db
    .select({ id: documentCategories.id })
    .from(documentCategories)
    .where(
      and(
        sql`lower(${documentCategories.name}) = lower(${name})`,
        excludeId ? sql`${documentCategories.id} <> ${excludeId}` : undefined,
      ),
    )
    .limit(1)
  return row ?? null
}

async function countDocuments(db: Database, categoryId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(documents)
    .where(
      and(eq(documents.customCategoryId, categoryId), isNull(documents.deletedAt)),
    )
  return row?.count ?? 0
}

/**
 * Catégories personnalisées du coffre-fort. Les huit catégories historiques
 * restent des valeurs d'enum côté documents ; celles-ci s'ajoutent par-dessus
 * et peuvent être renommées ou supprimées sans toucher aux fichiers.
 */
export function documentCategoriesRouter(db: Database, env: Env): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/document-categories",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({
          id: documentCategories.id,
          name: documentCategories.name,
          createdAt: documentCategories.createdAt,
          updatedAt: documentCategories.updatedAt,
          documentCount: sql<number>`count(${documents.id})`.mapWith(Number),
        })
        .from(documentCategories)
        .leftJoin(
          documents,
          and(
            eq(documents.customCategoryId, documentCategories.id),
            isNull(documents.deletedAt),
          ),
        )
        .groupBy(documentCategories.id)
        .orderBy(asc(documentCategories.name))

      const items: DocumentCategoryItem[] = rows.map((row) =>
        toDocumentCategory(row, row.documentCount),
      )
      res.json({ items })
    }),
  )

  router.post(
    "/document-categories",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = parseBody(DocumentCategoryCreateInput, req.body)
      const name = normalizeName(input.name)
      const { user } = res.locals.auth as AuthLocals

      if (await findByName(db, name)) {
        throw ApiError.conflict("Cette catégorie existe déjà", "category_exists")
      }

      const [created] = await db
        .insert(documentCategories)
        .values({ name })
        .returning()
      if (!created) throw ApiError.internal("Création impossible", "category_failed")

      await writeAudit(db, {
        actorId: user.id,
        action: "document_category.created",
        entity: "document_category",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { name: created.name },
      })
      res.status(201).json(toDocumentCategory(created, 0))
    }),
  )

  router.patch(
    "/document-categories/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(DocumentCategoryUpdateInput, req.body)
      const name = normalizeName(input.name)
      const { user } = res.locals.auth as AuthLocals

      if (await findByName(db, name, id)) {
        throw ApiError.conflict("Une autre catégorie porte déjà ce nom", "category_exists")
      }

      const [updated] = await db
        .update(documentCategories)
        .set({ name, updatedAt: new Date() })
        .where(eq(documentCategories.id, id))
        .returning()
      if (!updated) throw ApiError.notFound("Catégorie introuvable", "category_not_found")

      await writeAudit(db, {
        actorId: user.id,
        action: "document_category.updated",
        entity: "document_category",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { name: updated.name },
      })
      res.json(toDocumentCategory(updated, await countDocuments(db, id)))
    }),
  )

  router.delete(
    "/document-categories/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals

      const [deleted] = await db
        .delete(documentCategories)
        .where(eq(documentCategories.id, id))
        .returning({ id: documentCategories.id, name: documentCategories.name })
      if (!deleted) throw ApiError.notFound("Catégorie introuvable", "category_not_found")

      await writeAudit(db, {
        actorId: user.id,
        action: "document_category.deleted",
        entity: "document_category",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { name: deleted.name },
      })
      res.json({ ok: true })
    }),
  )

  return router
}
