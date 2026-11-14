import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  formatCents,
  PROJECT_END_DATE,
  PROJECT_START_DATE,
  type Document,
  type InvoiceConfidence,
  type InvoiceExtraction,
} from "@casarenous/shared"
import { Badge, Button, Card, Input, Skeleton, Sheet, type BadgeTone } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { CalendarIcon, FileIcon, RefreshIcon } from "@/components/icons"
import { useAnalyzeDocument, useCreateMilestone } from "@/hooks/useApi"
import { api } from "@/lib/api-client"
import { formatDate } from "@/lib/dates"
import { downloadBlob } from "@/lib/media"

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
  const analyze = useAnalyzeDocument()
  const createMilestone = useCreateMilestone()
  const [dueDate, setDueDate] = useState("")
  const [downloading, setDownloading] = useState(false)

  const { mutate, data, isPending, error } = analyze
  const startedFor = useRef<string | null>(null)

  useEffect(() => {
    if (startedFor.current === document.id) return
    startedFor.current = document.id
    mutate(document.id)
  }, [document.id, mutate])

  const extraction = data?.extraction ?? null

  useEffect(() => {
    setDueDate(extraction?.dueDate ?? "")
  }, [extraction?.dueDate])

  const dueInRange = dueDate >= PROJECT_START_DATE && dueDate <= PROJECT_END_DATE

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

  async function createReminder() {
    if (!extraction || !dueDate) return
    const who = extraction.supplierName ?? document.title
    const reference = extraction.invoiceNumber ? ` — ${extraction.invoiceNumber}` : ""
    const parts = [
      extraction.supplierName ? `Fournisseur : ${extraction.supplierName}.` : null,
      extraction.invoiceNumber ? `Facture ${extraction.invoiceNumber}.` : null,
      extraction.amountDueCents !== null
        ? `Montant à régler : ${formatCents(extraction.amountDueCents)}.`
        : null,
      `Document : « ${document.title} ».`,
    ].filter((value): value is string => Boolean(value))

    try {
      await createMilestone.mutateAsync({
        title: `Payer ${who}${reference}`.slice(0, 160),
        description: parts.join(" ").slice(0, 2000),
        category: "administratif",
        status: "planned",
        plannedStart: dueDate,
        plannedEnd: dueDate,
        isKey: true,
        notifyDays: [7, 1],
        actualDate: null,
      })
      notify({
        title: "Rappel créé",
        message: `Échéance du ${formatDate(dueDate)} ajoutée au rétroplanning.`,
        tone: "success",
      })
      onClose()
    } catch (cause) {
      notify({
        title: "Rappel impossible",
        message: cause instanceof Error ? cause.message : "Réessaie dans un instant.",
        tone: "danger",
      })
    }
  }

  const footer = extraction ? (
    <div className="app-stack app-stack--tight">
      <Input
        label="Date d'échéance du rappel"
        type="date"
        value={dueDate}
        min={PROJECT_START_DATE}
        max={PROJECT_END_DATE}
        onChange={(event) => setDueDate(event.target.value)}
        hint={
          dueInRange
            ? undefined
            : `Le rétroplanning n'accepte que les dates entre le ${formatDate(PROJECT_START_DATE)} et le ${formatDate(PROJECT_END_DATE)}.`
        }
      />
      <Button
        block
        icon={<CalendarIcon size={18} />}
        loading={createMilestone.isPending}
        disabled={!dueInRange || !extraction}
        onClick={() => void createReminder()}
      >
        Créer le rappel d'échéance
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
              {error instanceof Error ? error.message : "Le document n'a pas pu être lu."}
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
