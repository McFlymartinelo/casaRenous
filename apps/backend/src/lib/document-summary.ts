import {
  formatCents,
  type DocumentSummary,
  type InvoiceExtraction,
} from "@casarenous/shared"
import { parseAmountToCents } from "./invoice-parser.js"

/**
 * Récap lisible d'un document, calculé localement et de façon déterministe :
 * qui / quoi / où / combien, puis une description en quelques phrases.
 *
 * Aucun appel réseau, aucun LLM : le texte (éventuellement OCR) est la seule
 * source. Les résultats sont volontairement prudents — mieux vaut laisser un
 * champ vide que d'inventer un montant.
 */

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
}

function clean(value: string, max: number): string {
  return value
    .replace(/^[|«»"'\s_]+/, "")
    .replace(/[|«»"'\s_;]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, max)
    .trim()
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function findWho(lines: string[]): string | null {
  const owners: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const inline = /ma[iî]tre\(s\)?\s*d['’]?ouvrage\s*:\s*(.+)/i.exec(line)
    if (inline?.[1]) {
      const value = clean(inline[1], 160)
      if (value.length > 3) owners.push(value)
    }
    if (/immeuble\s+à\s+construire\s+pour\s+le\s+compte(?:\s+de)?\s*:\s*$/i.test(line)) {
      const next = clean(lines[index + 1] ?? "", 160)
      if (next.length > 3 && !/\d{4}/.test(next)) owners.push(next)
    }
  }

  const distinct = unique(owners)
  if (!distinct.length) return null
  const primary = distinct[0] ?? ""

  const builderLine = lines.find((line) => /\bS\.?\s?A\.?\s?P\.?\s?O\.?\b|\bSAPO\b/i.test(line))
  const builderMatch = builderLine ? /\b(S\.?\s?A\.?\s?P\.?\s?O\.?)/i.exec(builderLine) : null
  const builder = builderMatch?.[1] ? clean(builderMatch[1], 20) : null
  return builder && !primary.includes(builder)
    ? `${primary} — constructeur : ${builder}`
    : primary
}

function findWhere(lines: string[]): string | null {
  const candidates: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const inline = /(?:votre terrain est situé|lieu de construction|adresse du terrain)\s*:\s*(.+)/i.exec(line)
    if (inline?.[1]) candidates.push(clean(inline[1], 160))
    if (/^lieu de construction\s*:\s*$/i.test(line)) {
      candidates.push(clean([lines[index + 1], lines[index + 2]].filter(Boolean).join(" "), 160))
    }
  }
  const withPostalCode = candidates.find((value) => /\b\d{5}\b/.test(value))
  return withPostalCode ?? candidates[0] ?? null
}

type Kind = DocumentSummary["kind"]

function detectKind(text: string, invoice: boolean): Kind {
  if (invoice) return "invoice"
  if (/notice\s+descriptive|notice\s+d['’]?information|sapo\s+notice/i.test(text)) return "notice"
  if (/devis|proposition\s+(?:de\s+)?prix/i.test(text)) return "quote"
  if (/contrat\s+de\s+construction|ccmi/i.test(text)) return "contract"
  return "other"
}

function findWhat(lines: string[], kind: Kind, text: string, invoice: InvoiceExtraction | null): string | null {
  if (invoice) {
    const reference = invoice.invoiceNumber ? ` n° ${invoice.invoiceNumber}` : ""
    const date = invoice.issuedOn
      ? ` du ${invoice.issuedOn.split("-").reverse().join("/")}`
      : ""
    return `Facture${reference}${date}${invoice.lineCount ? ` — ${invoice.lineCount} lignes` : ""}`
  }

  const technical = lines
    .map((line) => /caractéristiques\s+techniques\s*:\s*(.+)/i.exec(line)?.[1])
    .find((value): value is string => Boolean(value))

  if (kind === "notice" || kind === "contract") {
    const ccmi = /contrat\s+de\s+construction\s+d['’]?une\s+maison\s+individuelle/i.test(text)
    const base = ccmi
      ? "Notice descriptive — contrat de construction d'une maison individuelle (CCMI)"
      : kind === "notice"
        ? "Notice descriptive du projet de construction"
        : "Contrat de construction"
    return technical
      ? `${base}. ${clean(technical, 180).replace(/\.+$/, "")}.`
      : `${base}.`
  }
  if (kind === "quote") return "Devis / proposition de prix"
  return clean(lines[0] ?? "", 200) || null
}

interface AmountRule {
  label: string
  pattern: RegExp
}

function centsFrom(match: RegExpExecArray | RegExpMatchArray | null): number | null {
  const raw = match?.[1]
  if (!raw) return null
  const cents = parseAmountToCents(raw)
  if (cents === null || Math.abs(cents) > 1_000_000_000) return null
  return cents
}

function findAmounts(text: string, invoice: InvoiceExtraction | null): DocumentSummary["amounts"] {
  if (invoice) {
    const values: DocumentSummary["amounts"] = []
    const due = invoice.amountDueCents ?? invoice.totalCents
    if (due !== null) values.push({ label: "Montant à régler", amountCents: due })
    if (invoice.totalCents !== null && invoice.totalCents !== due) {
      values.push({ label: "Total TTC", amountCents: invoice.totalCents })
    }
    if (invoice.vatCents !== null) values.push({ label: "TVA", amountCents: invoice.vatCents })
    return values
  }

  const rules: AmountRule[] = [
    // `tot` et non `total` : l'OCR produit parfois « Goûttotài ».
    { label: "Coût total", pattern: /(?:go[uû]t|co[uû]t)\s*tot/i },
    { label: "Prix convenu", pattern: /montant\s+du\s+prix\s+convenu/i },
    { label: "Travaux réservés", pattern: /co[uû]t\s+des\s+travaux\s+dont/i },
    { label: "Budget à prévoir", pattern: /budg[ée]ter\s+un\s+montant\s+de/i },
  ]

  const allLines = text.split(/\r?\n/)
  const values: DocumentSummary["amounts"] = []
  for (const rule of rules) {
    for (let index = 0; index < allLines.length; index += 1) {
      if (!rule.pattern.test(allLines[index] ?? "")) continue
      // Le montant peut être passé à la ligne suivante par l'OCR : on prend
      // le premier montant trouvé, sans empiéter sur la ligne suivante.
      let amounts: number[] = []
      for (const candidate of allLines.slice(index, index + 3)) {
        if (/\bcapital\b/i.test(candidate ?? "")) continue
        amounts = [...(candidate ?? "").matchAll(/([\d][\d\s]{2,12})\s*€/g)]
          .map((match) => centsFrom(match))
          .filter((value): value is number => value !== null && value > 0)
        if (amounts.length) break
      }
      if (!amounts.length) continue
      values.push({ label: rule.label, amountCents: Math.max(...amounts) })
      break
    }
  }
  return values.slice(0, 6)
}

export interface ReservedWorkItem {
  label: string
  amountCents: number
}

/**
 * Lignes détaillées de la colonne « travaux réservés » du tableau CCMI.
 * L'OCR les sort sous la forme « …description… x 5 000,00 ». On s'arrête à la
 * ligne des totaux pour ne pas ramasser les montants d'assurance en fin de pdf.
 */
export function extractReservedWorks(text: string): ReservedWorkItem[] {
  const allLines = text.split(/\r?\n/)
  const items: ReservedWorkItem[] = []

  // On parcourt tout le document : les lignes de tableau se reconnaissent à
  // leur montant final sans symbole €, ce qui les distingue des assurances et
  // autres montants narratifs (toujours accompagnés de €).
  for (const raw of allLines) {
    const line = raw.replace(/[\t ]+/g, " ").trim()
    if (/€/.test(line)) continue
    if (/\bcapital\b|\bsiren\b|\bsiret\b|\bp[rêe]t\b|\bsinistre\b/i.test(line)) continue

    const match = /([\d][\d\s]{0,9}[,.]\d{2})\s*[\]|)]?\s*$/.exec(line)
    if (!match) continue
    let label = line.slice(0, match.index)
    const separator = label.lastIndexOf("|")
    if (separator > -1) label = label.slice(separator + 1)
    label = label
      .replace(/^[^A-Za-zÀ-ÿ0-9]+/, "")
      .replace(/[\s|x\-–—]+$/, "")
      .trim()
    if (label.length < 8) continue

    const cents = parseAmountToCents(match[1] ?? "")
    if (cents === null || cents <= 0 || cents > 50_000_000) continue
    items.push({ label: clean(label, 200), amountCents: cents })
  }

  return items
}

function buildDescription(summary: Omit<DocumentSummary, "description">, invoice: InvoiceExtraction | null): string {
  if (invoice?.summary) return invoice.summary.slice(0, 1000)

  const parts: string[] = []
  parts.push(`${summary.title.replace(/\.+$/, "")}.`)
  if (summary.who) parts.push(`Concernant ${summary.who.replace(/\.+$/, "")}.`)
  if (summary.what) parts.push(`${summary.what.replace(/\.+$/, "")}.`)
  if (summary.where) parts.push(`Lieu : ${summary.where}.`)
  if (summary.amounts.length) {
    parts.push(
      `${summary.amounts.map((item) => `${item.label} : ${formatCents(item.amountCents)}`).join(", ")}.`,
    )
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 1000)
}

export function buildDocumentSummary(
  text: string,
  documentTitle: string,
  invoice: InvoiceExtraction | null = null,
): DocumentSummary {
  const lines = linesOf(text)
  const kind = detectKind(text, Boolean(invoice))
  const who = findWho(lines)
  const where = findWhere(lines)
  const what = findWhat(lines, kind, text, invoice)
  const amounts = findAmounts(text, invoice)

  const title =
    kind === "invoice" && invoice?.invoiceNumber
      ? `Facture ${invoice.invoiceNumber}`
      : kind === "notice"
        ? "Notice descriptive"
        : clean(documentTitle, 200) || clean(lines[0] ?? "", 200) || "Document"

  const base: Omit<DocumentSummary, "description"> = {
    kind,
    title,
    who,
    what,
    where,
    amounts,
    reservedWorks: extractReservedWorks(text),
    reservedWorksEdited: false,
  }
  return { ...base, description: buildDescription(base, invoice) }
}
