import type { ReactNode } from "react"
import { Card } from "@/aura/react"
import { useAuth } from "@/auth/AuthProvider"
import { LockIcon } from "./icons"

/**
 * Bandeau « rôle invité » : explique ce qui est possible au lieu de laisser
 * l'utilisateur buter sur des boutons absents ou grisés.
 */
export function RoleNotice({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user || user.role === "admin") return null
  return (
    <Card variant="soft">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          aria-hidden
          style={{ color: "var(--aura-ink-3)", display: "flex", marginTop: 2 }}
        >
          <LockIcon size={16} />
        </span>
        <p className="app-small" style={{ margin: 0 }}>
          {children}
        </p>
      </div>
    </Card>
  )
}
