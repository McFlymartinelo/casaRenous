import { useState } from "react"
import type { KeyDate } from "@casarenous/shared"
import { PROJECT_END_DATE, PROJECT_START_DATE } from "@casarenous/shared"
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
  useCreateKeyDate,
  useDeleteKeyDate,
  useUpdateKeyDate,
} from "@/hooks/useApi"
import { formatDate } from "@/lib/dates"
import { CheckIcon, EditIcon, PlusIcon, TrashIcon } from "@/components/icons"

type Draft = {
  id?: string
  label: string
  date: string
  kind: KeyDate["kind"]
  note: string
  isProvisional: boolean
  completedOn: string
}

const EMPTY: Draft = {
  label: "",
  date: "",
  kind: "administratif",
  note: "",
  isProvisional: true,
  completedOn: "",
}

export function KeyDatesSheet({
  open,
  onClose,
  dates,
}: {
  open: boolean
  onClose: () => void
  dates: KeyDate[]
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateKeyDate()
  const update = useUpdateKeyDate()
  const remove = useDeleteKeyDate()

  function edit(item: KeyDate) {
    setError(null)
    setDraft({
      id: item.id,
      label: item.label,
      date: item.date,
      kind: item.kind,
      note: item.note ?? "",
      isProvisional: item.isProvisional,
      completedOn: item.completedOn ?? "",
    })
  }

  async function save() {
    if (!draft) return
    setError(null)
    if (draft.label.trim().length < 2) {
      setError("Le libellé doit contenir au moins 2 caractères.")
      return
    }
    if (!draft.date || draft.date > PROJECT_END_DATE || draft.date < PROJECT_START_DATE) {
      setError(`La date doit être comprise entre le ${PROJECT_START_DATE} et le ${PROJECT_END_DATE}.`)
      return
    }
    const payload = {
      label: draft.label.trim(),
      date: draft.date,
      kind: draft.kind,
      note: draft.note.trim() || null,
      isProvisional: draft.isProvisional,
      completedOn: draft.completedOn || null,
    }
    try {
      if (draft.id) {
        await update.mutateAsync({ id: draft.id, input: payload })
      } else {
        await create.mutateAsync(payload)
      }
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.")
    }
  }

  async function removeCurrent() {
    if (!draft?.id) return
    try {
      await remove.mutateAsync(draft.id)
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.")
    }
  }

  if (draft) {
    return (
      <Sheet
        open={open}
        onClose={() => setDraft(null)}
        title={draft.id ? "Modifier la date" : "Nouvelle date clé"}
        description="Les dates sont bornées à l'horizon du projet, fin 2028."
        footer={
          <div className="aura-stack" style={{ gap: 8 }}>
            <Button block loading={create.isPending || update.isPending} onClick={() => void save()}>
              Enregistrer
            </Button>
            {draft.id ? (
              <Button
                block
                variant="ghost"
                icon={<TrashIcon size={16} />}
                loading={remove.isPending}
                onClick={() => void removeCurrent()}
              >
                Supprimer cette date
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="aura-stack">
          <Input
            label="Libellé"
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            placeholder="Réunion de chantier"
          />
          <div className="app-two-col">
            <Input
              label="Date"
              type="date"
              min={PROJECT_START_DATE}
              max={PROJECT_END_DATE}
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
            <Select
              label="Catégorie"
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as KeyDate["kind"] })
              }
            >
              <option value="administratif">Administratif</option>
              <option value="technique">Technique</option>
              <option value="chantier">Chantier</option>
              <option value="livraison">Livraison</option>
            </Select>
          </div>
          <Textarea
            label="Note"
            rows={3}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            placeholder="Précisions, interlocuteur, condition…"
          />
          <div className="aura-row-flex" style={{ justifyContent: "space-between" }}>
            <span className="app-small">Date provisoire</span>
            <Switch
              checked={draft.isProvisional}
              onChange={(checked) => setDraft({ ...draft, isProvisional: checked })}
              label="Date provisoire"
            />
          </div>
          <Input
            label="Réalisée le (optionnel)"
            type="date"
            min={PROJECT_START_DATE}
            max={PROJECT_END_DATE}
            value={draft.completedOn}
            onChange={(event) => setDraft({ ...draft, completedOn: event.target.value })}
            hint="Laisser vide tant que l'étape n'est pas faite."
          />
          {error ? (
            <p className="aura-error-text" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Dates clés"
      description="Le fil rouge du projet, ajustable jusqu'en décembre 2028."
      footer={
        <Button
          block
          icon={<PlusIcon size={16} />}
          onClick={() => {
            setError(null)
            setDraft({ ...EMPTY })
          }}
        >
          Ajouter une date
        </Button>
      }
    >
      <div className="app-list">
        {dates.map((item) => (
          <div key={item.id} className={`app-date-row ${item.completedOn ? "is-done" : ""}`}>
            <p className="app-date-row__date">{formatDate(item.date, { year: "numeric" })}</p>
            <div className="app-date-row__body">
              <p className="app-date-row__title">
                <span className="app-date-row__label">{item.label}</span>
                {item.completedOn ? (
                  <Badge tone="success">
                    <CheckIcon size={12} />
                    Réalisé
                  </Badge>
                ) : item.isProvisional ? (
                  <Badge tone="warn">Provisoire</Badge>
                ) : null}
                {item.isSystem ? <Badge tone="neutral">Système</Badge> : null}
              </p>
              {item.note ? <p className="app-date-row__note">{item.note}</p> : null}
            </div>
            <Button size="sm" variant="ghost" aria-label={`Modifier ${item.label}`} onClick={() => edit(item)}>
              <EditIcon size={16} />
            </Button>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
