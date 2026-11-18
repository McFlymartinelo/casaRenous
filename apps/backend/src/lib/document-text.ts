import { extractText, getDocumentProxy } from "unpdf"
import { ocrScannedPdf } from "./document-ocr.js"

/**
 * Extraction de la couche texte d'un document, avec repli OCR pour les PDF
 * scannés (image sans texte sélectionnable).
 *
 * L'OCR est local (Tesseract) : le document ne quitte jamais le serveur.
 * Les formats bureautiques (DOCX/XLSX) restent refusés avec un message clair.
 */

export const PDF_MIME = "application/pdf"
export const TEXT_ENGINE = "unpdf"
export const OCR_ENGINE = "tesseract-fr"

const MAX_TEXT_CHARS = 60_000
const PARSE_TIMEOUT_MS = 15_000

export type TextExtractionResult =
  | { ok: true; text: string; pages: number; source: "text" | "ocr" }
  | {
      ok: false
      reason: "unsupported_format" | "scanned" | "invalid_pdf"
      message: string
    }

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("pdf_timeout")), ms)
      timer.unref?.()
    }),
  ])
}

export interface ExtractOptions {
  /** Autoriser l'OCR quand le PDF n'a pas de couche texte. Désactivé par défaut. */
  ocr?: boolean
}

export async function extractTextFromDocument(
  buffer: Buffer,
  mime: string,
  options: ExtractOptions = {},
): Promise<TextExtractionResult> {
  if (mime !== PDF_MIME) {
    return {
      ok: false,
      reason: "unsupported_format",
      message:
        "Seuls les PDF sont lus pour l'instant. DOCX, XLSX et photos de facture arriveront prochainement.",
    }
  }

  let text = ""
  let pages = 0
  try {
    // Copie obligatoire : pdf.js transfère l'ArrayBuffer à son worker, ce qui
    // détache le Buffer d'origine et rend une seconde ouverture impossible.
    const data = new Uint8Array(buffer)
    const pdf = await getDocumentProxy(data)
    const result = await withTimeout(
      extractText(pdf, { mergePages: true }),
      PARSE_TIMEOUT_MS,
    )
    pages = result.totalPages
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text

    if (!text.trim() && options.ocr) {
      const ocr = await ocrScannedPdf(pdf)
      if (ocr) {
        return {
          ok: true,
          text: ocr.text.slice(0, MAX_TEXT_CHARS),
          pages: ocr.pages,
          source: "ocr",
        }
      }
      return {
        ok: false,
        reason: "scanned",
        message:
          "Ce PDF est une image scannée et la reconnaissance de texte n'a rien pu lire. Vérifie la qualité du scan.",
      }
    }
  } catch {
    return {
      ok: false,
      reason: "invalid_pdf",
      message:
        "Le PDF n'a pas pu être ouvert : fichier corrompu, protégé par mot de passe ou illisible.",
    }
  }

  text = text.slice(0, MAX_TEXT_CHARS)
  if (!text.trim()) {
    return {
      ok: false,
      reason: "scanned",
      message: "Aucune couche texte : ce PDF est probablement une image scannée.",
    }
  }

  return { ok: true, text, pages, source: "text" }
}
