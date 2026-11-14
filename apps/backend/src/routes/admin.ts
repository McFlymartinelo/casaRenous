import { Router } from "express"
import { desc, lt } from "drizzle-orm"
import {
  AdminAuditQuery,
  IdParam,
  InvitationCreateInput,
  type AuditEntry,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { auditLog } from "../db/schema.js"
import type { Mailer } from "../lib/mailer.js"
import { asyncHandler, parseBody, parseParams, parseQuery } from "../lib/http.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "../services/invitations.js"

export function adminRouter(db: Database, env: Env, mailer: Mailer): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/admin/audit",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = parseQuery(AdminAuditQuery, req.query)
      const rows = await db
        .select()
        .from(auditLog)
        .where(query.before ? lt(auditLog.id, query.before) : undefined)
        .orderBy(desc(auditLog.id))
        .limit(query.limit)
      const items: AuditEntry[] = rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        ip: row.ip,
        userAgent: row.userAgent,
        meta: row.meta ?? null,
        createdAt: row.createdAt.toISOString(),
      }))
      res.json({ items, nextCursor: items.at(-1)?.id ?? null })
    }),
  )

  router.get(
    "/admin/invitations",
    auth,
    requireRole("admin"),
    asyncHandler(async (_req, res) => {
      res.json(await listInvitations(db))
    }),
  )

  router.post(
    "/admin/invitations",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = parseBody(InvitationCreateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const result = await createInvitation(db, mailer, input, user.id)
      res.status(201).json(result)
    }),
  )

  router.delete(
    "/admin/invitations/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      await revokeInvitation(db, id, user.id)
      res.json({ ok: true })
    }),
  )

  return router
}
