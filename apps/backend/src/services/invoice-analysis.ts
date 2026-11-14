import { and, eq, isNull } from "drizzle-orm"
import {
  InvoiceExtractionSchema,
  type DocumentAnalysis,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { documentAnalyses, documents } from "../db/schema.js"
import { extractTextFromDocument, TEXT_ENGINE } from "../lib/document-text.js"
import { ApiError } from "../lib/errors.js"
import {
  INVOICE_ENGINE,
  isUsableInvoiceText,
  parseInvoiceText,
} from "../lib/invoice-parser.js"
import { toDocumentAnalysis } from "../lib/serializers.js"
import { encryptionKey, readEncrypted } from "../lib/uploads.js"

export interface DocumentAnalysisOutcome {
  analysis: DocumentAnalysis
  /** Statut retenu pour l'audit et les métriques. */
  status: DocumentAnalysis["status"]
  textLength: number
}

/**
 * Lit un document chiffré, en extrait le texte et applique le moteur
 * déterministe. Le résultat est mis en cache dans `document_analyses`
 * (une ligne par document, remplacée à chaque nouvelle analyse).
 *
 * v0 synchrone : l'extraction d'un PDF de facture prend quelques dizaines
 * de millisecondes. Le passage à une file de jobs se fera avec le LLM local.
 */
export async function analyzeDocument(
  db: Database,
  env: Env,
  documentId: string,
): Promise<DocumentAnalysisOutcome> {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
    .limit(1)

  if (!document) {
    throw ApiError.notFound("Document introuvable", "document_not_found")
  }

  const key = encryptionKey(env)
  const buffer = await readEncrypted(
    env.UPLOAD_DIR,
    document.storageKey,
    key,
    document.encIv,
    document.encTag,
  )

  const extracted = await extractTextFromDocument(buffer, document.mime)

  let status: DocumentAnalysis["status"] = "ready"
  let textLength = 0
  let message: string | null = null
  let extraction: DocumentAnalysis["extraction"] = null
  let engine = `${INVOICE_ENGINE}+${TEXT_ENGINE}`

  if (!extracted.ok) {
    status = extracted.reason === "invalid_pdf" ? "failed" : "unsupported"
    message = extracted.message
    engine = TEXT_ENGINE
  } else {
    textLength = extracted.text.length
    if (!isUsableInvoiceText(extracted.text)) {
      status = "unsupported"
      message =
        "Le texte extrait est trop court pour être une facture exploitable. Le document est peut-être scanné."
    } else {
      const parsed = InvoiceExtractionSchema.safeParse(parseInvoiceText(extracted.text))
      if (parsed.success) {
        extraction = parsed.data
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

  const [row] = await db
    .insert(documentAnalyses)
    .values({
      documentId: document.id,
      status,
      engine,
      textLength,
      extraction,
      message,
      analyzedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: documentAnalyses.documentId,
      set: {
        status,
        engine,
        textLength,
        extraction,
        message,
        analyzedAt: new Date(),
      },
    })
    .returning()

  if (!row) {
    throw ApiError.internal("Analyse impossible à enregistrer", "analysis_failed")
  }

  return { analysis: toDocumentAnalysis(row), status, textLength }
}
