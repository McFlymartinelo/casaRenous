import { useState } from "react"
import type { Milestone } from "@casarenous/shared"
import { PROJECT_END_DATE } from "@casarenous/shared"
import {
  Badge,
  Button,
  Input,
  Select,
  Sheet,
  Switch,
  Textarea,
} from "@/aura/react"
import {
  useCreateMilestone,
  useDeleteMilestone,
  useUpdateMilestone,
} from "@/hooks/useApi"
import { formatDate, todayIso } from "@/lib/dates"
import { TrashIcon } from "@/components/icons"

const CATEGORY_LABEL: Record<Milestone["category"], string> = {
  administratif: "Administratif",
  technique: "Technique",
  chantier: "Chantier",
  livraison: "Livraison",
}

const STATUS_LABEL: Record<Milestone["status"], string> = {
  planned: "Prévu",
  in_progress: "En cours",
  done: "Terminé",
  late: "En retard",
  cancelled: "Annulé",
}

type Draft = {
  title: string
  description: string
  category: Milestone["category"]
  status: Milestone["status"]
  plannedStart: string
  plannedEnd: string
  actualDate: string
  isKey: boolean
  notifyDays: number[]
}

function draftFrom(milestone: Milestone): Draft {
  return {
    title: milestone.title,
    description: milestone.description ?? "",
    category: milestone.category,
    status: milestone.status,
    plannedStart: milestone.plannedStart,
    plannedEnd: milestone.plannedEnd,
    actualDate: milestone.actualDate ?? "",
    isKey: milestone.isKey,
    notifyDays: milestone.notifyDays,
  }
}

export function MilestoneSheet({
  open,
  onClose,
  milestone,
  isNew,
  isAdmin,
}: {
  open: boolean
  onClose: () => void
  milestone: Milestone | null
  isNew: boolean
  isAdmin: boolean
}) {
  const today = todayIso()
  const [draft, setDraft] = useState<Draft>(() =>
    milestone
      ? draftFrom(milestone)
      : {
          title: "",
          description: "",
          category: "chantier",
          status: "planned",
          plannedStart: today,
          plannedEnd: today,
          actualDate: "",
          isKey: false,
          notifyDays: [7, 1],
        },
  )
  const [error, setError] = useState<string | null>(null)
  const create = useCreateMilestone()
  const update = useUpdateMilestone()
  const remove = useDeleteMilestone()

  function toggleNotify(days: number) {
    setDraft((current) => ({
      ...current,
      notifyDays: current.notifyDays.includes(days)
        ? current.notifyDays.filter((value) => value !== days)
        : [...current.notifyDays, days].sort((a, b) => b - a),
    }))
  }

  async function save() {
    setError(null)
    if (draft.title.trim().length < 2) {
      setError("Le titre doit contenir au moins 2 caractères.")
      return
    }
    if (draft.plannedEnd < draft.plannedStart) {
      setError("La fin doit être postérieure ou égale au début.")
      return
    }
    if (draft.plannedEnd > PROJECT_END_DATE) {
      setError("Le rétroplanning est borné au 31 décembre 2028.")
      return
    }
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      category: draft.category,
      status: draft.status,
      plannedStart: draft.plannedStart,
      plannedEnd: draft.plannedEnd,
      actualDate: draft.actualDate || null,
      isKey: draft.isKey,
      notifyDays: draft.notifyDays,
    }
    try {
      if (isNew) await create.mutateAsync(payload)
      else if (milestone) await update.mutateAsync({ id: milestone.id, input: payload })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.")
    }
  }

  async function removeCurrent() {
    if (!milestone) return
    try {
      await remove.mutateAsync(milestone.id)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.")
    }
  }

  if (!isAdmin) {
    if (!milestone) return null
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={milestone.title}
        description={`${CATEGORY_LABEL[milestone.category]} · ${STATUS_LABEL[milestone.status]}`}
      >
        <div className="aura-stack">
          <div className="aura-row-flex" style={{ flexWrap: "wrap" }}>
            <Badge tone={milestone.isKey ? "accent" : "neutral"}>
              {milestone.isKey ? "Jalon clé" : "Jalon"}
            </Badge>
            <Badge tone={milestone.status === "done" ? "success" : milestone.status === "late" ? "danger" : "neutral"}>
              {STATUS_LABEL[milestone.status]}
            </Badge>
          </div>
          <dl className="app-spec-list">
            <div>
              <dt>Période</dt>
              <dd>
                Du {formatDate(milestone.plannedStart)} au {formatDate(milestone.plannedEnd)}
              </dd>
            </div>
            {milestone.actualDate ? (
              <div>
                <dt>Réalisé le</dt>
                <dd>{formatDate(milestone.actualDate)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Rappels</dt>
              <dd>
                {milestone.notifyDays.length
                  ? milestone.notifyDays.map((days) => (days === 0 ? "le jour J" : `J-${days}`)).join(", ")
                  : "Aucun"}
              </dd>
            </div>
          </dl>
          {milestone.description ? <p className="app-small">{milestone.description}</p> : null}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? "Nouveau jalon" : "Modifier le jalon"}
      description="Rétroplanning borné à décembre 2028."
      footer={
        <div className="aura-stack" style={{ gap: 8 }}>
          <Button block loading={create.isPending || update.isPending} onClick={() => void save()}>
            Enregistrer
          </Button>
          {!isNew ? (
            <Button
              block
              variant="ghost"
              icon={<TrashIcon size={16} />}
              loading={remove.isPending}
              onClick={() => void removeCurrent()}
            >
              Supprimer
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="aura-stack">
        <Input
          label="Titre"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <Textarea
          label="Description"
          rows={3}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
        <div className="app-two-col">
          <Select
            label="Catégorie"
            value={draft.category}
            onChange={(event) =>
              setDraft({ ...draft, category: event.target.value as Milestone["category"] })
            }
          >
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="Statut"
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as Milestone["status"] })
            }
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="app-two-col">
          <Input
            label="Début"
            type="date"
            max={PROJECT_END_DATE}
            value={draft.plannedStart}
            onChange={(event) => setDraft({ ...draft, plannedStart: event.target.value })}
          />
          <Input
            label="Fin"
            type="date"
            max={PROJECT_END_DATE}
            value={draft.plannedEnd}
            onChange={(event) => setDraft({ ...draft, plannedEnd: event.target.value })}
          />
        </div>
        <Input
          label="Réalisé le (optionnel)"
          type="date"
          max={PROJECT_END_DATE}
          value={draft.actualDate}
          onChange={(event) => setDraft({ ...draft, actualDate: event.target.value })}
        />
        <div className="aura-row-flex" style={{ justifyContent: "space-between" }}>
          <span className="app-small">Jalon clé (visible sur La Piazza)</span>
          <Switch
            checked={draft.isKey}
            onChange={(checked) => setDraft({ ...draft, isKey: checked })}
            label="Jalon clé"
          />
        </div>
        <div>
          <p className="aura-label">Rappels push</p>
          <div className="app-chip-row" style={{ marginTop: 6 }}>
            {[90, 30, 7, 1, 0].map((days) => (
              <Button
                key={days}
                size="sm"
                variant={draft.notifyDays.includes(days) ? "primary" : "outline"}
                onClick={() => toggleNotify(days)}
              >
                {days === 0 ? "Jour J" : `J-${days}`}
              </Button>
            ))}
          </div>
        </div>
        {error ? (
          <p className="aura-error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
