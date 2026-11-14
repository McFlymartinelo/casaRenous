import { eq } from "drizzle-orm"
import type { Env } from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { otpChallenges, users } from "../db/schema.js"
import { ApiError } from "../lib/errors.js"
import type { Mailer } from "../lib/mailer.js"
import { hmacSha256, sha256, sixDigitCode } from "../lib/tokens.js"
import { writeAudit } from "../lib/audit.js"
import type { RequestContext } from "./auth.js"

export async function resendOtp(
  db: Database,
  env: Env,
  mailer: Mailer,
  challengeToken: string,
  context: RequestContext,
): Promise<{ retryAfterSeconds: number; devCode?: string }> {
  const now = new Date()
  const [row] = await db
    .select({ challenge: otpChallenges, user: users })
    .from(otpChallenges)
    .innerJoin(users, eq(otpChallenges.userId, users.id))
    .where(eq(otpChallenges.challengeHash, sha256(challengeToken)))
    .limit(1)

  if (!row || row.challenge.consumedAt || row.challenge.expiresAt.getTime() <= now.getTime()) {
    throw ApiError.unauthorized("Session de connexion expirée, reconnecte-toi", "otp_expired")
  }

  const elapsed = (now.getTime() - row.challenge.createdAt.getTime()) / 1000
  if (elapsed < env.OTP_RESEND_SECONDS) {
    throw ApiError.tooMany(
      `Patiente encore ${Math.ceil(env.OTP_RESEND_SECONDS - elapsed)} s avant de redemander un code`,
      "otp_cooldown",
    )
  }

  const code = sixDigitCode()
  const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000)

  await db
    .update(otpChallenges)
    .set({
      codeHash: hmacSha256(env.OTP_PEPPER, `${row.challenge.id}:${code}`),
      attempts: 0,
      expiresAt,
      createdAt: now,
    })
    .where(eq(otpChallenges.id, row.challenge.id))

  try {
    await mailer.sendOtp({
      to: row.user.email,
      code,
      displayName: row.user.displayName,
      purpose: "login",
    })
  } catch {
    throw new ApiError(502, "mail_failed", "Envoi du code impossible, réessaie plus tard")
  }

  await writeAudit(db, {
    actorId: row.user.id,
    action: "auth.otp.resent",
    entity: "user",
    entityId: row.user.id,
    ip: context.ip,
    userAgent: context.userAgent,
  })

  return {
    retryAfterSeconds: env.OTP_RESEND_SECONDS,
    ...(env.MAIL_TRANSPORT === "console" && env.NODE_ENV !== "production"
      ? { devCode: code }
      : {}),
  }
}
