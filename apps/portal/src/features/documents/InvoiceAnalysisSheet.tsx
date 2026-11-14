import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  centsToInput,
  formatCents,
  parseEuroToCents,
  PROJECT_END_DATE,
  PROJECT_START_DATE,
  type Document,
  type InvoiceConfidence,
  type InvoiceExtraction,
} from "@casarenous/shared"
import { Badge, Button, Card, Input, Skeleton, Sheet, type BadgeTone } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useAuth } from "@/auth/AuthProvider"
import {
  CalendarIcon,
  FileIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  WalletIcon,
} from "@/components/icons"
import { useAnalyzeDocument, useCreateBudgetItem, useCreateMilestone } from "@/hooks/useApi"
import { api } from "@/lib/api-client"
import { formatDate } from "@/lib/dates"
import { downloadBlob } from "@/lib/media"
import { randomUUID } from "@/lib/uuid"

const CONFIDENCE: Record<InvoiceConfidence, { label: string; tone: BadgeTone }> = {
  high: { label: "fiable", tone: "success" },
  medium: { label: "à vérifier", tone: "warn" },
  low: { label: "incertain", tone: "warn" },
  missing: { label: "non trouvé", tone: "neutral" },
}

function ConfidenceBadge({ value }: { value: InvoiceConfidence }) {
  const meta = CONFIDENCE[value]
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

/** Ne jamais afficher le JSON brut de Zod dans une fiche utilisateur. */
function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (!message || message.trim().startsWith("[") || message.includes('"code"')) {
    return "La lecture a échoué : les informations détectées sont incohérentes. Tu peux réessayer ou télécharger le document."
  }
  return message
}

function Field({
  label,
  children,
  confidence,
}: {
  label: string
  children: ReactNode
  confidence: InvoiceConfidence
}) {
  return (
    <div className="app-analysis-field">
      <span className="app-kicker">{label}</span>
      <span className="app-analysis-field__value">
        <span>{children}</span>
        <ConfidenceBadge value={confidence} />
      </span>
    </div>
  )
}

function ExtractionView({
  extraction,
  document,
}: {
  extraction: InvoiceExtraction
  document: Document
}) {
  return (
    <div className="app-stack">
      <Card variant="soft">
        <p className="app-analysis-summary">{extraction.summary}</p>
      </Card>

      <div className="app-analysis-fields">
        <Field label="Fournisseur" confidence={extraction.confidence.supplierName}>
          {extraction.supplierName ?? "—"}
        </Field>
        <Field label="SIRET / SIREN" confidence={extraction.confidence.supplierTaxId}>
          {extraction.supplierTaxId ?? "—"}
        </Field>
        <Field label="Numéro de facture" confidence={extraction.confidence.invoiceNumber}>
          {extraction.invoiceNumber ?? "—"}
        </Field>
        <div className="app-two-col">
          <Field label="Date de facture" confidence={extraction.confidence.issuedOn}>
            {extraction.issuedOn ? formatDate(extraction.issuedOn) : "—"}
          </Field>
          <Field label="Échéance" confidence={extraction.confidence.dueDate}>
            {extraction.dueDate ? formatDate(extraction.dueDate) : "—"}
          </Field>
        </div>
        <div className="app-two-col">
          <Field label="Total TTC" confidence={extraction.confidence.totalCents}>
            {extraction.totalCents !== null ? formatCents(extraction.totalCents) : "—"}
          </Field>
          <Field label="À régler" confidence={extraction.confidence.totalCents}>
            {extraction.amountDueCents !== null ? formatCents(extraction.amountDueCents) : "—"}
          </Field>
        </div>
        <Field label="TVA" confidence={extraction.confidence.vatCents}>
          {extraction.vatCents !== null ? formatCents(extraction.vatCents) : "—"}
        </Field>
      </div>

      {extraction.lines.length ? (
        <div>
          <p className="app-kicker" style={{ marginBottom: 6 }}>
            {extraction.lineCount} ligne{extraction.lineCount > 1 ? "s" : ""} détectée
            {extraction.lineCount > 1 ? "s" : ""}
          </p>
          <div className="app-list">
            {extraction.lines.slice(0, 6).map((line, index) => (
              <div
                key={`${index}-${line.label}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: "var(--aura-text-sm)",
                }}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {line.label}
                </span>
                <span className="app-num" style={{ whiteSpace: "nowrap" }}>
                  {formatCents(line.amountCents)}
                </span>
              </div>
            ))}
          </div>
          {extraction.lines.length > 6 ? (
            <p className="app-tiny" style={{ marginTop: 6 }}>
              + {extraction.lines.length - 6} autre(s) ligne(s)
            </p>
          ) : null}
        </div>
      ) : null}

      {extraction.warnings.length ? (
        <Card variant="soft">
          <p className="app-kicker" style={{ marginBottom: 6 }}>
            Points à vérifier
          </p>
          <ul className="app-analysis-warnings">
            {extraction.warnings.map((warning) => (
              <li key={warning} className="app-warn-text">
                {warning}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="app-tiny">
        Lecture locale et déterministe ({document.originalName}) — aucun modèle externe, aucune
        donnée envoyée hors du serveur. Vérifie les montants avant de créer un rappel.
      </p>
    </div>
  )
}

export function InvoiceAnalysisSheet({
  document,
  onClose,
}: {
  document: Document
  onClose: () => void
}) {
  const { notify } = useNotify()
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const analyze = useAnalyzeDocument()
  const createMilestone = useCreateMilestone()
  const createBudgetItem = useCreateBudgetItem()
  const [amount, setAmount] = useState("")
  const [rows, setRows] = useState<{ date: string; amount: string }[]>([
    { date: "", amount: "" },
  ])
  const [downloading, setDownloading] = useState(false)
  const [budgetAdded, setBudgetAdded] = useState(false)
  const [remindersDone, setRemindersDone] = useState(false)

  const { mutate, data, isPending, error } = analyze
  const startedFor = useRef<string | null>(null)

  useEffect(() => {
    if (startedFor.current === document.id) return
    startedFor.current = document.id
    mutate(document.id)
  }, [document.id, mutate])

  const extraction = data?.extraction ?? null

  useEffect(() => {
    if (!extraction) return
    const detected = extraction.amountDueCents ?? extraction.totalCents
    const value = detected !== null ? centsToInput(detected) : ""
    setAmount(value)
    setRows([{ date: extraction.dueDate ?? "", amount: value }])
    setBudgetAdded(false)
    setRemindersDone(false)
  }, [extraction])

  const totalCents = parseEuroToCents(amount)
  const rowCents = rows.map((row) => parseEuroToCents(row.amount))
  const allocatedCents = rowCents.reduce<number>((sum, cents) => sum + (cents ?? 0), 0)
  const remainingCents = totalCents !== null ? totalCents - allocatedCents : null
  const datesValid = rows.every(
    (row) => !row.date || (row.date >= PROJECT_START_DATE && row.date <= PROJECT_END_DATE),
  )
  const scheduleValid =
    totalCents !== null &&
    totalCents > 0 &&
    rows.length > 0 &&
    rowCents.every((cents) => cents !== null && cents > 0) &&
    remainingCents === 0 &&
    datesValid
  const datedRows = rows.filter((row, index) => {
    const cents = rowCents[index] ?? null
    return Boolean(row?.date) && cents !== null && cents > 0
  })
  const canAddBudget = isAdmin && scheduleValid && !budgetAdded
  const canAddReminders = scheduleValid && datedRows.length > 0 && !remindersDone

  async function downloadFile() {
    setDownloading(true)
    try {
      const blob = await api.documents.file(document.id)
      downloadBlob(blob, document.originalName)
    } catch {
      notify({ title: "Téléchargement impossible", message: "Réessaie dans un instant.", tone: "danger" })
    } finally {
      setDownloading(false)
    }
  }

  async function createReminders() {
    if (!extraction) return
    const who = extraction.supplierName ?? document.title
    const reference = extraction.invoiceNumber ? ` — ${extraction.invoiceNumber}` : ""
    const total = datedRows.length
    try {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        const cents = rowCents[index] ?? null
        if (!row?.date || cents === null || cents <= 0) continue
        const suffix = total > 1 ? ` (${index + 1}/${total})` : ""
        const parts = [
          extraction.supplierName ? `Fournisseur : ${extraction.supplierName}.` : null,
          extraction.invoiceNumber ? `Facture ${extraction.invoiceNumber}.` : null,
          `Montant : ${formatCents(cents)}.`,
          `Document : « ${document.title} ».`,
        ].filter((value): value is string => Boolean(value))
        await createMilestone.mutateAsync({
          title: `Payer ${who}${reference}${suffix}`.slice(0, 160),
          description: parts.join(" ").slice(0, 2000),
          category: "administratif",
          status: "planned",
          plannedStart: row.date,
          plannedEnd: row.date,
          isKey: true,
          notifyDays: [7, 1],
          actualDate: null,
        })
      }
      setRemindersDone(true)
      notify({
        title: total > 1 ? "Rappels créés" : "Rappel créé",
        message:
          total > 1
            ? `${total} échéances ajoutées au rétroplanning.`
            : `Échéance du ${formatDate(datedRows[0]?.date ?? "")} ajoutée au rétroplanning.`,
        tone: "success",
      })
    } catch (cause) {
      notify({
        title: "Rappel impossible",
        message: cause instanceof Error ? cause.message : "Réessaie dans un instant.",
        tone: "danger",
      })
    }
  }

  async function addToBudget() {
    if (!extraction || !scheduleValid) return
    const who = extraction.supplierName ?? document.title
    const reference = extraction.invoiceNumber ? ` — ${extraction.invoiceNumber}` : ""
    const today = new Date().toISOString().slice(0, 10)
    const total = rows.length
    try {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        const cents = rowCents[index] ?? null
        if (!row || cents === null) continue
        const dueDate = row.date || null
        // Une facture sans échéance est considérée réglée (ticket, achat
        // comptant) ; dès qu'une date existe, elle reste « à payer » tant
        // que l'admin ne l'a pas marquée payée.
        const settled = dueDate === null
        const suffix = total > 1 ? ` (${index + 1}/${total})` : ""
        await createBudgetItem.mutateAsync({
          kind: "invoice",
          label: `Facture ${who}${reference}${suffix}`.slice(0, 180),
          reference: extraction.invoiceNumber,
          amountCents: cents,
          dueDate,
          paidAt: settled ? (extraction.issuedOn ?? today) : null,
          status: settled ? "paid" : "due",
          attachmentDocumentId: document.id,
          notes: total > 1 ? `${extraction.summary} — échéance ${index + 1}/${total}` : extraction.summary,
          clientId: randomUUID(),
        })
      }
      setBudgetAdded(true)
      notify({
        title: "Ajouté au budget",
        message:
          total > 1
            ? `${formatCents(totalCents ?? 0)} en ${total} échéances intégrés au total de la maison.`
            : `${formatCents(totalCents ?? 0)} intégrés au total de la maison.`,
        tone: "success",
      })
    } catch (cause) {
      notify({
        title: "Ajout impossible",
        message: cause instanceof Error ? cause.message : "Réessaie dans un instant.",
        tone: "danger",
      })
    }
  }

  const footer = extraction ? (
    <div className="app-stack app-stack--tight">
      <Input
        label="Montant total de la facture (€)"
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        hint={
          totalCents === null
            ? "Saisis le montant total : il sera repris dans le budget de la maison."
            : `${formatCents(totalCents)} au total`
        }
      />

      <div className="app-stack app-stack--tight">
        <p className="app-kicker">Échéances</p>
        {rows.map((row, index) => (
          <div
            key={`echeance-${index}`}
            style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
          >
            <div style={{ flex: 1 }}>
              <Input
                label={`Date ${rows.length > 1 ? index + 1 : ""}`.trim()}
                type="date"
                min={PROJECT_START_DATE}
                max={PROJECT_END_DATE}
                value={row.date}
                onChange={(event) =>
                  setRows(
                    rows.map((item, position) =>
                      position === index ? { ...item, date: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                label="Montant (€)"
                inputMode="decimal"
                value={row.amount}
                onChange={(event) =>
                  setRows(
                    rows.map((item, position) =>
                      position === index ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            {rows.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Supprimer l'échéance ${index + 1}`}
                onClick={() => setRows(rows.filter((_, position) => position !== index))}
              >
                <TrashIcon size={16} />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          block
          size="sm"
          variant="ghost"
          icon={<PlusIcon size={16} />}
          onClick={() =>
            setRows([
              ...rows,
              {
                date: "",
                amount:
                  remainingCents !== null && remainingCents > 0
                    ? centsToInput(remainingCents)
                    : "",
              },
            ])
          }
        >
          Ajouter une échéance
        </Button>
        <p className="app-tiny">
          {remainingCents === null
            ? "Renseigne le montant total pour répartir les échéances."
            : remainingCents === 0
              ? `Réparti sur ${rows.length} échéance${rows.length > 1 ? "s" : ""}.`
              : remainingCents > 0
                ? `Reste à répartir : ${formatCents(remainingCents)}.`
                : `Dépassement de ${formatCents(Math.abs(remainingCents))}.`}
        </p>
        {!datesValid ? (
          <p className="app-tiny app-warn-text">
            Le rétroplanning n'accepte que les dates entre le {formatDate(PROJECT_START_DATE)} et
            le {formatDate(PROJECT_END_DATE)}.
          </p>
        ) : null}
      </div>

      {isAdmin ? (
        <Button
          block
          icon={<WalletIcon size={18} />}
          loading={createBudgetItem.isPending}
          disabled={!canAddBudget}
          onClick={() => void addToBudget()}
        >
          {budgetAdded ? "Ajouté au budget maison" : "Ajouter au budget maison"}
        </Button>
      ) : null}
      <Button
        block
        variant={isAdmin ? "outline" : "ghost"}
        icon={<CalendarIcon size={18} />}
        loading={createMilestone.isPending}
        disabled={!canAddReminders}
        onClick={() => void createReminders()}
      >
        {remindersDone
          ? "Rappels ajoutés au rétroplanning"
          : datedRows.length > 1
            ? `Créer ${datedRows.length} rappels d'échéance`
            : "Créer le rappel d'échéance"}
      </Button>
      <Button block variant="ghost" size="sm" loading={downloading} onClick={() => void downloadFile()}>
        Télécharger le document
      </Button>
    </div>
  ) : (
    <Button block variant="ghost" size="sm" loading={downloading} onClick={() => void downloadFile()}>
      Télécharger le document
    </Button>
  )

  return (
    <Sheet
      open
      onClose={onClose}
      title="Lecture de la facture"
      description={document.title}
      footer={footer}
    >
      {isPending ? (
        <div className="app-stack">
          <Skeleton height={72} />
          <Skeleton height={32} />
          <Skeleton height={32} />
          <p className="app-small">Lecture du document et extraction des montants…</p>
        </div>
      ) : error ? (
        <div className="app-stack">
          <Card variant="soft">
            <p className="app-small">
              {readableError(error)}
            </p>
          </Card>
          <Button block variant="outline" icon={<RefreshIcon size={16} />} onClick={() => mutate(document.id)}>
            Relancer la lecture
          </Button>
        </div>
      ) : data && extraction ? (
        <ExtractionView extraction={extraction} document={document} />
      ) : (
        <div className="app-stack">
          <Card variant="soft">
            <div className="app-section-head" style={{ marginBottom: 6 }}>
              <p className="aura-h3">Lecture impossible</p>
              <FileIcon size={18} />
            </div>
            <p className="app-small">
              {data?.message ??
                "Ce document n'a pas pu être interprété. Tu peux toujours le télécharger et le lire manuellement."}
            </p>
          </Card>
          <Button block variant="outline" icon={<RefreshIcon size={16} />} onClick={() => mutate(document.id)}>
            Réessayer
          </Button>
        </div>
      )}
    </Sheet>
  )
}
