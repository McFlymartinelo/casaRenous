import { and, desc, eq, isNull } from "drizzle-orm"
import type {
  Invitation,
  InvitationCreateInput,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { invitations, users } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import type { Mailer } from "../lib/mailer.js"
import type { InvitationRow } from "../db/schema.js"
import { randomToken, sha256 } from "../lib/tokens.js"
import { INVITATION_TTL_MS } from "./registration.js"

export function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt ? row.usedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  }
}

export async function createInvitation(
  db: Database,
  mailer: Mailer,
  input: InvitationCreateInput,
  createdBy: string,
): Promise<{ invitation: Invitation; code: string; emailSent: boolean }> {
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1)
  if (existingUser) {
    throw ApiError.conflict("Un compte existe déjà pour cette adresse", "email_taken")
  }

  const now = new Date()
  await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.email, input.email),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
      ),
    )

  const code = randomToken(32)
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS)
  const [created] = await db
    .insert(invitations)
    .values({
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      tokenHash: sha256(code),
      expiresAt,
      createdBy,
    })
    .returning()
  if (!created) throw ApiError.internal("Création de l'invitation impossible", "invitation_failed")

  let emailSent = true
  try {
    await mailer.sendInvitation({
      to: created.email,
      displayName: created.displayName,
      code,
      role: created.role,
      expiresAt: created.expiresAt,
    })
  } catch {
    emailSent = false
  }

  await writeAudit(db, {
    actorId: createdBy,
    action: "invitation.created",
    entity: "invitation",
    entityId: created.id,
    meta: { email: created.email, role: created.role, emailSent },
  })

  return { invitation: toInvitation(created), code, emailSent }
}

export async function listInvitations(db: Database): Promise<Invitation[]> {
  const rows = await db
    .select()
    .from(invitations)
    .orderBy(desc(invitations.createdAt))
    .limit(100)
  return rows.map(toInvitation)
}

export async function revokeInvitation(
  db: Database,
  id: string,
  actorId: string,
): Promise<void> {
  const [updated] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), isNull(invitations.usedAt)))
    .returning({ id: invitations.id })
  if (!updated) throw ApiError.notFound("Invitation introuvable", "invitation_not_found")

  await writeAudit(db, {
    actorId,
    action: "invitation.revoked",
    entity: "invitation",
    entityId: id,
  })
}
