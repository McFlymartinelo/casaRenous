import { Router } from "express"
import { and, desc, eq, isNull, type SQL } from "drizzle-orm"
import {
  IdParam,
  ReserveCreateInput,
  ReserveQuery,
  ReserveUpdateInput,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { reserves, users } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams, parseQuery } from "../lib/http.js"
import { cursorCondition, decodeCursor, encodeCursor } from "../lib/pagination.js"
import { toReserve } from "../lib/serializers.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function reservesRouter(db: Database, env: Env): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/reserves",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const query = parseQuery(ReserveQuery, req.query)
      const conditions: SQL[] = [isNull(reserves.deletedAt)]
      if (query.status) conditions.push(eq(reserves.status, query.status))
      if (query.severity) conditions.push(eq(reserves.severity, query.severity))
      if (query.roomId) conditions.push(eq(reserves.roomId, query.roomId))
      const cursor = decodeCursor(query.cursor)
      if (cursor) {
        const condition = cursorCondition(reserves.createdAt, reserves.id, cursor)
        if (condition) conditions.push(condition)
      }

      const rows = await db
        .select()
        .from(reserves)
        .where(and(...conditions))
        .orderBy(desc(reserves.createdAt), desc(reserves.id))
        .limit(query.limit + 1)
      const hasMore = rows.length > query.limit
      const items = rows.slice(0, query.limit)
      const last = items.at(-1)
      res.json({
        items: items.map(toReserve),
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      })
    }),
  )

  router.post(
    "/reserves",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const input = parseBody(ReserveCreateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(reserves)
        .where(eq(reserves.clientId, input.clientId))
        .limit(1)
      if (existing) {
        res.status(200).json(toReserve(existing))
        return
      }

      const [created] = await db
        .insert(reserves)
        .values({
          title: input.title,
          description: input.description ?? null,
          roomId: input.roomId ?? null,
          location: input.location ?? null,
          severity: input.severity,
          status: input.status,
          dueDate: input.dueDate ?? null,
          photoId: input.photoId ?? null,
          createdBy: user.id,
          clientId: input.clientId,
        })
        .returning()
      if (!created) throw ApiError.internal("Enregistrement impossible", "reserve_failed")

      await writeAudit(db, {
        actorId: user.id,
        action: "reserve.created",
        entity: "reserve",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.status(201).json(toReserve(created))
    }),
  )

  router.patch(
    "/reserves/:id",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(ReserveUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(reserves)
        .where(and(eq(reserves.id, id), isNull(reserves.deletedAt)))
        .limit(1)
      if (!existing) throw ApiError.notFound("Réserve introuvable", "reserve_not_found")

      if (user.role !== "admin") {
        const allowed = new Set(["status", "resolvedAt"])
        const forbidden = Object.keys(input).filter((key) => !allowed.has(key))
        if (forbidden.length) {
          throw ApiError.forbidden(
            "Un invité peut seulement faire évoluer le statut d'une réserve",
            "reserve_forbidden",
          )
        }
      }

      const resolvedAt =
        input.resolvedAt !== undefined
          ? input.resolvedAt
          : input.status === "resolved" || input.status === "accepted"
            ? new Date().toISOString()
            : input.status === "open" || input.status === "in_progress"
              ? null
              : undefined

      const [updated] = await db
        .update(reserves)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.severity !== undefined ? { severity: input.severity } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
          ...(resolvedAt !== undefined
            ? { resolvedAt: resolvedAt === null ? null : new Date(resolvedAt) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(reserves.id, id))
        .returning()
      if (!updated) throw ApiError.notFound("Réserve introuvable", "reserve_not_found")

      await writeAudit(db, {
        actorId: user.id,
        action: "reserve.updated",
        entity: "reserve",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { fields: Object.keys(input) },
      })
      res.json(toReserve(updated))
    }),
  )

  router.delete(
    "/reserves/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [updated] = await db
        .update(reserves)
        .set({ deletedAt: new Date() })
        .where(and(eq(reserves.id, id), isNull(reserves.deletedAt)))
        .returning({ id: reserves.id })
      if (!updated) throw ApiError.notFound("Réserve introuvable", "reserve_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "reserve.deleted",
        entity: "reserve",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  router.get(
    "/reserves/export.csv",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({ reserve: reserves, author: users.displayName })
        .from(reserves)
        .leftJoin(users, eq(reserves.createdBy, users.id))
        .where(isNull(reserves.deletedAt))
        .orderBy(desc(reserves.createdAt))

      const header = [
        "Titre",
        "Sévérité",
        "Statut",
        "Emplacement",
        "Échéance",
        "Créée par",
        "Créée le",
        "Résolue le",
        "Description",
      ]
      const lines = [header.map(csvCell).join(";")]
      for (const row of rows) {
        lines.push(
          [
            row.reserve.title,
            row.reserve.severity,
            row.reserve.status,
            row.reserve.location,
            row.reserve.dueDate,
            row.author,
            row.reserve.createdAt.toISOString().slice(0, 10),
            row.reserve.resolvedAt?.toISOString().slice(0, 10),
            row.reserve.description,
          ]
            .map(csvCell)
            .join(";"),
        )
      }
      const body = `\ufeff${lines.join("\r\n")}\r\n`
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", 'attachment; filename="casarenous-reserves.csv"')
      res.setHeader("Cache-Control", "private, no-store")
      res.send(body)
    }),
  )

  return router
}
