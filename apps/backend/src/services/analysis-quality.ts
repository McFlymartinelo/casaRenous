import type {
  AnalysisQuality,
  AnalysisQualitySummary,
  DocumentAnalysisStatus,
  InvoiceExtraction,
  InvoiceField,
} from "@casarenous/shared"

const FIELDS: InvoiceField[] = [
  "supplierName",
  "supplierTaxId",
  "invoiceNumber",
  "issuedOn",
  "dueDate",
  "totalCents",
  "vatCents",
]

const EMPTY_QUALITY: AnalysisQuality = {
  missingFields: [],
  lowConfidenceFields: [],
  hasAmount: false,
  hasDueDate: false,
  corrected: false,
  correctedAmountCents: null,
}

/** Résumé qualité calculé à partir de l'extraction déterministe. */
export function qualityFromExtraction(
  extraction: InvoiceExtraction | null,
  correction: Pick<AnalysisQuality, "corrected" | "correctedAmountCents"> = {
    corrected: false,
    correctedAmountCents: null,
  },
): AnalysisQuality {
  if (!extraction) {
    return { ...EMPTY_QUALITY, ...correction }
  }

  const missingFields: InvoiceField[] = []
  const lowConfidenceFields: InvoiceField[] = []
  for (const field of FIELDS) {
    const confidence = extraction.confidence[field]
    if (confidence === "missing") missingFields.push(field)
    else if (confidence !== "high") lowConfidenceFields.push(field)
  }

  return {
    missingFields,
    lowConfidenceFields,
    hasAmount: (extraction.amountDueCents ?? extraction.totalCents) !== null,
    hasDueDate: extraction.dueDate !== null,
    ...correction,
  }
}

export interface QualityRow {
  status: DocumentAnalysisStatus
  analyzedAt: Date
  documentId: string
  title: string
  quality: AnalysisQuality | null
  extraction: InvoiceExtraction | null
}

/** Recalcule pour les analyses antérieures au journal qualité. */
export function qualityOf(row: QualityRow): AnalysisQuality {
  return row.quality ?? qualityFromExtraction(row.extraction)
}

export function summarizeQuality(rows: QualityRow[]): AnalysisQualitySummary {
  const stats = new Map<InvoiceField, { missing: number; low: number }>(
    FIELDS.map((field) => [field, { missing: 0, low: 0 }]),
  )

  let ready = 0
  let unsupported = 0
  let failed = 0
  let corrected = 0
  let missingAmount = 0
  let missingDueDate = 0
  let missingSupplier = 0

  for (const row of rows) {
    if (row.status === "ready") ready += 1
    else if (row.status === "unsupported") unsupported += 1
    else if (row.status === "failed") failed += 1

    // Un document non-facture est lu comme texte brut : il n'a pas de champs
    // de facture à qualifier et ne doit pas polluer le journal qualité.
    if (row.status === "ready" && !row.extraction) continue

    const quality = qualityOf(row)
    if (quality.corrected) corrected += 1
    if (row.status === "ready" && !quality.hasAmount) missingAmount += 1
    if (row.status === "ready" && !quality.hasDueDate) missingDueDate += 1
    if (quality.missingFields.includes("supplierName")) missingSupplier += 1

    for (const field of quality.missingFields) {
      const entry = stats.get(field)
      if (entry) entry.missing += 1
    }
    for (const field of quality.lowConfidenceFields) {
      const entry = stats.get(field)
      if (entry) entry.low += 1
    }
  }

  const recent = [...rows]
    .sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime())
    .slice(0, 20)
    .map((row) => {
      const quality = qualityOf(row)
      return {
        documentId: row.documentId,
        title: row.title,
        status: row.status,
        analyzedAt: row.analyzedAt.toISOString(),
        missingFields: quality.missingFields,
        corrected: quality.corrected,
      }
    })

  return {
    total: rows.length,
    ready,
    unsupported,
    failed,
    corrected,
    missingAmount,
    missingDueDate,
    missingSupplier,
    fields: FIELDS.map((field) => ({
      field,
      missing: stats.get(field)?.missing ?? 0,
      low: stats.get(field)?.low ?? 0,
    })),
    recent,
  }
}
