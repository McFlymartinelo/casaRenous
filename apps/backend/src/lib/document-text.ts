import { extractText, getDocumentProxy } from "unpdf"

/**
 * Extraction de la couche texte d'un document.
 *
 * v0 : les PDF uniquement. Les formats bureautiques (DOCX/XLSX) et les
 * photos de factures nécessitent un OCR et sont explicitement refusés avec
 * un message clair, plutôt que de produire un résultat vide trompeur.
 */

export const PDF_MIME = "application/pdf"
export const TEXT_ENGINE = "unpdf"

const MAX_TEXT_CHARS = 60_000
const PARSE_TIMEOUT_MS = 15_000

export type TextExtractionResult =
  | { ok: true; text: string; pages: number }
  | {
      ok: false
      reason: "unsupported_format" | "scanned" | "invalid_pdf"
      message: string
    }

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("pdf_timeout")),
        ms,
      )
      timer.unref?.()
    }),
  ])
}

export async function extractTextFromDocument(
  buffer: Buffer,
  mime: string,
): Promise<TextExtractionResult> {
  if (mime !== PDF_MIME) {
    return {
      ok: false,
      reason: "unsupported_format",
      message:
        "Seuls les PDF sont lus pour l'instant. DOCX, XLSX et photos de facture arriveront avec l'OCR.",
    }
  }

  let text = ""
  let pages = 0
  try {
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const pdf = await getDocumentProxy(data)
    const result = await withTimeout(
      extractText(pdf, { mergePages: true }),
      PARSE_TIMEOUT_MS,
    )
    pages = result.totalPages
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text
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
      message:
        "Aucune couche texte : ce PDF est probablement une image scannée. L'OCR n'est pas encore disponible.",
    }
  }

  return { ok: true, text, pages }
}
