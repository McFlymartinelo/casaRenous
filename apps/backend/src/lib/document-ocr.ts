import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { getDocumentProxy, renderPageAsImage } from "unpdf"

/**
 * OCR **local** des PDF scannés (aucune donnée n'est envoyée à un service
 * externe). Les pages sont rendues en image par unpdf/pdf.js puis lues par
 * Tesseract avec le modèle français embarqué dans les dépendances npm.
 *
 * Le worker est coûteux à démarrer (chargement du modèle) : on le garde en
 * singleton et on le réutilise pour toutes les pages et tous les documents.
 */

const require = createRequire(import.meta.url)
const tesseract = require("tesseract.js") as typeof import("tesseract.js")
const frenchData = require("@tesseract.js-data/fra") as {
  code: string
  langPath: string
  gzip: boolean
}

type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>
type OcrWorker = Awaited<ReturnType<typeof tesseract.createWorker>>

const MAX_OCR_PAGES = 80
const RENDER_SCALE = 2
const PAGE_TIMEOUT_MS = 25_000
const TOTAL_TIMEOUT_MS = 5 * 60_000

let workerPromise: Promise<OcrWorker> | null = null

function cachePath(): string {
  return process.env.TESSERACT_CACHE_DIR ?? path.join(tmpdir(), "casarenous-tesseract")
}

async function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = tesseract
      .createWorker(frenchData.code, 1, {
        langPath: frenchData.langPath,
        gzip: frenchData.gzip,
        cachePath: cachePath(),
        logger: () => {},
      })
      .catch((error: unknown) => {
        workerPromise = null
        throw error
      })
  }
  return workerPromise
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms)
      timer.unref?.()
    }),
  ])
}

/**
 * Renvoie le texte reconnu page par page, ou `null` si l'OCR échoue / n'y
 * trouve rien. `pages` est le nombre de pages réellement lues.
 */
export async function ocrScannedPdf(pdf: PdfProxy): Promise<{ text: string; pages: number } | null> {
  const totalPages = Math.min(pdf.numPages, MAX_OCR_PAGES)
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  const worker = await getWorker()

  const chunks: string[] = []
  let readPages = 0

  for (let page = 1; page <= totalPages; page += 1) {
    if (Date.now() > deadline) break
    try {
      const image = await withTimeout(
        renderPageAsImage(pdf, page, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale: RENDER_SCALE,
          format: "png",
        }),
        PAGE_TIMEOUT_MS,
        "pdf_render_timeout",
      )
      const { data } = await withTimeout(
        worker.recognize(image),
        PAGE_TIMEOUT_MS,
        "ocr_timeout",
      )
      const text = data.text.trim()
      if (text) chunks.push(text)
      readPages += 1
    } catch {
      // Une page illisible ne doit pas faire échouer tout le document : on
      // continue avec les suivantes et on garde ce qui a été reconnu.
      continue
    }
  }

  const text = chunks.join("\n").trim()
  if (!text || readPages === 0) return null
  return { text, pages: readPages }
}

/** Libère le worker (utile pour les tests et l'arrêt propre du serveur). */
export async function closeOcrWorker(): Promise<void> {
  const pending = workerPromise
  workerPromise = null
  if (!pending) return
  try {
    await (await pending).terminate()
  } catch {
    // Le worker a déjà pu être arrêté.
  }
}
