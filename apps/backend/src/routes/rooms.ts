import { Router } from "express"
import { eq } from "drizzle-orm"
import { IdParam, RoomUpdateInput, type Env } from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { projectProfile, rooms } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams } from "../lib/http.js"
import { toProjectProfile, toRoom } from "../lib/serializers.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

export function roomsRouter(db: Database, env: Env): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/project",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const [row] = await db.select().from(projectProfile).where(eq(projectProfile.id, 1))
      if (!row) {
        throw ApiError.notFound("Profil projet non initialisé", "project_missing")
      }
      res.json(toProjectProfile(row))
    }),
  )

  router.get(
    "/rooms",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const rows = await db.select().from(rooms).orderBy(rooms.sortOrder, rooms.name)
      res.json(rows.map(toRoom))
    }),
  )

  router.get(
    "/rooms/:slug",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const slug = String(req.params.slug ?? "")
      const [row] = await db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1)
      if (!row) throw ApiError.notFound("Pièce introuvable", "room_not_found")
      res.json(toRoom(row))
    }),
  )

  router.patch(
    "/rooms/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(RoomUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      const [existing] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1)
      if (!existing) throw ApiError.notFound("Pièce introuvable", "room_not_found")

      const [updated] = await db
        .update(rooms)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.areaM2 !== undefined
            ? { areaM2: input.areaM2 === null ? null : input.areaM2.toFixed(2) }
            : {}),
          ...(input.ceilingHeightM !== undefined
            ? {
                ceilingHeightM:
                  input.ceilingHeightM === null ? null : input.ceilingHeightM.toFixed(2),
              }
            : {}),
          ...(input.dimensions !== undefined ? { dimensions: input.dimensions } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.features !== undefined ? { features: input.features } : {}),
          ...(input.specs !== undefined ? { specs: input.specs } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        })
        .where(eq(rooms.id, id))
        .returning()

      if (!updated) throw ApiError.notFound("Pièce introuvable", "room_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "room.updated",
        entity: "room",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { fields: Object.keys(input) },
      })
      res.json(toRoom(updated))
    }),
  )

  return router
}
