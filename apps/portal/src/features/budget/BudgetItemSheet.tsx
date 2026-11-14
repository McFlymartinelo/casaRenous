import { useState } from "react"
import type { BudgetItem } from "@casarenous/shared"
import { centsToInput, parseEuroToCents } from "@casarenous/shared"
import { Badge, Button, Input, Select, Sheet, Textarea } from "@/aura/react"
import {
  useCreateBudgetItem,
  useDeleteBudgetItem,
  useUpdateBudgetItem,
} from "@/hooks/useApi"
import { randomUUID } from "@/lib/uuid"
import { TrashIcon } from "@/components/icons"

type Draft = {
  kind: BudgetItem["kind"]
  label: string
  reference: string
  amount: string
  dueDate: string
  paidAt: string
  status: BudgetItem["status"]
  notes: string
}

function draftFrom(item: BudgetItem | null): Draft {
  if (!item) {
    return {
      kind: "ccmi_call",
      label: "",
      reference: "",
      amount: "",
      dueDate: "",
      paidAt: "",
      status: "planned",
      notes: "",
    }
  }
  return {
    kind: item.kind,
    label: item.label,
    reference: item.reference ?? "",
    amount: centsToInput(item.amountCents),
    dueDate: item.dueDate ?? "",
    paidAt: item.paidAt ?? "",
    status: item.status,
    notes: item.notes ?? "",
  }
}

export function BudgetItemSheet({
  open,
  onClose,
  item,
  isNew,
}: {
  open: boolean
  onClose: () => void
  item: BudgetItem | null
  isNew: boolean
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(item))
  const [error, setError] = useState<string | null>(null)
  const create = useCreateBudgetItem()
  const update = useUpdateBudgetItem()
  const remove = useDeleteBudgetItem()

  const cents = parseEuroToCents(draft.amount)

  async function save() {
    setError(null)
    if (draft.label.trim().length < 2) {
      setError("Le libellé doit contenir au moins 2 caractères.")
      return
    }
    if (cents === null) {
      setError("Montant invalide. Exemple : 1 234,56 € ou -500,00 €.")
      return
    }
    if (cents === 0) {
      setError("Le montant ne peut pas être nul.")
      return
    }
    if (draft.kind === "ccmi_call" && cents < 0) {
      setError("Un appel de fonds CCMI est toujours positif.")
      return
    }
    if (draft.kind === "invoice" && cents < 0) {
      setError("Une facture d'achat est toujours positive.")
      return
    }
    try {
      if (isNew) {
        await create.mutateAsync({
          kind: draft.kind,
          label: draft.label.trim(),
          reference: draft.reference.trim() || null,
          amountCents: cents,
          dueDate: draft.dueDate || null,
          paidAt: draft.status === "paid" ? draft.paidAt || new Date().toISOString().slice(0, 10) : draft.paidAt || null,
          status: draft.status,
          notes: draft.notes.trim() || null,
          clientId: randomUUID(),
        })
      } else if (item) {
        await update.mutateAsync({
          id: item.id,
          input: {
            label: draft.label.trim(),
            reference: draft.reference.trim() || null,
            amountCents: cents,
            dueDate: draft.dueDate || null,
            paidAt: draft.paidAt || null,
            status: draft.status,
            notes: draft.notes.trim() || null,
          },
        })
      }
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.")
    }
  }

  async function removeCurrent() {
    if (!item) return
    try {
      await remove.mutateAsync(item.id)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.")
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? "Nouveau mouvement" : "Modifier le mouvement"}
      description="Les montants sont stockés en centimes entiers, sans flottant."
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
        {isNew ? (
          <Select
            label="Type"
            value={draft.kind}
            onChange={(event) =>
              setDraft({ ...draft, kind: event.target.value as BudgetItem["kind"] })
            }
          >
            <option value="ccmi_call">Appel de fonds CCMI</option>
            <option value="change_order">Avenant (+/-)</option>
            <option value="invoice">Facture d'achat</option>
          </Select>
        ) : (
          <div className="aura-row-flex">
            <Badge tone={draft.kind === "ccmi_call" ? "accent" : "neutral"}>
              {draft.kind === "ccmi_call"
                ? "Appel CCMI"
                : draft.kind === "invoice"
                  ? "Facture"
                  : "Avenant"}
            </Badge>
            <span className="app-tiny">Le type n'est pas modifiable.</span>
          </div>
        )}
        <Input
          label="Libellé"
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder="Appel de fonds n°2 — gros œuvre"
        />
        <Input
          label="Référence"
          value={draft.reference}
          onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
          placeholder="CCMI-02"
        />
        <Input
          label="Montant (€)"
          inputMode="decimal"
          value={draft.amount}
          onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
          hint={
            cents === null
              ? "Saisie libre : 1 234,56 €. Les avenants peuvent être négatifs."
              : `${cents.toLocaleString("fr-FR")} centimes`
          }
          placeholder="12 500,00"
        />
        <div className="app-two-col">
          <Input
            label="Échéance"
            type="date"
            value={draft.dueDate}
            onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          />
          <Select
            label="Statut"
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as BudgetItem["status"] })
            }
          >
            <option value="planned">Prévu</option>
            <option value="due">À payer</option>
            <option value="paid">Payé</option>
            <option value="cancelled">Annulé</option>
          </Select>
        </div>
        {draft.status === "paid" ? (
          <Input
            label="Payé le"
            type="date"
            value={draft.paidAt}
            onChange={(event) => setDraft({ ...draft, paidAt: event.target.value })}
            hint="Laisser vide pour utiliser la date du jour."
          />
        ) : null}
        <Textarea
          label="Notes"
          rows={3}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
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
