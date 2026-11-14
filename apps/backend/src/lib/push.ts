import webpush from "web-push"
import type { Env, PushSubscribeInput } from "@casarenous/shared"
import { ApiError } from "./errors.js"

const ALLOWED_HOSTS = [
  /^([a-z0-9-]+\.)*googleapis\.com$/i,
  /^([a-z0-9-]+\.)*push\.apple\.com$/i,
  /^updates\.push\.services\.mozilla\.com$/i,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/i,
]

let configured = false

export function pushConfigured(env: Env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

function ensureConfigured(env: Env): void {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw ApiError.badRequest("Notifications push non configurées", "push_not_configured")
  }
  if (!configured) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    )
    configured = true
  }
}

export function assertPushEndpoint(endpoint: string): void {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw ApiError.unprocessable("Endpoint push invalide", {
      endpoint: ["URL invalide"],
    })
  }
  if (url.protocol !== "https:") {
    throw ApiError.unprocessable("Endpoint push HTTPS requis", {
      endpoint: ["HTTPS requis"],
    })
  }
  if (!ALLOWED_HOSTS.some((pattern) => pattern.test(url.hostname))) {
    throw ApiError.unprocessable("Service de push non reconnu", {
      endpoint: ["Hôte non autorisé"],
    })
  }
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export interface PushSendResult {
  ok: boolean
  statusCode?: number
  gone: boolean
  error?: string
}

export async function sendPush(
  env: Env,
  target: PushTarget,
  payload: PushPayload,
): Promise<PushSendResult> {
  ensureConfigured(env)
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/",
        ...(payload.tag ? { tag: payload.tag.slice(0, 16) } : {}),
      }),
      { TTL: 3600, urgency: "normal" },
    )
    return { ok: true, gone: false }
  } catch (error) {
    const candidate = error as { statusCode?: number; body?: string; message?: string }
    const statusCode = candidate.statusCode
    return {
      ok: false,
      statusCode,
      gone: statusCode === 404 || statusCode === 410 || statusCode === 403,
      error: candidate.body ?? candidate.message ?? "push_failed",
    }
  }
}

export function normalizeSubscription(input: PushSubscribeInput): PushTarget {
  assertPushEndpoint(input.endpoint)
  return {
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  }
}
