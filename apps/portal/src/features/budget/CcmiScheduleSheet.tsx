import { useMemo, useState } from "react"
import { formatCents, parseEuroToCents, type BudgetCreateInput } from "@casarenous/shared"
import { Badge, Button, Card, Input, Sheet } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { PlusIcon, TrashIcon } from "@/components/icons"
import { useCreateBudgetItems } from "@/hooks/useApi"
import {
  CCMI_SCHEDULE_TEMPLATE,
  buildCemiSchedule,
  sumRates,
  type CcmiLine,
} from "@/lib/budget-import"
import { randomUUID } from "@/lib/uuid"

interface DraftLine extends CcmiLine {
  key: string
}

function draftLines(lines: CcmiLine[]): DraftLine[] {
  return lines.map((line) => ({ ...line, key: randomUUID() }))
}

export function CemiScheduleSheet({
  open,
  onClose,
  existingCcmiCount,
}: {
  open: boolean
  onClose: () => void
  existingCcmiCount: number
}) {
  const [total, setTotal] = useState("")
  const [lines, setLines] = useState<DraftLine[]>(() => draftLines(CCMI_SCHEDULE_TEMPLATE))
  const [error, setError] = useState<string | null>(null)
  const createMany = useCreateBudgetItems()
  const { notify } = useNotify()

  const totalCents = parseEuroToCents(total)
  const rateSum = sumRates(lines.map((line) => ({ ...line, rate: Number(line.rate) || 0 })))
  const ready =
    totalCents !== null && totalCents > 0 && rateSum === 100 && lines.length > 0

  const preview = useMemo(() => {
    if (totalCents === null || totalCents <= 0) return []
    return buildCemiSchedule(
      totalCents,
      lines.map((line, index) => ({
        ...line,
        label: line.label.trim() || `Appel de fonds n°${index + 1}`,
        rate: Number(line.rate) || 0,
      })),
    )
  }, [totalCents, lines])

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        key: randomUUID(),
        label: `Appel de fonds n°${current.length + 1}`,
        rate: 0,
        dueDate: null,
      },
    ])
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  async function save() {
    setError(null)
    if (totalCents === null || totalCents <= 0) {
      setError("Saisis le montant total du CCMI (exemple : 285 000,00 €).")
      return
    }
    if (rateSum !== 100) {
      setError(`Les parts doivent totaliser 100 % (actuellement ${rateSum} %).`)
      return
    }
    if (!preview.length) {
      setError("Aucune ligne à créer.")
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const payload: BudgetCreateInput[] = preview.map((row) => {
      const past = row.dueDate !== null && row.dueDate < today
      return {
        kind: "ccmi_call" as const,
        label: row.label,
        reference: row.reference,
        amountCents: row.amountCents,
        dueDate: row.dueDate,
        paidAt: past ? row.dueDate : null,
        status: past ? ("paid" as const) : ("planned" as const),
        notes: null,
        clientId: randomUUID(),
      }
    })
    try {
      await createMany.mutateAsync(payload)
      notify({
        title: "Échéancier créé",
        message: `${payload.length} appels de fonds ajoutés au budget.`,
        tone: "success",
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import impossible.")
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Échéancier CCMI"
      description="Un seul montant à saisir : l'app répartit les appels de fonds."
      footer={
        <Button block loading={createMany.isPending} disabled={!ready} onClick={() => void save()}>
          {preview.length > 0
            ? `Créer ${preview.length} appel${preview.length > 1 ? "s" : ""} de fonds`
            : "Créer l'échéancier"}
        </Button>
      }
    >
      <div className="aura-stack" style={{ gap: 16 }}>
        <Input
          label="Montant total du CCMI (€)"
          inputMode="decimal"
          value={total}
          onChange={(event) => setTotal(event.target.value)}
          placeholder="285 000,00"
          hint={
            totalCents === null
              ? "Le prix de la maison, avenants non compris."
              : formatCents(totalCents)
          }
        />

        {existingCcmiCount > 0 ? (
          <Card variant="soft">
            <p className="app-small">
              <strong>{existingCcmiCount} appel(s) CCMI</strong> existent déjà. Vérifie que tu
              n'ajoutes pas un doublon avant de valider.
            </p>
          </Card>
        ) : null}

        <div>
          <div className="app-section-head" style={{ marginBottom: 8 }}>
            <div>
              <p className="app-kicker">Répartition</p>
              <p className="app-small app-muted">
                Échéancier légal type d'un CCMI avec plan — à aligner sur ton contrat.
              </p>
            </div>
            <Badge tone={rateSum === 100 ? "success" : "warn"}>{rateSum} %</Badge>
          </div>

          <div className="app-ccmi-list">
            {lines.map((line, index) => (
              <div className="app-ccmi-row" key={line.key}>
                <div className="app-ccmi-row__head">
                  <span className="app-ccmi-row__index">{index + 1}</span>
                  <Input
                    containerClassName="app-ccmi-row__label"
                    aria-label={`Libellé de l'appel ${index + 1}`}
                    value={line.label}
                    onChange={(event) => updateLine(line.key, { label: event.target.value })}
                  />
                  <span className="app-ccmi-row__amount app-num">
                    {preview[index]?.amountCents != null
                      ? formatCents(preview[index]?.amountCents ?? 0)
                      : "—"}
                  </span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      className="aura-iconbtn"
                      aria-label={`Supprimer l'appel ${index + 1}`}
                      onClick={() => removeLine(line.key)}
                    >
                      <TrashIcon size={15} />
                    </button>
                  ) : null}
                </div>
                <div className="app-two-col">
                  <Input
                    label="Part (%)"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.5"
                    value={String(line.rate)}
                    onChange={(event) =>
                      updateLine(line.key, { rate: Number(event.target.value) })
                    }
                  />
                  <Input
                    label="Échéance"
                    type="date"
                    value={line.dueDate ?? ""}
                    onChange={(event) =>
                      updateLine(line.key, { dueDate: event.target.value || null })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            block
            size="sm"
            variant="ghost"
            icon={<PlusIcon size={16} />}
            style={{ marginTop: 8 }}
            onClick={addLine}
          >
            Ajouter un appel
          </Button>
        </div>

        {preview.length > 0 ? (
          <Card variant="soft">
            <p className="app-small">
              Total réparti :{" "}
              <strong className="app-num">
                {formatCents(preview.reduce((sum, row) => sum + (row.amountCents ?? 0), 0))}
              </strong>
              {totalCents !== null && totalCents > 0
                ? ` sur ${formatCents(totalCents)} saisis.`
                : "."}
            </p>
            <p className="app-tiny" style={{ marginTop: 4 }}>
              Les lignes datées dans le passé sont enregistrées comme payées.
            </p>
          </Card>
        ) : null}

        {error ? (
          <p className="aura-error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
