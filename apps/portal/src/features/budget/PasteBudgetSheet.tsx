import { useMemo, useState } from "react"
import {
  MAX_BULK_BUDGET_ITEMS,
  formatCents,
  type BudgetCreateInput,
  type BudgetKind,
} from "@casarenous/shared"
import { Badge, Button, Card, Select, Sheet, Textarea } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useCreateBudgetItems } from "@/hooks/useApi"
import { parseBudgetTable, type BudgetImportPreset } from "@/lib/budget-import"
import { formatDate } from "@/lib/dates"
import { randomUUID } from "@/lib/uuid"

const SAMPLE = `Libellé\tMontant\tÉchéance
Appel de fonds n°1 — signature\t85 500,00\t01/12/2026
Appel de fonds n°2 — fondations\t71 250,00\t01/03/2027
Appel de fonds n°3 — hors d'eau\t114 000,00\t01/09/2027`

const PRESETS: { value: BudgetImportPreset; label: string }[] = [
  { value: "auto", label: "Détection automatique" },
  { value: "label-amount-date", label: "Libellé · Montant · Échéance" },
  { value: "label-amount", label: "Libellé · Montant" },
  { value: "date-label-amount", label: "Échéance · Libellé · Montant" },
]

const KINDS: { value: BudgetKind; label: string }[] = [
  { value: "ccmi_call", label: "Appels de fonds CCMI" },
  { value: "change_order", label: "Avenants (+/-)" },
  { value: "invoice", label: "Factures d'achat" },
]

export function PasteBudgetSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [text, setText] = useState("")
  const [preset, setPreset] = useState<BudgetImportPreset>("auto")
  const [kind, setKind] = useState<BudgetKind>("ccmi_call")
  const [error, setError] = useState<string | null>(null)
  const createMany = useCreateBudgetItems()
  const { notify } = useNotify()

  const parsed = useMemo(() => parseBudgetTable(text, { preset }), [text, preset])
  const tooMany = parsed.rows.length > MAX_BULK_BUDGET_ITEMS
  const ready = parsed.rows.length > 0 && !tooMany

  const pendingAmounts = parsed.rows.filter((row) => row.amountCents === null).length
  const issueCount = parsed.rows.reduce((sum, row) => sum + row.issues.length, 0)

  async function save() {
    setError(null)
    if (!ready) return
    const payload: BudgetCreateInput[] = parsed.rows.map((row) => ({
      kind,
      label: row.label,
      reference: row.reference,
      amountCents: row.amountCents,
      dueDate: row.dueDate,
      paidAt: null,
      status: "planned",
      notes: row.issues.length ? row.issues.join(" · ") : null,
      clientId: randomUUID(),
    }))
    try {
      await createMany.mutateAsync(payload)
      notify({
        title: "Lignes importées",
        message: `${payload.length} mouvement(s) ajoutés au budget.`,
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
      title="Coller un tableau"
      description="Copie les cellules depuis Excel, Numbers ou Google Sheets."
      footer={
        <Button block loading={createMany.isPending} disabled={!ready} onClick={() => void save()}>
          {parsed.rows.length > 0
            ? `Importer ${parsed.rows.length} ligne${parsed.rows.length > 1 ? "s" : ""}`
            : "Importer"}
        </Button>
      }
    >
      <div className="aura-stack" style={{ gap: 16 }}>
        <Textarea
          label="Tableau collé"
          rows={7}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={SAMPLE}
          hint="Colonnes séparées par des tabulations (Ctrl+V depuis un tableur) ou par des points-virgules."
          containerClassName="app-mono-input"
        />

        <Select
          label="Type de mouvement"
          value={kind}
          onChange={(event) => setKind(event.target.value as BudgetKind)}
        >
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          label="Disposition des colonnes"
          value={preset}
          onChange={(event) => setPreset(event.target.value as BudgetImportPreset)}
        >
          {PRESETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {parsed.rows.length > 0 ? (
          <Card variant="soft">
            <p className="app-small">
              <strong>{parsed.rows.length}</strong> ligne(s) prête(s)
              {pendingAmounts > 0 ? ` · ${pendingAmounts} sans montant` : ""}
              {parsed.rejected.length > 0 ? ` · ${parsed.rejected.length} ignorée(s)` : ""}
            </p>
            <div className="app-list" style={{ marginTop: 8 }}>
              {parsed.rows.slice(0, 5).map((row, index) => (
                <div className="app-import-row" key={`${row.label}-${index}`}>
                  <span className="app-import-row__label">{row.label}</span>
                  <span className="app-import-row__meta">
                    {row.amountCents === null ? (
                      <Badge tone="warn">À compléter</Badge>
                    ) : (
                      <span className="app-num">{formatCents(row.amountCents)}</span>
                    )}
                    {row.dueDate ? (
                      <span className="app-tiny">{formatDate(row.dueDate)}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            {parsed.rows.length > 5 ? (
              <p className="app-tiny" style={{ marginTop: 6 }}>
                + {parsed.rows.length - 5} autre(s) ligne(s)
              </p>
            ) : null}
          </Card>
        ) : null}

        {tooMany ? (
          <p className="aura-error-text" role="alert">
            {parsed.rows.length} lignes détectées : maximum {MAX_BULK_BUDGET_ITEMS} par import.
            Découpe le tableau en deux.
          </p>
        ) : null}

        {parsed.rejected.length > 0 ? (
          <Card variant="soft">
            <p className="app-small" style={{ fontWeight: 600 }}>
              Lignes ignorées
            </p>
            <ul className="app-import-issues">
              {parsed.rejected.slice(0, 6).map((item) => (
                <li key={`${item.line}-${item.reason}`}>
                  Ligne {item.line} — {item.reason}
                </li>
              ))}
            </ul>
            {parsed.rejected.length > 6 ? (
              <p className="app-tiny">+ {parsed.rejected.length - 6} autre(s)</p>
            ) : null}
          </Card>
        ) : null}

        {issueCount > 0 ? (
          <p className="app-tiny">
            {issueCount} avertissement(s) seront conservés dans les notes des lignes importées.
          </p>
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
