import { and, eq, isNull } from "drizzle-orm"
import type { Env, RegisterRequestInput } from "@casarenous/shared"
import type { Database } from "../db/client.js"
import {
  invitations,
  registrationChallenges,
  users,
} from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import type { Mailer } from "../lib/mailer.js"
import { hashPassword } from "../lib/password.js"
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
import { issueSession, type RequestContext } from "./auth.js"

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function requestRegistration(
  db: Database,
  env: Env,
  mailer: Mailer,
  input: RegisterRequestInput,
  context: RequestContext,
): Promise<{ challengeToken: string; emailMasked: string; devCode?: string }> {
  const now = new Date()

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, sha256(input.invitationCode)))
    .limit(1)

  if (
    !invitation ||
    invitation.usedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() <= now.getTime() ||
    invitation.email !== input.email
  ) {
    throw ApiError.unauthorized(
      "Invitation invalide ou expirée. Demande un nouveau code à l'admin.",
      "invitation_invalid",
    )
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)
  if (existing) {
    throw ApiError.conflict("Un compte existe déjà pour cette adresse", "email_taken")
  }

  // Une seule inscription en cours par invitation.
  await db
    .update(registrationChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(registrationChallenges.invitationId, invitation.id),
        isNull(registrationChallenges.consumedAt),
      ),
    )

  const challengeId = randomId()
  const challengeToken = randomToken(32)
  const code = sixDigitCode()
  const passwordHash = await hashPassword(input.password)

  await db.insert(registrationChallenges).values({
    id: challengeId,
    invitationId: invitation.id,
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    role: invitation.role,
    challengeHash: sha256(challengeToken),
    codeHash: hmacSha256(env.OTP_PEPPER, `${challengeId}:${code}`),
    expiresAt: new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000),
    ip: context.ip,
  })

  try {
    await mailer.sendOtp({
      to: input.email,
      code,
      displayName: input.displayName,
      purpose: "register",
    })
  } catch {
    await db
      .delete(registrationChallenges)
      .where(eq(registrationChallenges.id, challengeId))
    throw new ApiError(502, "mail_failed", "Envoi du code impossible, réessaie plus tard")
  }

  await writeAudit(db, {
    action: "auth.register.otp_sent",
    entity: "invitation",
    entityId: invitation.id,
    ip: context.ip,
    userAgent: context.userAgent,
  })

  return {
    challengeToken,
    emailMasked: maskEmail(input.email),
    ...(env.MAIL_TRANSPORT === "console" && env.NODE_ENV !== "production"
      ? { devCode: code }
      : {}),
  }
}

export async function verifyRegistration(
  db: Database,
  env: Env,
  challengeToken: string,
  code: string,
  context: RequestContext,
): Promise<{ token: string; user: ReturnType<typeof toUserPublic> }> {
  const now = new Date()
  const [row] = await db
    .select({ challenge: registrationChallenges, invitation: invitations })
    .from(registrationChallenges)
    .innerJoin(
      invitations,
      eq(registrationChallenges.invitationId, invitations.id),
    )
    .where(eq(registrationChallenges.challengeHash, sha256(challengeToken)))
    .limit(1)

  if (!row) {
    throw ApiError.unauthorized("Inscription expirée, recommence", "registration_expired")
  }
  const { challenge, invitation } = row

  if (
    challenge.consumedAt ||
    challenge.expiresAt.getTime() <= now.getTime() ||
    invitation.usedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() <= now.getTime()
  ) {
    throw ApiError.unauthorized(
      "Invitation expirée ou déjà utilisée",
      "invitation_invalid",
    )
  }

  if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw ApiError.unauthorized("Trop d'essais, recommence", "otp_attempts")
  }

  const expected = hmacSha256(env.OTP_PEPPER, `${challenge.id}:${code}`)
  if (!safeEqual(expected, challenge.codeHash)) {
    const attempts = challenge.attempts + 1
    await db
      .update(registrationChallenges)
      .set({
        attempts,
        consumedAt: attempts >= env.OTP_MAX_ATTEMPTS ? now : null,
      })
      .where(eq(registrationChallenges.id, challenge.id))
    throw ApiError.unauthorized("Code incorrect", "otp_invalid")
  }

  const consumed = await db
    .update(registrationChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(registrationChallenges.id, challenge.id),
        isNull(registrationChallenges.consumedAt),
      ),
    )
    .returning({ id: registrationChallenges.id })
  if (!consumed.length) {
    throw ApiError.unauthorized("Inscription déjà utilisée, recommence", "registration_expired")
  }

  let createdUserId: string | null = null
  try {
    createdUserId = await db.transaction(async (tx) => {
      const [lockedInvitation] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.id, invitation.id))
        .for("update")
      if (
        !lockedInvitation ||
        lockedInvitation.usedAt ||
        lockedInvitation.revokedAt ||
        lockedInvitation.expiresAt.getTime() <= now.getTime()
      ) {
        throw ApiError.unauthorized("Invitation expirée ou déjà utilisée", "invitation_invalid")
      }

      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, challenge.email))
        .limit(1)
      if (existing) {
        throw ApiError.conflict("Un compte existe déjà pour cette adresse", "email_taken")
      }

      const [created] = await tx
        .insert(users)
        .values({
          email: challenge.email,
          displayName: challenge.displayName,
          role: challenge.role,
          passwordHash: challenge.passwordHash,
        })
        .returning()
      if (!created) throw ApiError.internal("Création du compte impossible", "register_failed")

      await tx
        .update(invitations)
        .set({ usedAt: now, usedBy: created.id })
        .where(eq(invitations.id, invitation.id))

      return created.id
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw ApiError.conflict("Un compte existe déjà pour cette adresse", "email_taken")
  }

  if (!createdUserId) {
    throw ApiError.internal("Création du compte impossible", "register_failed")
  }

  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.id, createdUserId))
    .limit(1)
  if (!created) throw ApiError.internal("Création du compte impossible", "register_failed")

  const token = await issueSession(db, env, created.id, context, now)

  await writeAudit(db, {
    actorId: created.id,
    action: "auth.register.success",
    entity: "user",
    entityId: created.id,
    ip: context.ip,
    userAgent: context.userAgent,
    meta: { invitationId: invitation.id, role: created.role },
  })

  return { token, user: toUserPublic(created) }
}

export async function resendRegistrationOtp(
  db: Database,
  env: Env,
  mailer: Mailer,
  challengeToken: string,
  context: RequestContext,
): Promise<{ retryAfterSeconds: number; devCode?: string }> {
  const now = new Date()
  const [row] = await db
    .select({ challenge: registrationChallenges, invitation: invitations })
    .from(registrationChallenges)
    .innerJoin(
      invitations,
      eq(registrationChallenges.invitationId, invitations.id),
    )
    .where(eq(registrationChallenges.challengeHash, sha256(challengeToken)))
    .limit(1)

  if (
    !row ||
    row.challenge.consumedAt ||
    row.challenge.expiresAt.getTime() <= now.getTime() ||
    row.invitation.usedAt ||
    row.invitation.revokedAt
  ) {
    throw ApiError.unauthorized("Inscription expirée, recommence", "registration_expired")
  }

  const elapsed = (now.getTime() - row.challenge.createdAt.getTime()) / 1000
  if (elapsed < env.OTP_RESEND_SECONDS) {
    throw ApiError.tooMany(
      `Patiente encore ${Math.ceil(env.OTP_RESEND_SECONDS - elapsed)} s avant de redemander un code`,
      "otp_cooldown",
    )
  }

  const code = sixDigitCode()
  await db
    .update(registrationChallenges)
    .set({
      codeHash: hmacSha256(env.OTP_PEPPER, `${row.challenge.id}:${code}`),
      attempts: 0,
      expiresAt: new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000),
      createdAt: now,
    })
    .where(eq(registrationChallenges.id, row.challenge.id))

  try {
    await mailer.sendOtp({
      to: row.challenge.email,
      code,
      displayName: row.challenge.displayName,
      purpose: "register",
    })
  } catch {
    throw new ApiError(502, "mail_failed", "Envoi du code impossible, réessaie plus tard")
  }

  await writeAudit(db, {
    action: "auth.register.otp_resent",
    entity: "invitation",
    entityId: row.invitation.id,
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

export { INVITATION_TTL_MS }
