import { useState } from "react"
import type { Invitation, Role } from "@casarenous/shared"
import {
  Badge,
  Button,
  Input,
  ListRow,
  Select,
  Sheet,
} from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import {
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
} from "@/hooks/useApi"
import { formatDateTime } from "@/lib/dates"
import { CheckIcon, ExternalIcon, PlusIcon, TrashIcon } from "@/components/icons"

function invitationState(invitation: Invitation): {
  label: string
  tone: "success" | "warn" | "neutral" | "danger"
} {
  if (invitation.usedAt) return { label: "Utilisée", tone: "success" }
  if (invitation.revokedAt) return { label: "Révoquée", tone: "danger" }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return { label: "Expirée", tone: "neutral" }
  }
  return { label: "En attente", tone: "warn" }
}

export function InvitationsSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { notify } = useNotify()
  const invitations = useInvitations()
  const create = useCreateInvitation()
  const revoke = useRevokeInvitation()
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [role, setRole] = useState<Role>("invites")
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{
    invitation: Invitation
    code: string
    emailSent: boolean
  } | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit() {
    setError(null)
    if (displayName.trim().length < 2) {
      setError("Indique le nom de la personne invitée.")
      return
    }
    try {
      const result = await create.mutateAsync({
        email,
        displayName: displayName.trim(),
        role,
      })
      setCreated(result)
      setEmail("")
      setDisplayName("")
      setRole("invites")
      setCopied(false)
      notify({
        title: "Invitation créée",
        message: result.emailSent
          ? "Le code a été envoyé par email. Il reste affiché une seule fois ici."
          : "L'email n'a pas pu partir : copie le code et transmets-le manuellement.",
        tone: result.emailSent ? "success" : "warn",
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible.")
    }
  }

  async function copyCode() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.code)
      setCopied(true)
    } catch {
      setError("Copie impossible : sélectionne le code manuellement.")
    }
  }

  async function remove(invitation: Invitation) {
    if (!window.confirm(`Révoquer l'invitation de ${invitation.email} ?`)) return
    try {
      await revoke.mutateAsync(invitation.id)
      if (created?.invitation.id === invitation.id) setCreated(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Révocation impossible.")
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invitations"
      description="Crée un accès nominatif. Sans invitation valide, aucune inscription n'est possible."
    >
      <div className="aura-stack" style={{ gap: 20 }}>
        {created ? (
          <section className="aura-stack" style={{ gap: 8 }}>
            <div className="aura-row-flex" style={{ gap: 8 }}>
              <span className="aura-empty__icon" style={{ width: 36, height: 36 }}>
                <CheckIcon size={18} />
              </span>
              <div>
                <p className="aura-h3">Invitation prête</p>
                <p className="app-small">
                  {created.emailSent
                    ? "Email envoyé. Le code reste affiché une seule fois."
                    : "Email non envoyé. Transmets ce code manuellement."}
                </p>
              </div>
            </div>
            <Input readOnly label="Code d'invitation" value={created.code} />
            <div className="app-inline-actions">
              <Button size="sm" variant="soft" icon={<ExternalIcon size={15} />} onClick={() => void copyCode()}>
                {copied ? "Copié" : "Copier le code"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Masquer
              </Button>
            </div>
            <p className="aura-hint">
              À transmettre à {created.invitation.email}. Valable jusqu'au{" "}
              {formatDateTime(created.invitation.expiresAt)}.
            </p>
          </section>
        ) : null}

        <section className="aura-stack">
          <p className="app-kicker">
            <PlusIcon size={13} /> Nouvelle invitation
          </p>
          <Input
            label="Email de la personne"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="prenom.nom@exemple.fr"
          />
          <Input
            label="Nom affiché"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Mme Sévin"
          />
          <Select
            label="Rôle"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            <option value="invites">Invité — lecture + journal, photos, réserves</option>
            <option value="admin">Admin — accès complet</option>
          </Select>
          <Button
            block
            icon={<PlusIcon size={16} />}
            loading={create.isPending}
            onClick={() => void submit()}
          >
            Créer l'invitation
          </Button>
          {error ? (
            <p className="aura-error-text" role="alert">
              {error}
            </p>
          ) : null}
          <p className="aura-hint">
            L'invitation expire au bout de 7 jours. Un seul compte peut être créé par
            invitation. Le code n'est jamais réaffiché.
          </p>
        </section>

        <section>
          <p className="app-kicker" style={{ marginBottom: 8 }}>
            Historique
          </p>
          {invitations.data?.length ? (
            <div className="app-list">
              {invitations.data.map((invitation) => {
                const state = invitationState(invitation)
                return (
                  <ListRow
                    key={invitation.id}
                    title={invitation.displayName}
                    subtitle={`${invitation.email} · ${invitation.role === "admin" ? "Admin" : "Invité"} · expire le ${formatDateTime(invitation.expiresAt)}`}
                    meta={<Badge tone={state.tone}>{state.label}</Badge>}
                    trailing={
                      !invitation.usedAt && !invitation.revokedAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Révoquer ${invitation.email}`}
                          loading={revoke.isPending}
                          onClick={() => void remove(invitation)}
                        >
                          <TrashIcon size={16} />
                        </Button>
                      ) : undefined
                    }
                  />
                )
              })}
            </div>
          ) : (
            <p className="app-empty-inline">Aucune invitation créée pour l'instant.</p>
          )}
        </section>
      </div>
    </Sheet>
  )
}
