import { and, eq, isNull, lt, lte } from "drizzle-orm"
import type { Env } from "@casarenous/shared"
import type { Logger } from "pino"
import type { Database } from "../db/client.js"
import {
  keyDates,
  milestones,
  otpChallenges,
  pushDeliveries,
  pushSubscriptions,
  registrationChallenges,
  sessions,
} from "../db/schema.js"
import { daysBetween } from "@casarenous/shared"
import { pushConfigured, sendPush } from "../lib/push.js"

const INTERVAL_MS = 15 * 60_000

function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

interface Reminder {
  dedupeKey: string
  title: string
  body: string
  url: string
  eventDate: string
  days: number
}

export function chooseNotifyDay(days: number[], diff: number): number | null {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (!sorted.length) return null
  if (diff > sorted[sorted.length - 1]!) return null
  return sorted.find((day) => day >= diff) ?? sorted[sorted.length - 1]!
}

async function collectReminders(db: Database): Promise<Reminder[]> {
  const today = parisToday()
  const reminders: Reminder[] = []

  const dates = await db.select().from(keyDates)
  for (const item of dates) {
    if (item.completedOn) continue
    const diff = daysBetween(today, item.date)
    if (diff < 0) continue
    const days = chooseNotifyDay([7, 1], diff)
    if (days === null) continue
    reminders.push({
      dedupeKey: `keydate:${item.id}:d${days}`,
      title: days === 0 ? "CasaRenous — aujourd'hui" : `CasaRenous — J-${days}`,
      body: item.label,
      url: "/",
      eventDate: item.date,
      days,
    })
  }

  const rows = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.isKey, true), lte(milestones.plannedStart, itemHorizon())))
  for (const item of rows) {
    if (item.status === "done" || item.status === "cancelled") continue
    const diff = daysBetween(today, item.plannedStart)
    if (diff < 0) continue
    const days = chooseNotifyDay(item.notifyDays.length ? item.notifyDays : [7, 1], diff)
    if (days === null) continue
    reminders.push({
      dedupeKey: `milestone:${item.id}:d${days}`,
      title: days === 0 ? "CasaRenous — aujourd'hui" : `CasaRenous — J-${days}`,
      body: item.title,
      url: "/planning",
      eventDate: item.plannedStart,
      days,
    })
  }

  return reminders
}

function itemHorizon(): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 120)
  return date.toISOString().slice(0, 10)
}

export async function sendDueReminders(db: Database, env: Env, logger: Logger): Promise<void> {
  if (!pushConfigured(env)) return

  const reminders = await collectReminders(db)
  if (!reminders.length) return

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(isNull(pushSubscriptions.disabledAt))
  if (!subscriptions.length) return

  for (const reminder of reminders) {
    for (const subscription of subscriptions) {
      const inserted = await db
        .insert(pushDeliveries)
        .values({
          subscriptionId: subscription.id,
          dedupeKey: reminder.dedupeKey,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: pushDeliveries.id })
      if (!inserted.length) continue

      const deliveryId = inserted[0]!.id
      const result = await sendPush(
        env,
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        {
          title: reminder.title,
          body: reminder.body,
          url: reminder.url,
          tag: reminder.dedupeKey.slice(0, 16),
        },
      )

      if (result.ok) {
        await db
          .update(pushDeliveries)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(pushDeliveries.id, deliveryId))
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date(), failureCount: 0 })
          .where(eq(pushSubscriptions.id, subscription.id))
      } else {
        await db
          .update(pushDeliveries)
          .set({ status: "error", error: result.error ?? "push_failed" })
          .where(eq(pushDeliveries.id, deliveryId))
        const failures = subscription.failureCount + 1
        await db
          .update(pushSubscriptions)
          .set({
            failureCount: failures,
            disabledAt:
              result.gone || failures >= 5 ? new Date() : subscription.disabledAt,
          })
          .where(eq(pushSubscriptions.id, subscription.id))
        logger.warn(
          { subscription: subscription.id, status: result.statusCode, error: result.error },
          "échec d'envoi push",
        )
      }
    }
  }
}

export async function cleanupExpired(db: Database): Promise<void> {
  const now = new Date()
  const retention = new Date(now.getTime() - 30 * 86_400_000)
  await db.delete(sessions).where(lt(sessions.expiresAt, retention))
  await db.delete(otpChallenges).where(lt(otpChallenges.expiresAt, retention))
  await db
    .delete(registrationChallenges)
    .where(lt(registrationChallenges.expiresAt, retention))
  await db
    .delete(pushDeliveries)
    .where(lt(pushDeliveries.createdAt, new Date(now.getTime() - 90 * 86_400_000)))
}

export function startScheduler(db: Database, env: Env, logger: Logger): () => void {
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      await sendDueReminders(db, env, logger)
      await cleanupExpired(db)
    } catch (error) {
      logger.error({ err: error }, "scheduler en échec")
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), INTERVAL_MS)
  timer.unref()
  void tick()

  return () => clearInterval(timer)
}
