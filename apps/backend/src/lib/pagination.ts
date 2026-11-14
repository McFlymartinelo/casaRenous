import { and, eq, lt, or } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

export interface Cursor {
  createdAt: string
  id: string
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url")
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  try {
    const [createdAt, id] = Buffer.from(value, "base64url").toString("utf8").split("|")
    if (!createdAt || !id) return null
    if (Number.isNaN(Date.parse(createdAt))) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

export function cursorCondition(
  createdAt: PgColumn,
  id: PgColumn,
  cursor: Cursor,
) {
  return or(
    lt(createdAt, new Date(cursor.createdAt)),
    and(eq(createdAt, new Date(cursor.createdAt)), lt(id, cursor.id)),
  )
}
