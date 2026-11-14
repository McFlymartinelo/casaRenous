import { useState } from "react"
import type { Reserve } from "@casarenous/shared"
import { Badge, Button, Select, Sheet } from "@/aura/react"
import { useDeleteReserve, useUpdateReserve } from "@/hooks/useApi"
import { formatDate } from "@/lib/dates"
import { TrashIcon } from "@/components/icons"

const STATUS_LABEL: Record<Reserve["status"], string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Levée",
  accepted: "Acceptée",
}

const SEVERITY_LABEL: Record<Reserve["severity"], string> = {
  mineure: "Mineure",
  majeure: "Majeure",
  bloquante: "Bloquante",
}

export function ReserveDetailSheet({
  open,
  onClose,
  reserve,
  isAdmin,
}: {
  open: boolean
  onClose: () => void
  reserve: Reserve | null
  isAdmin: boolean
}) {
  const update = useUpdateReserve()
  const remove = useDeleteReserve()
  const [status, setStatus] = useState<Reserve["status"]>(reserve?.status ?? "open")
  const [error, setError] = useState<string | null>(null)

  if (!reserve) return null

  async function save() {
    setError(null)
    try {
      await update.mutateAsync({ id: reserve!.id, input: { status } })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mise à jour impossible.")
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync(reserve!.id)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.")
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={reserve.title}
      description={`${SEVERITY_LABEL[reserve.severity]} · ${STATUS_LABEL[reserve.status]}`}
      footer={
        <div className="aura-stack" style={{ gap: 8 }}>
          <Button block loading={update.isPending} onClick={() => void save()}>
            Mettre à jour le statut
          </Button>
          {isAdmin ? (
            <Button
              block
              variant="ghost"
              icon={<TrashIcon size={16} />}
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm("Supprimer cette réserve ?")) void destroy()
              }}
            >
              Supprimer
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="aura-stack">
        <div className="aura-row-flex" style={{ flexWrap: "wrap" }}>
          <Badge
            tone={
              reserve.severity === "bloquante"
                ? "danger"
                : reserve.severity === "majeure"
                  ? "warn"
                  : "neutral"
            }
          >
            {SEVERITY_LABEL[reserve.severity]}
          </Badge>
          <Badge tone={reserve.status === "resolved" || reserve.status === "accepted" ? "success" : "neutral"}>
            {STATUS_LABEL[reserve.status]}
          </Badge>
        </div>
        <dl className="app-spec-list">
          {reserve.location ? (
            <div>
              <dt>Emplacement</dt>
              <dd>{reserve.location}</dd>
            </div>
          ) : null}
          {reserve.dueDate ? (
            <div>
              <dt>Échéance</dt>
              <dd>{formatDate(reserve.dueDate)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Créée le</dt>
            <dd>{formatDate(reserve.createdAt.slice(0, 10))}</dd>
          </div>
          {reserve.resolvedAt ? (
            <div>
              <dt>Levée le</dt>
              <dd>{formatDate(reserve.resolvedAt.slice(0, 10))}</dd>
            </div>
          ) : null}
        </dl>
        {reserve.description ? <p className="app-small">{reserve.description}</p> : null}
        <Select
          label="Statut"
          value={status}
          onChange={(event) => setStatus(event.target.value as Reserve["status"])}
        >
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {error ? (
          <p className="aura-error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
