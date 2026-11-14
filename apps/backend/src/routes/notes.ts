import { Router } from "express"
import { and, desc, eq, isNull } from "drizzle-orm"
import {
  IdParam,
  NoteCreateInput,
  NoteUpdateInput,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { siteNotes } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams } from "../lib/http.js"
import { toNote } from "../lib/serializers.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

export function notesRouter(db: Database, env: Env): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/notes",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select()
        .from(siteNotes)
        .where(isNull(siteNotes.deletedAt))
        .orderBy(desc(siteNotes.takenAt))
        .limit(300)
      res.json(rows.map(toNote))
    }),
  )

  router.post(
    "/notes",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const input = parseBody(NoteCreateInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      const [existing] = await db
        .select()
        .from(siteNotes)
        .where(eq(siteNotes.clientId, input.clientId))
        .limit(1)
      if (existing) {
        res.status(200).json(toNote(existing))
        return
      }

      const [created] = await db
        .insert(siteNotes)
        .values({
          body: input.body,
          takenAt: new Date(input.takenAt),
          authorId: user.id,
          roomId: input.roomId ?? null,
          clientId: input.clientId,
        })
        .returning()
      if (!created) throw ApiError.internal("Enregistrement impossible", "note_failed")

      await writeAudit(db, {
        actorId: user.id,
        action: "note.created",
        entity: "note",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.status(201).json(toNote(created))
    }),
  )

  router.patch(
    "/notes/:id",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(NoteUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(siteNotes)
        .where(and(eq(siteNotes.id, id), isNull(siteNotes.deletedAt)))
        .limit(1)
      if (!existing) throw ApiError.notFound("Note introuvable", "note_not_found")
      if (user.role !== "admin" && existing.authorId !== user.id) {
        throw ApiError.forbidden("Seul l'auteur peut modifier sa note", "note_forbidden")
      }
      const [updated] = await db
        .update(siteNotes)
        .set({
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(siteNotes.id, id))
        .returning()
      if (!updated) throw ApiError.notFound("Note introuvable", "note_not_found")
      res.json(toNote(updated))
    }),
  )

  router.delete(
    "/notes/:id",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(siteNotes)
        .where(and(eq(siteNotes.id, id), isNull(siteNotes.deletedAt)))
        .limit(1)
      if (!existing) throw ApiError.notFound("Note introuvable", "note_not_found")
      if (user.role !== "admin" && existing.authorId !== user.id) {
        throw ApiError.forbidden("Seul l'auteur peut supprimer sa note", "note_forbidden")
      }
      await db
        .update(siteNotes)
        .set({ deletedAt: new Date() })
        .where(eq(siteNotes.id, id))
      res.json({ ok: true })
    }),
  )

  return router
}
