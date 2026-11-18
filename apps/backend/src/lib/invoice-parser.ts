import {
  formatCents,
  type InvoiceConfidence,
  type InvoiceConfidenceMap,
  type InvoiceExtraction,
  type InvoiceLine,
} from "@casarenous/shared"

/**
 * Moteur de lecture de factures **sans IA**.
 *
 * Principe : le LLM ne doit jamais produire un montant. Ici, tout est
 * déterministe et testable — extraction de texte PDF, puis heuristiques
 * ancrées sur les libellés français (« total TTC », « net à payer »,
 * « échéance »). Chaque champ porte un niveau de confiance et le résultat
 * est toujours relu par un humain avant de créer un rappel.
 */

export const INVOICE_ENGINE = "heuristic-v1"

const MAX_TEXT_CHARS = 60_000
const MIN_USABLE_TEXT = 40
const MAX_LINES = 100

/**
 * Borne de plausibilité d'un montant de facture : 10 M€, alignée sur
 * `MoneyCents`. Les longs numéros (SIRET, TVA intracommunautaire, capital
 * social, RCS) dépassent presque toujours cette borne et sont ainsi écartés.
 */
const MAX_AMOUNT_CENTS = 1_000_000_000

function isPlausibleAmount(cents: number): boolean {
  return cents >= -MAX_AMOUNT_CENTS && cents <= MAX_AMOUNT_CENTS
}

/* ========================================================================== */
/*  Normalisation                                                             */
/* ========================================================================== */

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f\u2009\u2007]/g, " ")
    .slice(0, MAX_TEXT_CHARS)
}

/** Minuscule sans accents, pour comparer les libellés. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function meaningfulLines(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
}

/* ========================================================================== */
/*  Montants                                                                  */
/* ========================================================================== */

const AMOUNT_BODY = String.raw`-?\d{1,3}(?:[ \t]\d{3})*(?:[.,]\d{1,2})?`
const CURRENCY_AMOUNT = new RegExp(
  String.raw`(${AMOUNT_BODY})\s*(?:€|EUR\b|euros?\b)`,
  "gi",
)
const CURRENCY_PREFIX_AMOUNT = new RegExp(
  String.raw`(?:€|EUR\b)\s*(${AMOUNT_BODY})`,
  "gi",
)
const TAIL_AMOUNT = new RegExp(
  String.raw`(?<![\d.,])(${AMOUNT_BODY})\s*$`,
)

/** "1 234,56" / "1.234,56" / "1234.56" / "890" → centimes. */
export function parseAmountToCents(raw: string): number | null {
  let token = raw.replace(/[ \t]/g, "")
  const lastComma = token.lastIndexOf(",")
  const lastDot = token.lastIndexOf(".")

  if (lastComma > -1 && lastDot > -1) {
    token =
      lastComma > lastDot
        ? token.replace(/\./g, "").replace(",", ".")
        : token.replace(/,/g, "")
  } else if (lastComma > -1) {
    token = token.replace(",", ".")
  } else if (lastDot > -1) {
    // Un point suivi de trois chiffres est un séparateur de milliers.
    const decimals = token.length - lastDot - 1
    if (decimals === 3 && token.length > 4) token = token.replace(/\./g, "")
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(token)) return null
  const value = Number(token)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

function currencyAmounts(line: string): number[] {
  const found: number[] = []
  for (const match of line.matchAll(CURRENCY_AMOUNT)) {
    const cents = parseAmountToCents(match[1] ?? "")
    if (cents !== null && isPlausibleAmount(cents)) found.push(cents)
  }
  for (const match of line.matchAll(CURRENCY_PREFIX_AMOUNT)) {
    const cents = parseAmountToCents(match[1] ?? "")
    if (cents !== null && isPlausibleAmount(cents)) found.push(cents)
  }
  return found
}

/**
 * Montant nu en fin de ligne (« Maçonnerie fondations 1 450,00 »).
 * Exige un espace devant, pour ne pas découper « F-2026-042 ».
 */
function tailAmount(line: string): { cents: number; start: number; raw: string } | null {
  const match = TAIL_AMOUNT.exec(line)
  if (!match || match.index === undefined) return null
  const before = match.index === 0 ? "" : line[match.index - 1]
  if (before !== " ") return null
  const cents = parseAmountToCents(match[1] ?? "")
  if (cents === null || !isPlausibleAmount(cents)) return null
  return { cents, start: match.index, raw: match[1] ?? "" }
}

/* ========================================================================== */
/*  Dates                                                                     */
/* ========================================================================== */

interface FoundDate {
  iso: string
  raw: string
  index: number
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function datesInLine(line: string): FoundDate[] {
  const found: FoundDate[] = []
  const pattern = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})|(\d{4})-(\d{2})-(\d{2})/g
  for (const match of line.matchAll(pattern)) {
    let iso: string | null = null
    if (match[1]) {
      const day = Number(match[1])
      const month = Number(match[2])
      let year = Number(match[3])
      if (match[3]?.length === 2) year += year <= 79 ? 2000 : 1900
      iso = isoFromParts(year, month, day)
    } else if (match[4]) {
      iso = isoFromParts(Number(match[4]), Number(match[5]), Number(match[6]))
    }
    if (iso) found.push({ iso, raw: match[0], index: match.index ?? 0 })
  }
  return found
}

function addDays(iso: string, days: number): string | null {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return null
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return isoFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

function frenchDate(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

/* ========================================================================== */
/*  Libellés                                                                  */
/* ========================================================================== */

const DUE_LABEL =
  /(echeance|à regler|a regler|a payer|payable|date limite|due date|avant le|reglement|paiement|a recevoir)/
const ISSUE_LABEL =
  /(date de facture|date facture|facture du|emise le|date d emission|date d'emission|invoice date|date\s*:)/

const TOTAL_TTC_LABEL =
  /total\s*(?:ttc|t\.t\.c)\b|total\s*toutes\s*taxes|montant de la facture|montant total|gesamtbetrag|invoice total|total amount|amount due/
const TOTAL_SOFT_LABEL = /(montant total|total general|total facture|total de la facture)/
const TOTAL_HT_LABEL =
  /total\s*(?:ht|h\.t\.t?|hors taxe)|sous[- ]?total|somme nette|net amount|montant ht|net commercial/
const DUE_AMOUNT_LABEL =
  /(net a payer|montant du|montant a payer|reste a payer|solde a payer|total a payer|a payer au total|reglement percu|\bregle(?:ment)?\b|deja paye)/
const VAT_LABEL = /\b(tva|vat|taxe de vente|mwst|umsatzsteuer|sales tax)\b/
const VAT_IDENTIFIER =
  /\btva\b[^0-9]{0,20}\b(?:i\.?\s?c\.?|intracommunautaire)\b|\b(?:n[°o]|numero|no)\s*(?:de\s*)?tva\b/
const NON_ITEM_PREFIX =
  /^(facture|devis|avoir|bon de|commande|page |client|adresse|siret|siren|tva|iban|bic|tel|telephone|mail|e-?mail|site web|date|reference|ref\b|echéance|echeance|conditions|mode de paiement|dont |au capital|capital|rcs|ape |merci|systeme|votre facture|les conditions|informations|droit d)/

const LEGAL_FORM =
  /\b(SARL|SASU?|EURL|SCI|SNC|SELARL|SELAS|SCP|GAEC|SCEA|SCOP|EI|EIRL|GmbH|AG|KG|UG|BV|NV|Ltd|Limited|Inc|Srl|SpA|SA)\b/i
const SUPPLIER_LABEL =
  /^(?:vendeur|fournisseur|prestataire|[ée]metteur|soci[ée]t[ée]|raison sociale|entreprise|artisan)\s*:?\s*(.+)$/i

const INVOICE_NUMBER_STRONG =
  /(?:facture|invoice|avoir|devis)\s*(?:n[°o]?\.?|num[ée]ro|no\.?)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,24})/i
const INVOICE_NUMBER_SOFT =
  /(?:n[°o]|num[ée]ro|r[ée]f[ée]rence|\bref\b)\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,24})/i
const INVOICE_NUMBER_SHAPE = /^[A-Z]{1,5}[-_/]?\d{2,4}(?:[-_/]\d{1,6})?$|^\d{4}[-/]\d{2,6}$/

const SIRET_LABEL = /\bsiret\b[^0-9]{0,10}((?:\d[ \t]?){14})/i
const SIREN_LABEL = /\bsiren\b[^0-9]{0,10}((?:\d[ \t]?){9})/i
const SIRET_BARE = /\b(\d(?:[ \t]?\d){13})\b/

const NUMBER_STOPWORDS = new Set([
  "du",
  "de",
  "des",
  "le",
  "la",
  "les",
  "au",
  "aux",
  "en",
  "et",
  "pour",
  "date",
  "numero",
  "n",
  "no",
  "ttc",
  "ht",
  "tva",
  "client",
  "chantier",
  "page",
  "a",
  "sur",
  "montant",
  "total",
])

/* ========================================================================== */
/*  Détection par champ                                                       */
/* ========================================================================== */

function looksLikeDate(value: string): boolean {
  const token = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return true
  return /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(token)
}

function maxAbs(values: number[]): number {
  return values.reduce(
    (max, value) => (Math.abs(value) > Math.abs(max) ? value : max),
    values[0] ?? 0,
  )
}

/** Retire les taux (« 20,00 % ») avant de chercher un montant de TVA. */
function amountWithoutRates(line: string, currencyMarked: number[]): number | null {
  if (currencyMarked.length) return maxAbs(currencyMarked)
  const stripped = line.replace(/\d{1,3}(?:[.,]\d{1,2})?\s*%/g, " ")
  return tailAmount(stripped)?.cents ?? null
}

function cleanInvoiceNumber(raw: string | undefined): string | null {
  if (!raw) return null
  const token = raw.replace(/^[:\-–—#\s]+/, "").replace(/[.,;:]+$/, "").trim()
  if (token.length < 3 || token.length > 30) return null
  if (NUMBER_STOPWORDS.has(fold(token))) return null
  if (looksLikeDate(token)) return null
  if (/^\d{1,4}$/.test(token)) return null
  // Un numéro de facture contient toujours au moins un chiffre : évite les
  // faux positifs du type « facture fait office de garantie ».
  if (!/\d/.test(token)) return null
  return token
}

function findInvoiceNumber(
  lines: string[],
): { value: string | null; confidence: InvoiceConfidence } {
  for (const line of lines) {
    const match = INVOICE_NUMBER_STRONG.exec(line)
    const cleaned = cleanInvoiceNumber(match?.[1])
    if (cleaned) return { value: cleaned, confidence: "high" }
  }
  for (const line of lines) {
    const match = INVOICE_NUMBER_SOFT.exec(line)
    const cleaned = cleanInvoiceNumber(match?.[1])
    if (cleaned) return { value: cleaned, confidence: "medium" }
  }
  for (const line of lines.slice(0, 12)) {
    const token = line.trim()
    if (token.length > 24) continue
    if (INVOICE_NUMBER_SHAPE.test(token)) {
      const cleaned = cleanInvoiceNumber(token)
      if (cleaned) return { value: cleaned, confidence: "medium" }
    }
  }
  return { value: null, confidence: "missing" }
}

function cleanSupplier(raw: string): string | null {
  let value = raw
    .replace(/^[:\-–—\s*]+/, "")
    .replace(/\b(siret|siren|tva|n° tva|tel|telephone|mail)\b.*$/i, "")
    .replace(/[|,;:*.\-–—\s]+$/, "")
    .replace(/[ \t]+/g, " ")
    .trim()
  if (value.length < 2 || value.length > 120) return null
  if ((value.match(/[A-Za-zÀ-ÿ]/g) ?? []).length < 2) return null
  if (looksLikeDate(value)) return null
  if (/^[*#|]/.test(value)) return null
  // Code-barres, référence ou numéro de facture : pas de minuscule, ou
  // aucune espace et des chiffres.
  if (/^[A-Z0-9._/-]+$/.test(value) && /\d/.test(value)) return null
  if (!/\s/.test(value) && /\d/.test(value)) return null
  if (/^(facture|devis|avoir|bon de|page)\b/i.test(value)) return null
  // « ALTERNATE GmbH Philipp-Reis-Straße 2-3 - 35440 Linden » → « ALTERNATE GmbH »
  const international = value.match(
    /^(.*?\b(?:GmbH|AG|KG|UG|BV|NV|Ltd|Limited|Inc|Srl|SpA))\b(.*)$/i,
  )
  if (international && /\d/.test(international[2] ?? "")) value = international[1] ?? value
  value = value.slice(0, 120)
  return value
}

function findSupplier(
  lines: string[],
): { value: string | null; confidence: InvoiceConfidence } {
  for (const line of lines.slice(0, 25)) {
    const labelled = SUPPLIER_LABEL.exec(line) ? line : null
    if (labelled) {
      const colon = labelled.indexOf(":")
      const value = cleanSupplier(colon > -1 ? labelled.slice(colon + 1) : labelled)
      if (value) return { value, confidence: "high" }
    }
  }
  for (const line of lines.slice(0, 12)) {
    if (LEGAL_FORM.test(line)) {
      const value = cleanSupplier(line)
      if (value) return { value, confidence: "high" }
    }
  }
  for (const line of lines.slice(0, 6)) {
    const value = cleanSupplier(line)
    if (value) return { value, confidence: "medium" }
  }
  return { value: null, confidence: "missing" }
}

function findTaxId(
  lines: string[],
): { value: string | null; confidence: InvoiceConfidence } {
  // Un IBAN contient des suites de chiffres qui ressemblent à un SIRET.
  const text = lines
    .filter((line) => !/\b(iban|bic|compte bancaire|bank)\b/i.test(line))
    .join("\n")
  const siret = SIRET_LABEL.exec(text)
  if (siret?.[1]) {
    const digits = siret[1].replace(/\D/g, "")
    if (digits.length === 14) return { value: digits, confidence: "high" }
  }
  const siren = SIREN_LABEL.exec(text)
  if (siren?.[1]) {
    const digits = siren[1].replace(/\D/g, "")
    if (digits.length === 9) return { value: digits, confidence: "high" }
  }
  const bare = SIRET_BARE.exec(text)
  if (bare?.[1]) {
    const digits = bare[1].replace(/\D/g, "")
    if (digits.length === 14) return { value: digits, confidence: "medium" }
  }
  return { value: null, confidence: "missing" }
}

function findDates(
  lines: string[],
): {
  issuedOn: string | null
  dueDate: string | null
  issuedConfidence: InvoiceConfidence
  dueConfidence: InvoiceConfidence
  warnings: string[]
} {
  const warnings: string[] = []
  const issued: { iso: string; confidence: InvoiceConfidence }[] = []
  const due: { iso: string; confidence: InvoiceConfidence }[] = []
  const unlabelled: string[] = []
  let paymentTermDays: number | null = null
  let paymentOnReceipt = false

  lines.forEach((line, index) => {
    const folded = fold(line)
    const dates = datesInLine(line)
    if (!dates.length) {
      const term = /(\d{1,3})\s*jours?/.exec(folded)
      if (term?.[1]) {
        const days = Number(term[1])
        if (days > 0 && days <= 365) paymentTermDays = days
      }
      if (/a reception|des reception|comptant/.test(folded)) paymentOnReceipt = true
      return
    }

    const isDue = DUE_LABEL.test(folded)
    const isIssue = ISSUE_LABEL.test(folded)
    for (const date of dates) {
      if (isDue) due.push({ iso: date.iso, confidence: "high" })
      else if (isIssue) issued.push({ iso: date.iso, confidence: "high" })
      else if (index < 20) unlabelled.push(date.iso)
    }

    const term = /(\d{1,3})\s*jours?/.exec(folded)
    if (term?.[1]) {
      const days = Number(term[1])
      if (days > 0 && days <= 365) paymentTermDays = days
    }
    if (/a reception|des reception|comptant/.test(folded)) paymentOnReceipt = true
  })

  const issuedOn: string | null = issued[0]?.iso ?? unlabelled[0] ?? null
  let issuedConfidence: InvoiceConfidence = issued[0]
    ? "high"
    : issuedOn
      ? "medium"
      : "missing"

  let dueDate: string | null = null
  let dueConfidence: InvoiceConfidence = "missing"

  if (due.length) {
    const distinct = [...new Set(due.map((entry) => entry.iso))].sort()
    dueDate = distinct.at(-1) ?? null
    dueConfidence = "high"
    if (distinct.length > 1) {
      warnings.push(
        `Plusieurs échéances détectées : la plus lointaine (${frenchDate(distinct.at(-1) ?? "")}) a été retenue.`,
      )
    }
  } else if (issuedOn && paymentTermDays !== null) {
    dueDate = addDays(issuedOn, paymentTermDays)
    dueConfidence = dueDate ? "low" : "missing"
  } else if (issuedOn && paymentOnReceipt) {
    dueDate = issuedOn
    dueConfidence = "low"
  }

  if (!issuedOn && dueDate) {
    issuedConfidence = "missing"
  }
  if (issuedOn && dueDate && dueDate < issuedOn) {
    warnings.push("L'échéance détectée précède la date de facture : à vérifier.")
    dueConfidence = "low"
  }

  return { issuedOn, dueDate, issuedConfidence, dueConfidence, warnings }
}

interface AmountsResult {
  totalCents: number | null
  vatCents: number | null
  amountDueCents: number | null
  lines: InvoiceLine[]
  totalConfidence: InvoiceConfidence
  vatConfidence: InvoiceConfidence
  dueConfidence: InvoiceConfidence
  warnings: string[]
}

function findAmounts(lines: string[], hasEuroContext: boolean): AmountsResult {
  const warnings: string[] = []
  let ttc: { cents: number; confidence: InvoiceConfidence } | null = null
  let soft: { cents: number; confidence: InvoiceConfidence } | null = null
  let ht: number | null = null
  let vat: { cents: number; confidence: InvoiceConfidence; rated: boolean } | null = null
  let due: { cents: number; confidence: InvoiceConfidence } | null = null
  const items: InvoiceLine[] = []

  for (const line of lines) {
    const folded = fold(line)
    const amounts = currencyAmounts(line)
    const tail = hasEuroContext ? tailAmount(line) : null
    const primary = amounts.length ? maxAbs(amounts) : (tail?.cents ?? null)

    if (primary === null) continue

    if (DUE_AMOUNT_LABEL.test(folded)) {
      if (!due || Math.abs(primary) > Math.abs(due.cents)) {
        due = { cents: primary, confidence: "high" }
      }
      continue
    }
    if (TOTAL_TTC_LABEL.test(folded)) {
      ttc = { cents: primary, confidence: "high" }
      continue
    }
    if (TOTAL_SOFT_LABEL.test(folded)) {
      soft = { cents: primary, confidence: "medium" }
      continue
    }
    if (TOTAL_HT_LABEL.test(folded)) {
      ht = primary
      continue
    }
    if (VAT_LABEL.test(folded)) {
      // Un numéro de TVA (« TVA I.C. FR 78 347 384 570 ») n'est pas un
      // montant : on ignore la ligne au lieu d'y lire un faux total.
      if (VAT_IDENTIFIER.test(folded)) continue
      // « Taxe de vente: 20 % on 280,65 = 56,13 » : le montant de TVA est
      // celui qui suit le « = », pas l'assiette.
      const vatLine = line.includes("=")
        ? line.slice(line.lastIndexOf("=") + 1)
        : line
      const vatAmount = amountWithoutRates(vatLine, currencyAmounts(vatLine))
      if (vatAmount === null || vatAmount < 0 || !isPlausibleAmount(vatAmount)) continue
      const rated = line.includes("%")
      const better =
        !vat ||
        (rated && !vat.rated) ||
        (rated === vat.rated && Math.abs(vatAmount) > Math.abs(vat.cents))
      if (better) vat = { cents: vatAmount, confidence: "high", rated }
      continue
    }

    if (NON_ITEM_PREFIX.test(folded)) continue
    if ((line.match(/[A-Za-zÀ-ÿ]/g) ?? []).length < 2) continue
    if (items.length >= MAX_LINES) continue
    // « Kingston FURY 32 » : un petit entier nu en fin de ligne est une
    // quantité, pas un montant (contrairement à « Main d'oeuvre 900 »).
    if (
      tail &&
      amounts.length === 0 &&
      !/[.,]\d{1,2}$/.test(tail.raw) &&
      Math.abs(primary) < 10_000 &&
      line.length <= 40
    ) {
      continue
    }

    const label = (tail ? line.slice(0, tail.start) : line)
      .replace(/\s*(?:€|\bEUR\b)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (label.length < 3) continue
    items.push({ label: label.slice(0, 180), amountCents: primary })
  }

  let totalCents: number | null = null
  let totalConfidence: InvoiceConfidence = "missing"
  if (ttc) {
    totalCents = ttc.cents
    totalConfidence = "high"
  } else if (soft) {
    totalCents = soft.cents
    totalConfidence = "medium"
  } else if (due) {
    totalCents = due.cents
    totalConfidence = "low"
  }

  let amountDueCents: number | null = null
  let dueConfidence: InvoiceConfidence = "missing"
  if (due) {
    amountDueCents = due.cents
    dueConfidence = "high"
  } else if (totalCents !== null) {
    amountDueCents = totalCents
    dueConfidence = totalConfidence === "high" ? "medium" : "low"
  }

  if (totalCents === null) {
    warnings.push("Aucun montant TTC n'a pu être identifié dans le texte.")
  }
  if (amountDueCents !== null && totalCents !== null && amountDueCents !== totalCents) {
    warnings.push(
      `Le montant à régler (${formatCents(amountDueCents)}) diffère du total TTC (${formatCents(totalCents)}).`,
    )
  }
  // Une TVA supérieure au TTC est nécessairement un faux positif : on
  // préfère ne rien affirmer plutôt que de valider un montant incohérent.
  if (vat && totalCents !== null && vat.cents > totalCents) {
    warnings.push("La TVA détectée dépasse le total TTC : elle a été ignorée.")
    vat = null
  }
  if (vat === null && ht !== null && totalCents !== null && totalCents > ht) {
    vat = { cents: totalCents - ht, confidence: "medium", rated: false }
  }
  if (ht !== null && vat && totalCents !== null) {
    const expected = ht + vat.cents
    if (Math.abs(expected - totalCents) > 2) {
      warnings.push(
        `HT + TVA ne retombe pas sur le TTC (écart de ${formatCents(Math.abs(expected - totalCents))}).`,
      )
      totalConfidence = totalConfidence === "high" ? "medium" : totalConfidence
    }
  }
  if (vat === null && totalCents !== null) {
    warnings.push("TVA non retrouvée : montant TTC seul.")
  }
  // Devise étrangère : uniquement un symbole accolé à un montant ou un code
  // ISO explicite. Les PDF allemands contiennent parfois des artefacts « $ »
  // isolés qui ne doivent pas déclencher l'alerte.
  if (
    /(?:[£$]\s?\d)|(?:\d\s?[£$])|\b(?:usd|gbp|chf)\b/i.test(lines.join("\n"))
  ) {
    warnings.push("Devise étrangère détectée : seules les factures en euro sont prises en charge.")
  }

  return {
    totalCents,
    vatCents: vat?.cents ?? null,
    amountDueCents,
    lines: items,
    totalConfidence,
    vatConfidence: vat?.confidence ?? "missing",
    dueConfidence,
    warnings,
  }
}

/* ========================================================================== */
/*  Synthèse et assemblage                                                    */
/* ========================================================================== */

function buildSummary(input: {
  supplierName: string | null
  invoiceNumber: string | null
  amountDueCents: number | null
  totalCents: number | null
  dueDate: string | null
  lineCount: number
}): string {
  const parts: string[] = []
  const reference = input.invoiceNumber ? ` ${input.invoiceNumber}` : ""
  parts.push(
    `Facture${reference} de ${input.supplierName ?? "fournisseur non identifié"}.`,
  )

  if (input.lineCount > 0) {
    parts.push(
      `${input.lineCount} ligne${input.lineCount > 1 ? "s" : ""} détectée${input.lineCount > 1 ? "s" : ""}.`,
    )
  }

  if (input.amountDueCents !== null) {
    const label =
      input.totalCents !== null && input.amountDueCents !== input.totalCents
        ? `À régler ${formatCents(input.amountDueCents)} sur un total de ${formatCents(input.totalCents)} TTC`
        : `Montant à régler ${formatCents(input.amountDueCents)} TTC`
    parts.push(input.dueDate ? `${label} avant le ${frenchDate(input.dueDate)}.` : `${label}.`)
  } else {
    parts.push("Montant à régler non identifié.")
  }

  if (!input.dueDate) parts.push("Aucune échéance détectée.")

  return parts.join(" ").slice(0, 500)
}

function emptyConfidence(): InvoiceConfidenceMap {
  return {
    supplierName: "missing",
    supplierTaxId: "missing",
    invoiceNumber: "missing",
    issuedOn: "missing",
    dueDate: "missing",
    totalCents: "missing",
    vatCents: "missing",
  }
}

/**
 * Point d'entrée pur : texte brut → extraction structurée.
 * Aucune dépendance au réseau, à la base ou au système de fichiers.
 */
export function parseInvoiceText(text: string): InvoiceExtraction {
  const lines = meaningfulLines(text)
  const warnings: string[] = []

  if (lines.length === 0) {
    return {
      supplierName: null,
      supplierTaxId: null,
      invoiceNumber: null,
      issuedOn: null,
      dueDate: null,
      totalCents: null,
      vatCents: null,
      amountDueCents: null,
      currency: "EUR",
      lineCount: 0,
      lines: [],
      confidence: emptyConfidence(),
      warnings: ["Aucun texte exploitable dans le document."],
      summary: "Aucun texte exploitable : le document est probablement scanné.",
    }
  }

  const hasEuroContext = /€|\bEUR\b|\beuros?\b/i.test(text)
  const supplier = findSupplier(lines)
  const taxId = findTaxId(lines)
  const invoiceNumber = findInvoiceNumber(lines)
  const dates = findDates(lines)
  const amounts = findAmounts(lines, hasEuroContext)

  warnings.push(...dates.warnings, ...amounts.warnings)
  if (!supplier.value) warnings.push("Fournisseur non identifié.")
  if (!invoiceNumber.value) warnings.push("Numéro de facture non identifié.")
  if (!dates.issuedOn) warnings.push("Date de facture non identifiée.")

  const confidence: InvoiceConfidenceMap = {
    supplierName: supplier.confidence,
    supplierTaxId: taxId.confidence,
    invoiceNumber: invoiceNumber.confidence,
    issuedOn: dates.issuedConfidence,
    dueDate: dates.dueConfidence,
    totalCents: amounts.totalConfidence,
    vatCents: amounts.vatConfidence,
  }

  const lineCount = amounts.lines.length

  return {
    supplierName: supplier.value,
    supplierTaxId: taxId.value,
    invoiceNumber: invoiceNumber.value,
    issuedOn: dates.issuedOn,
    dueDate: dates.dueDate,
    totalCents: amounts.totalCents,
    vatCents: amounts.vatCents,
    amountDueCents: amounts.amountDueCents,
    currency: "EUR",
    lineCount,
    lines: amounts.lines,
    confidence,
    warnings: warnings.slice(0, 20),
    summary: buildSummary({
      supplierName: supplier.value,
      invoiceNumber: invoiceNumber.value,
      amountDueCents: amounts.amountDueCents,
      totalCents: amounts.totalCents,
      dueDate: dates.dueDate,
      lineCount,
    }),
  }
}

export function isUsableInvoiceText(text: string): boolean {
  return normalizeText(text).replace(/\s/g, "").length >= MIN_USABLE_TEXT
}

/**
 * Distinguish an invoice from any other PDF (notice, plan, contract…).
 *
 * The heuristic parser always returns an extraction, so without this gate a
 * long document merely mentioning « facture » would be shown as a bogus
 * invoice with invented amounts. We require an explicit invoice wording, at
 * least two strong invoice markers, and a bounded text length (a 36-page
 * notice has no reason to be parsed as an invoice).
 */
const MAX_INVOICE_TEXT_CHARS = 30_000
const INVOICE_TITLE = /\b(facture|invoice|avoir|devis)\b/
const STRICT_INVOICE_MARKERS = [
  TOTAL_TTC_LABEL,
  DUE_AMOUNT_LABEL,
  ISSUE_LABEL,
  /\b(siret|siren|numero de tva|vat number)\b/,
  /(?:facture|invoice|avoir|devis)\s*(?:n[°o]?\.?|num[ée]ro|no\.?)?\s*[:#-]?\s*[A-Za-z]{0,5}[-_/]?\d{2,6}(?:[-_/]\d{1,6})?/i,
]

export function isInvoiceLike(text: string): boolean {
  const normalized = normalizeText(text)
  if (normalized.replace(/\s/g, "").length > MAX_INVOICE_TEXT_CHARS) return false
  const folded = fold(normalized)
  if (!INVOICE_TITLE.test(folded)) return false
  const hits = STRICT_INVOICE_MARKERS.reduce(
    (sum, marker) => sum + (marker.test(folded) ? 1 : 0),
    0,
  )
  return hits >= 2
}
