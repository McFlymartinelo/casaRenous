import { Router } from "express"
import { and, eq, gte, isNull, lte, type SQL } from "drizzle-orm"
import {
  CalendarFeedQuery,
  IdParam,
  MilestoneCreateInput,
  MilestoneQuery,
  MilestoneUpdateInput,
  SESSION_COOKIE,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { calendarTokens, milestones } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { cookieName, readCookie } from "../lib/cookies.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams, parseQuery } from "../lib/http.js"
import { buildCalendar } from "../lib/ics.js"
import { toMilestone } from "../lib/serializers.js"
import { randomToken, sha256 } from "../lib/tokens.js"
import type { RateLimiters } from "../middleware/rate-limit.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"
import { resolveSession } from "../services/auth.js"

function slugify(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return base || "jalon"
}

export function milestonesRouter(
  db: Database,
  env: Env,
  limiters: RateLimiters,
): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/milestones",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const query = parseQuery(MilestoneQuery, req.query)
      const conditions: SQL[] = []
      if (query.from) conditions.push(gte(milestones.plannedEnd, query.from))
      if (query.to) conditions.push(lte(milestones.plannedStart, query.to))
      if (query.category) conditions.push(eq(milestones.category, query.category))
      if (query.status) conditions.push(eq(milestones.status, query.status))

      const rows = await db
        .select()
        .from(milestones)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(milestones.plannedStart, milestones.title)
      res.json(rows.map(toMilestone))
    }),
  )

  router.post(
    "/milestones",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = parseBody(MilestoneCreateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      let slug = slugify(input.title)
      const [collision] = await db
        .select({ id: milestones.id })
        .from(milestones)
        .where(eq(milestones.slug, slug))
        .limit(1)
      if (collision) slug = `${slug}-${Date.now().toString(36)}`

      const [created] = await db
        .insert(milestones)
        .values({
          slug,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          status: input.status,
          plannedStart: input.plannedStart,
          plannedEnd: input.plannedEnd,
          actualDate: input.actualDate ?? null,
          isKey: input.isKey,
          notifyDays: input.notifyDays,
          createdBy: user.id,
        })
        .returning()
      if (!created) throw ApiError.internal("Création impossible", "milestone_create_failed")

      await writeAudit(db, {
        actorId: user.id,
        action: "milestone.created",
        entity: "milestone",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.status(201).json(toMilestone(created))
    }),
  )

  router.patch(
    "/milestones/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(MilestoneUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals

      const [existing] = await db
        .select()
        .from(milestones)
        .where(eq(milestones.id, id))
        .limit(1)
      if (!existing) throw ApiError.notFound("Jalon introuvable", "milestone_not_found")

      const nextStart = input.plannedStart ?? existing.plannedStart
      const nextEnd = input.plannedEnd ?? existing.plannedEnd
      if (nextEnd < nextStart) {
        throw ApiError.unprocessable("La fin doit être postérieure ou égale au début", {
          plannedEnd: ["Date de fin antérieure au début"],
        })
      }

      const [updated] = await db
        .update(milestones)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.plannedStart !== undefined ? { plannedStart: input.plannedStart } : {}),
          ...(input.plannedEnd !== undefined ? { plannedEnd: input.plannedEnd } : {}),
          ...(input.actualDate !== undefined ? { actualDate: input.actualDate } : {}),
          ...(input.isKey !== undefined ? { isKey: input.isKey } : {}),
          ...(input.notifyDays !== undefined ? { notifyDays: input.notifyDays } : {}),
          updatedAt: new Date(),
        })
        .where(eq(milestones.id, id))
        .returning()
      if (!updated) throw ApiError.notFound("Jalon introuvable", "milestone_not_found")

      await writeAudit(db, {
        actorId: user.id,
        action: "milestone.updated",
        entity: "milestone",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { fields: Object.keys(input) },
      })
      res.json(toMilestone(updated))
    }),
  )

  router.delete(
    "/milestones/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const deleted = await db
        .delete(milestones)
        .where(eq(milestones.id, id))
        .returning({ id: milestones.id })
      if (!deleted.length) throw ApiError.notFound("Jalon introuvable", "milestone_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "milestone.deleted",
        entity: "milestone",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  /* ── Flux ICS ─────────────────────────────────────────────────────────── */

  router.get(
    "/milestones/calendar.ics",
    limiters.calendar,
    asyncHandler(async (req, res) => {
      const query = parseQuery(CalendarFeedQuery, req.query)
      let userId: string | null = null

      if (query.token) {
        const [row] = await db
          .select()
          .from(calendarTokens)
          .where(eq(calendarTokens.tokenHash, sha256(query.token)))
          .limit(1)
        if (!row || row.revokedAt) {
          throw ApiError.unauthorized("Lien de calendrier invalide", "calendar_token_invalid")
        }
        userId = row.userId
        await db
          .update(calendarTokens)
          .set({ lastUsedAt: new Date() })
          .where(eq(calendarTokens.id, row.id))
      } else {
        const sessionToken = readCookie(
          req.header("cookie"),
          cookieName(SESSION_COOKIE, env.NODE_ENV === "production"),
        )
        if (sessionToken) {
          const session = await resolveSession(db, env, sessionToken)
          if (session) userId = session.user.id
        }
      }

      if (!userId) {
        throw ApiError.unauthorized("Jeton de calendrier ou session requis", "calendar_auth")
      }

      const rows = await db
        .select()
        .from(milestones)
        .orderBy(milestones.plannedStart, milestones.title)
      const body = buildCalendar(rows.map(toMilestone))
      res.setHeader("Content-Type", "text/calendar; charset=utf-8")
      res.setHeader("Content-Disposition", 'inline; filename="casarenous.ics"')
      res.setHeader("Cache-Control", "private, no-store")
      res.send(body)
    }),
  )

  router.get(
    "/calendar/token",
    auth,
    asyncHandler(async (_req, res) => {
      const { user } = res.locals.auth as AuthLocals
      const [row] = await db
        .select()
        .from(calendarTokens)
        .where(and(eq(calendarTokens.userId, user.id), isNull(calendarTokens.revokedAt)))
        .orderBy(calendarTokens.createdAt)
        .limit(1)
      res.json({
        exists: Boolean(row),
        createdAt: row ? row.createdAt.toISOString() : null,
        lastUsedAt: row?.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      })
    }),
  )

  router.post(
    "/calendar/token",
    auth,
    asyncHandler(async (req, res) => {
      const { user } = res.locals.auth as AuthLocals
      await db
        .update(calendarTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(calendarTokens.userId, user.id), isNull(calendarTokens.revokedAt)))

      const token = randomToken(32)
      const [created] = await db
        .insert(calendarTokens)
        .values({ userId: user.id, tokenHash: sha256(token) })
        .returning()
      if (!created) throw ApiError.internal("Création du jeton impossible", "calendar_token_failed")

      await writeAudit(db, {
        actorId: user.id,
        action: "calendar.token.rotated",
        entity: "calendar_token",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })

      res.status(201).json({
        url: `${env.APP_ORIGIN}/api/milestones/calendar.ics?token=${encodeURIComponent(token)}`,
        createdAt: created.createdAt.toISOString(),
      })
    }),
  )

  router.delete(
    "/calendar/token",
    auth,
    asyncHandler(async (req, res) => {
      const { user } = res.locals.auth as AuthLocals
      await db
        .update(calendarTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(calendarTokens.userId, user.id), isNull(calendarTokens.revokedAt)))
      await writeAudit(db, {
        actorId: user.id,
        action: "calendar.token.revoked",
        entity: "calendar_token",
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  return router
}
