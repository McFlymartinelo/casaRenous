import { Router } from "express"
import { and, eq, isNull } from "drizzle-orm"
import {
  PushSubscribeInput,
  PushUnsubscribeInput,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { pushSubscriptions } from "../db/schema.js"
import { asyncHandler, parseBody } from "../lib/http.js"
import {
  assertPushEndpoint,
  pushConfigured,
  sendPush,
} from "../lib/push.js"
import type { RateLimiters } from "../middleware/rate-limit.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

export function pushRouter(db: Database, env: Env, limiters: RateLimiters): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/push/vapid",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      res.json({
        configured: pushConfigured(env),
        publicKey: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null,
      })
    }),
  )

  router.post(
    "/push/subscribe",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const input = parseBody(PushSubscribeInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      assertPushEndpoint(input.endpoint)

      await db
        .insert(pushSubscriptions)
        .values({
          userId: user.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: req.header("user-agent")?.slice(0, 500) ?? null,
          lastUsedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId: user.id,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            userAgent: req.header("user-agent")?.slice(0, 500) ?? null,
            failureCount: 0,
            disabledAt: null,
            lastUsedAt: new Date(),
          },
        })

      res.json({ ok: true })
    }),
  )

  router.post(
    "/push/unsubscribe",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const input = parseBody(PushUnsubscribeInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, input.endpoint),
            eq(pushSubscriptions.userId, user.id),
          ),
        )
      res.json({ ok: true })
    }),
  )

  router.post(
    "/push/test",
    auth,
    requireRole("admin", "invites"),
    limiters.pushTest,
    asyncHandler(async (req, res) => {
      if (!pushConfigured(env)) {
        res.json({ sent: 0, failed: 0, skipped: true, reason: "not_configured" })
        return
      }
      const { user } = res.locals.auth as AuthLocals
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            isNull(pushSubscriptions.disabledAt),
          ),
        )
      if (!subscriptions.length) {
        res.json({ sent: 0, failed: 0, skipped: true, reason: "no_subscription" })
        return
      }

      let sent = 0
      let failed = 0
      for (const subscription of subscriptions) {
        const result = await sendPush(
          env,
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          {
            title: "CasaRenous",
            body: "Les notifications fonctionnent sur cet appareil.",
            url: "/",
            tag: "test",
          },
        )
        if (result.ok) {
          sent += 1
          await db
            .update(pushSubscriptions)
            .set({ lastUsedAt: new Date(), failureCount: 0 })
            .where(eq(pushSubscriptions.id, subscription.id))
        } else {
          failed += 1
          const failures = subscription.failureCount + 1
          await db
            .update(pushSubscriptions)
            .set({
              failureCount: failures,
              disabledAt:
                result.gone || failures >= 5 ? new Date() : subscription.disabledAt,
            })
            .where(eq(pushSubscriptions.id, subscription.id))
        }
      }

      res.json({ sent, failed })
    }),
  )

  router.get(
    "/push/status",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const { user } = res.locals.auth as AuthLocals
      const subscriptions = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            isNull(pushSubscriptions.disabledAt),
          ),
        )
      res.json({
        configured: pushConfigured(env),
        subscriptions: subscriptions.length,
      })
    }),
  )

  router.post(
    "/push/validate",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (req, res) => {
      const input = parseBody(PushSubscribeInput, req.body)
      assertPushEndpoint(input.endpoint)
      res.json({ ok: true })
    }),
  )

  return router
}
