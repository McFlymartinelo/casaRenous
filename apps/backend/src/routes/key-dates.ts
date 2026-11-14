import { Router } from "express"
import { eq } from "drizzle-orm"
import {
  IdParam,
  KeyDateCreateInput,
  KeyDateUpdateInput,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { keyDates } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams } from "../lib/http.js"
import { toKeyDate } from "../lib/serializers.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

function slugify(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return base || "date"
}

export function keyDatesRouter(db: Database, env: Env): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/key-dates",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const rows = await db.select().from(keyDates).orderBy(keyDates.date)
      res.json(rows.map(toKeyDate))
    }),
  )

  router.post(
    "/key-dates",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = parseBody(KeyDateCreateInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      let slug = slugify(input.label)
      const [collision] = await db
        .select({ id: keyDates.id })
        .from(keyDates)
        .where(eq(keyDates.slug, slug))
        .limit(1)
      if (collision) slug = `${slug}-${Date.now().toString(36)}`

      const [created] = await db
        .insert(keyDates)
        .values({
          slug,
          label: input.label,
          date: input.date,
          kind: input.kind,
          note: input.note ?? null,
          isProvisional: input.isProvisional,
          completedOn: input.completedOn ?? null,
          isSystem: false,
          updatedBy: user.id,
        })
        .returning()

      if (!created) throw ApiError.internal("Création impossible", "key_date_create_failed")
      await writeAudit(db, {
        actorId: user.id,
        action: "key_date.created",
        entity: "key_date",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.status(201).json(toKeyDate(created))
    }),
  )

  router.patch(
    "/key-dates/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(KeyDateUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      const [existing] = await db.select().from(keyDates).where(eq(keyDates.id, id)).limit(1)
      if (!existing) throw ApiError.notFound("Date clé introuvable", "key_date_not_found")

      const [updated] = await db
        .update(keyDates)
        .set({
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.isProvisional !== undefined
            ? { isProvisional: input.isProvisional }
            : {}),
          ...(input.completedOn !== undefined ? { completedOn: input.completedOn } : {}),
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(keyDates.id, id))
        .returning()

      if (!updated) throw ApiError.notFound("Date clé introuvable", "key_date_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "key_date.updated",
        entity: "key_date",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { fields: Object.keys(input) },
      })
      res.json(toKeyDate(updated))
    }),
  )

  router.delete(
    "/key-dates/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db.select().from(keyDates).where(eq(keyDates.id, id)).limit(1)
      if (!existing) throw ApiError.notFound("Date clé introuvable", "key_date_not_found")
      if (existing.isSystem) {
        throw ApiError.forbidden(
          "Une date système ne peut pas être supprimée, seulement modifiée",
          "key_date_system",
        )
      }
      await db.delete(keyDates).where(eq(keyDates.id, id))
      await writeAudit(db, {
        actorId: user.id,
        action: "key_date.deleted",
        entity: "key_date",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  return router
}
