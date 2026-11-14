import { and, desc, eq, gt, isNull, ne } from "drizzle-orm"
import type { Env, LoginInput, SessionSummary, UserPublic } from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { otpChallenges, sessions, users } from "../db/schema.js"
import { ApiError } from "../lib/errors.js"
import type { Mailer } from "../lib/mailer.js"
import {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from "../lib/password.js"
import { toUserPublic } from "../lib/serializers.js"
import {
  hmacSha256,
  maskEmail,
  randomId,
  randomToken,
  safeEqual,
  sha256,
  sixDigitCode,
} from "../lib/tokens.js"
import { writeAudit } from "../lib/audit.js"

export interface RequestContext {
  ip: string | null
  userAgent: string | null
}

export interface LoginResult {
  challengeToken: string
  emailMasked: string
  devCode?: string
}

export interface SessionUser {
  user: UserPublic
  sessionId: string
}

const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15
const MAX_ACTIVE_SESSIONS = 10

export async function login(
  db: Database,
  env: Env,
  mailer: Mailer,
  input: LoginInput,
  context: RequestContext,
): Promise<LoginResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)

  if (!user) {
    await burnPasswordCheck(input.password)
    await writeAudit(db, {
      action: "auth.login.failed",
      entity: "user",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { reason: "unknown_email" },
    })
    throw ApiError.unauthorized("Email ou mot de passe incorrect", "invalid_credentials")
  }

  const now = new Date()
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    await burnPasswordCheck(input.password)
    throw ApiError.unauthorized("Email ou mot de passe incorrect", "invalid_credentials")
  }

  const valid = await verifyPassword(input.password, user.passwordHash)
  if (!valid) {
    const attempts = user.failedAttempts + 1
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
        : null
    await db
      .update(users)
      .set({
        failedAttempts: attempts,
        lockedUntil,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
    await writeAudit(db, {
      actorId: user.id,
      action: "auth.login.failed",
      entity: "user",
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { attempts, locked: Boolean(lockedUntil) },
    })
    throw ApiError.unauthorized("Email ou mot de passe incorrect", "invalid_credentials")
  }

  await db
    .update(users)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id))

  // Un seul challenge actif par utilisateur.
  await db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.userId, user.id), isNull(otpChallenges.consumedAt)))

  const challengeId = randomId()
  const challengeToken = randomToken(32)
  const code = sixDigitCode()
  const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000)

  await db.insert(otpChallenges).values({
    id: challengeId,
    userId: user.id,
    challengeHash: sha256(challengeToken),
    codeHash: hmacSha256(env.OTP_PEPPER, `${challengeId}:${code}`),
    expiresAt,
    ip: context.ip,
  })

  try {
    await mailer.sendOtp({
      to: user.email,
      code,
      displayName: user.displayName,
      purpose: "login",
    })
  } catch {
    await db.delete(otpChallenges).where(eq(otpChallenges.id, challengeId))
    throw new ApiError(502, "mail_failed", "Envoi du code impossible, réessaie plus tard")
  }

  await writeAudit(db, {
    actorId: user.id,
    action: "auth.otp.sent",
    entity: "user",
    entityId: user.id,
    ip: context.ip,
    userAgent: context.userAgent,
  })

  const devCode =
    env.MAIL_TRANSPORT === "console" && env.NODE_ENV !== "production" ? code : undefined

  return { challengeToken, emailMasked: maskEmail(user.email), devCode }
}

export async function verifyOtp(
  db: Database,
  env: Env,
  challengeToken: string,
  code: string,
  context: RequestContext,
): Promise<{ token: string; user: UserPublic }> {
  const now = new Date()
  const challengeHash = sha256(challengeToken)

  const [row] = await db
    .select({ challenge: otpChallenges, user: users })
    .from(otpChallenges)
    .innerJoin(users, eq(otpChallenges.userId, users.id))
    .where(eq(otpChallenges.challengeHash, challengeHash))
    .limit(1)

  if (!row) {
    throw ApiError.unauthorized("Code expiré, reconnecte-toi", "otp_expired")
  }
  const { challenge, user } = row

  if (challenge.consumedAt || challenge.expiresAt.getTime() <= now.getTime()) {
    throw ApiError.unauthorized("Code expiré, reconnecte-toi", "otp_expired")
  }

  if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw ApiError.unauthorized("Trop d'essais, reconnecte-toi", "otp_attempts")
  }

  const expected = hmacSha256(env.OTP_PEPPER, `${challenge.id}:${code}`)
  if (!safeEqual(expected, challenge.codeHash)) {
    const attempts = challenge.attempts + 1
    await db
      .update(otpChallenges)
      .set({
        attempts,
        consumedAt: attempts >= env.OTP_MAX_ATTEMPTS ? now : null,
      })
      .where(eq(otpChallenges.id, challenge.id))
    await writeAudit(db, {
      actorId: user.id,
      action: "auth.otp.failed",
      entity: "user",
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { attempts },
    })
    throw ApiError.unauthorized("Code incorrect", "otp_invalid")
  }

  // Consommation atomique : deux vérifications simultanées ne peuvent pas
  // créer deux sessions avec le même code.
  const consumed = await db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id })

  if (consumed.length === 0) {
    throw ApiError.unauthorized("Code déjà utilisé, reconnecte-toi", "otp_expired")
  }

  const token = await issueSession(db, env, user.id, context, now)

  await writeAudit(db, {
    actorId: user.id,
    action: "auth.login.success",
    entity: "user",
    entityId: user.id,
    ip: context.ip,
    userAgent: context.userAgent,
  })

  return { token, user: toUserPublic(user) }
}

export async function issueSession(
  db: Database,
  env: Env,
  userId: string,
  context: RequestContext,
  now = new Date(),
): Promise<string> {
  const token = randomToken(32)
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_SECONDS * 1000)

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    ip: context.ip,
    userAgent: context.userAgent,
    expiresAt,
    lastSeenAt: now,
    createdAt: now,
  })

  await db
    .update(users)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, userId))

  await trimSessions(db, userId, now)
  return token
}

async function trimSessions(db: Database, userId: string, now: Date): Promise<void> {
  const stale = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .offset(MAX_ACTIVE_SESSIONS)

  for (const item of stale) {
    await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(eq(sessions.id, item.id))
  }
}

export async function resolveSession(
  db: Database,
  env: Env,
  token: string,
): Promise<SessionUser | null> {
  const now = new Date()
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1)

  if (!row) return null
  const { session, user } = row
  if (session.revokedAt) return null
  if (session.expiresAt.getTime() <= now.getTime()) return null

  const idleMs = now.getTime() - session.lastSeenAt.getTime()
  if (idleMs > env.SESSION_IDLE_SECONDS * 1000) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, session.id))
    return null
  }

  if (idleMs > 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, session.id))
  }

  return { user: toUserPublic(user), sessionId: session.id }
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId))
}

export async function revokeAllSessions(
  db: Database,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  const now = new Date()
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    )
}

export async function listSessions(
  db: Database,
  userId: string,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt))

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    ip: row.ip,
    userAgent: row.userAgent,
    current: row.id === currentSessionId,
  }))
}

export async function changePassword(
  db: Database,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw ApiError.unauthorized()

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    throw ApiError.unauthorized("Mot de passe actuel incorrect", "invalid_credentials")
  }

  const passwordHash = await hashPassword(newPassword)
  await db
    .update(users)
    .set({
      passwordHash,
      passwordVersion: user.passwordVersion + 1,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  // Toutes les sessions sont révoquées : l'utilisateur se reconnecte avec OTP.
  await revokeAllSessions(db, userId)
}
