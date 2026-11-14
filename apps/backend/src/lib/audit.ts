import type { Database } from "../db/client.js"
import { auditLog } from "../db/schema.js"

export interface AuditInput {
  actorId?: string | null
  action: string
  entity?: string | null
  entityId?: string | null
  ip?: string | null
  userAgent?: string | null
  meta?: Record<string, unknown> | null
}

/** Écriture d'audit best-effort : ne doit jamais casser la requête métier. */
export async function writeAudit(db: Database, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      meta: input.meta ?? null,
    })
  } catch {
    // Le logger applicatif reste la source de vérité en cas d'échec DB.
  }
}
