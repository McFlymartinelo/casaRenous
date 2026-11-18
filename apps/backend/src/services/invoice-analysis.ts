import { and, eq, isNull } from "drizzle-orm"
import {
  InvoiceExtractionSchema,
  type DocumentAnalysis,
  type Env,
  type ReservedWork,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { documentAnalyses, documents } from "../db/schema.js"
import {
  extractTextFromDocument,
  OCR_ENGINE,
  PDF_MIME,
  TEXT_ENGINE,
  type TextExtractionResult,
} from "../lib/document-text.js"
import { buildDocumentSummary } from "../lib/document-summary.js"
import { ApiError } from "../lib/errors.js"
import {
  INVOICE_ENGINE,
  isInvoiceLike,
  isUsableInvoiceText,
  parseInvoiceText,
} from "../lib/invoice-parser.js"
import { toDocumentAnalysis } from "../lib/serializers.js"
import { encryptionKey, readEncrypted } from "../lib/uploads.js"
import { qualityFromExtraction } from "./analysis-quality.js"

export interface DocumentAnalysisOutcome {
  analysis: DocumentAnalysis
  /** Statut retenu pour l'audit et les métriques. */
  status: DocumentAnalysis["status"]
  textLength: number
}

type StoredDocument = typeof documents.$inferSelect

const inFlight = new Set<string>()

async function loadDocument(
  db: Database,
  documentId: string,
): Promise<StoredDocument> {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
    .limit(1)

  if (!document) {
    throw ApiError.notFound("Document introuvable", "document_not_found")
  }
  return document
}

async function readDocument(env: Env, document: StoredDocument): Promise<Buffer> {
  return readEncrypted(
    env.UPLOAD_DIR,
    document.storageKey,
    encryptionKey(env),
    document.encIv,
    document.encTag,
  )
}

interface ResultInput {
  status: DocumentAnalysis["status"]
  engine: string
  textLength: number
  text: string | null
  summary: DocumentAnalysis["summary"]
  extraction: DocumentAnalysis["extraction"]
  message: string | null
}

async function storeResult(
  db: Database,
  document: StoredDocument,
  input: ResultInput,
): Promise<DocumentAnalysisOutcome> {
  const [previous] = await db
    .select({
      quality: documentAnalyses.quality,
      reservedWorksOverride: documentAnalyses.reservedWorksOverride,
    })
    .from(documentAnalyses)
    .where(eq(documentAnalyses.documentId, document.id))
    .limit(1)

  const quality = qualityFromExtraction(input.extraction, {
    corrected: previous?.quality?.corrected ?? false,
    correctedAmountCents: previous?.quality?.correctedAmountCents ?? null,
  })

  // Les corrections manuelles des travaux réservés survivent à une ré-analyse.
  const override = previous?.reservedWorksOverride
  const summary =
    input.summary && override?.length
      ? { ...input.summary, reservedWorks: override, reservedWorksEdited: true }
      : input.summary

  const [row] = await db
    .insert(documentAnalyses)
    .values({
      documentId: document.id,
      ...input,
      summary,
      reservedWorksOverride: override ?? null,
      quality,
      analyzedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: documentAnalyses.documentId,
      set: { ...input, summary, reservedWorksOverride: override ?? null, quality, analyzedAt: new Date() },
    })
    .returning()

  if (!row) {
    throw ApiError.internal("Analyse impossible à enregistrer", "analysis_failed")
  }

  return { analysis: toDocumentAnalysis(row), status: row.status, textLength: row.textLength }
}

/**
 * Applique le moteur déterministe au texte extrait (avec ou sans OCR).
 * Un document qui n'est pas une facture est quand même « lu » : son texte est
 * conservé et affiché, sans fabriquer une extraction de facture vide.
 */
async function runAnalysis(
  db: Database,
  document: StoredDocument,
  extracted: TextExtractionResult,
): Promise<DocumentAnalysisOutcome> {
  let status: DocumentAnalysis["status"] = "ready"
  let textLength = 0
  let text: string | null = null
  let message: string | null = null
  let extraction: DocumentAnalysis["extraction"] = null
  let engine = TEXT_ENGINE

  if (!extracted.ok) {
    status = extracted.reason === "invalid_pdf" ? "failed" : "unsupported"
    message = extracted.message
    engine = extracted.reason === "scanned" ? OCR_ENGINE : TEXT_ENGINE
  } else {
    textLength = extracted.text.length
    text = extracted.text
    engine = extracted.source === "ocr" ? `${TEXT_ENGINE}+${OCR_ENGINE}` : TEXT_ENGINE

    if (!isInvoiceLike(extracted.text)) {
      message =
        "Document lu. Il ne semble pas s'agir d'une facture : le texte reconnu est affiché ci-dessous."
    } else if (!isUsableInvoiceText(extracted.text)) {
      status = "unsupported"
      message =
        "Le texte extrait est trop court pour être une facture exploitable. Le document est peut-être scanné."
    } else {
      const parsed = InvoiceExtractionSchema.safeParse(parseInvoiceText(extracted.text))
      if (parsed.success) {
        extraction = parsed.data
        engine = `${INVOICE_ENGINE}+${engine}`
      } else {
        // Filet de sécurité : le moteur ne doit jamais renvoyer un contrat
        // invalide au portail (montant hors bornes, date impossible…).
        status = "failed"
        message =
          "Les informations lues sont incohérentes (montant ou date hors bornes). Vérifie le document ou saisis le rappel manuellement."
        engine = INVOICE_ENGINE
      }
    }
  }

  const summary = extracted.ok
    ? buildDocumentSummary(extracted.text, document.title, extraction)
    : null

  return storeResult(db, document, { status, engine, textLength, text, summary, extraction, message })
}

/**
 * Analyse synchrone (texte déjà présent) — utilisée en interne et par les
 * scripts/tests. L'OCR est activée pour les PDF scannés.
 */
export async function analyzeDocument(
  db: Database,
  env: Env,
  documentId: string,
): Promise<DocumentAnalysisOutcome> {
  const document = await loadDocument(db, documentId)
  const buffer = await readDocument(env, document)
  const extracted = await extractTextFromDocument(buffer, document.mime, { ocr: true })
  return runAnalysis(db, document, extracted)
}

/** Écrit un résultat « en attente » pour qu'une analyse OCR puisse être polls. */
async function storePending(
  db: Database,
  document: StoredDocument,
): Promise<DocumentAnalysisOutcome> {
  return storeResult(db, document, {
    status: "pending",
    engine: OCR_ENGINE,
    textLength: 0,
    text: null,
    summary: null,
    extraction: null,
    message: "Lecture OCR en cours : les pages du document sont analysées…",
  })
}

/**
 * Point d'entrée de la route HTTP.
 *
 * - PDF avec couche texte → analyse synchrone (quelques ms, pas de changement).
 * - PDF scanné → l'OCR peut prendre plus d'une minute sur un long document :
 *   on renvoie immédiatement un statut `pending` et le travail continue en
 *   tâche de fond (le portail interroge alors GET /analysis). Cela évite le
 *   timeout de 75 s du reverse-proxy.
 */
export async function requestDocumentAnalysis(
  db: Database,
  env: Env,
  documentId: string,
): Promise<DocumentAnalysisOutcome> {
  const document = await loadDocument(db, documentId)
  const buffer = await readDocument(env, document)

  const probe = await extractTextFromDocument(buffer, document.mime)
  if (probe.ok || probe.reason !== "scanned" || document.mime !== PDF_MIME) {
    return runAnalysis(db, document, probe)
  }

  const pending = await storePending(db, document)
  if (inFlight.has(document.id)) return pending
  inFlight.add(document.id)

  void (async () => {
    try {
      const extracted = await extractTextFromDocument(buffer, document.mime, { ocr: true })
      await runAnalysis(db, document, extracted)
    } catch (error) {
      console.error("[document-ocr] analyse en échec", error)
      await storeResult(db, document, {
        status: "failed",
        engine: OCR_ENGINE,
        textLength: 0,
        text: null,
        summary: null,
        extraction: null,
        message: "La lecture OCR a échoué. Tu peux réessayer ou télécharger le document.",
      }).catch((cause: unknown) => console.error("[document-ocr] résultat non enregistré", cause))
    } finally {
      inFlight.delete(document.id)
    }
  })()

  return pending
}

/** Enregistre les corrections manuelles des lignes de travaux réservés. */
export async function saveReservedWorks(
  db: Database,
  documentId: string,
  items: ReservedWork[],
): Promise<DocumentAnalysis> {
  const [row] = await db
    .select()
    .from(documentAnalyses)
    .where(eq(documentAnalyses.documentId, documentId))
    .limit(1)
  if (!row) {
    throw ApiError.notFound("Analyse introuvable", "analysis_not_found")
  }

  const summary = row.summary
    ? { ...row.summary, reservedWorks: items, reservedWorksEdited: true }
    : null

  const [updated] = await db
    .update(documentAnalyses)
    .set({ reservedWorksOverride: items, summary })
    .where(eq(documentAnalyses.documentId, documentId))
    .returning()
  if (!updated) {
    throw ApiError.internal("Analyse impossible à enregistrer", "analysis_failed")
  }
  return toDocumentAnalysis(updated)
}
