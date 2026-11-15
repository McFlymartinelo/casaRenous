import { parseEuroToCents } from "@casarenous/shared"

/**
 * Import de budget : deux chemins, un seul format de sortie.
 *
 * - `parseBudgetTable` lit un tableau collé depuis Excel / Numbers / Sheets.
 * - `buildCemiSchedule` génère l'échéancier CCMI à partir d'un seul montant.
 *
 * Les deux produisent des `ParsedBudgetRow` que la feuille d'import transforme
 * en `BudgetCreateInput` (montants en centimes entiers, jamais de flottant).
 */

export interface ParsedBudgetRow {
  label: string
  amountCents: number | null
  dueDate: string | null
  reference: string | null
  /** Avertissements non bloquants (date illisible, colonne ignorée…). */
  issues: string[]
}

export interface RejectedBudgetRow {
  line: number
  reason: string
}

export interface BudgetTableMapping {
  label: number
  amount: number | null
  dueDate: number | null
  reference: number | null
}

export interface ParsedBudgetTable {
  rows: ParsedBudgetRow[]
  rejected: RejectedBudgetRow[]
  mapping: BudgetTableMapping
  headerDetected: boolean
  separator: string
}

export type BudgetImportPreset =
  | "auto"
  | "label-amount-date"
  | "label-amount"
  | "date-label-amount"

/* ── Cellules ───────────────────────────────────────────────────────────── */

const SPACES = /[\s\u00a0\u202f]/g

/** « 1 234,56 € », « 1234.56 », « (500) » → centimes entiers. */
export function parseAmountCell(raw: string): number | null {
  let value = raw.trim()
  if (!value) return null

  let negative = false
  const parenthesised = /^\((.*)\)$/.exec(value)
  if (parenthesised?.[1]) {
    value = parenthesised[1]
    negative = true
  }

  value = value
    .replace(SPACES, "")
    .replace(/€/g, "")
    .replace(/%/g, "")
    .replace(/(?:EUR|eur)$/, "")

  if (!value || !/\d/.test(value)) return null

  if (value.endsWith("-")) {
    value = value.slice(0, -1)
    negative = true
  }

  const hasComma = value.includes(",")
  const hasDot = value.includes(".")

  if (hasComma && hasDot) {
    if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
      // 1.234,56 — les points séparent les milliers.
      value = value.replace(/\./g, "")
    } else {
      // 1,234.56 — format anglo-saxon.
      value = value.replace(/,/g, "")
    }
  } else if (hasDot && /^-?\d{1,3}(?:\.\d{3})+$/.test(value)) {
    // 1.234 — milliers à l'anglaise, pas une décimale.
    value = value.replace(/\./g, "")
  }

  const cents = parseEuroToCents(value)
  if (cents === null) return null
  return negative ? -Math.abs(cents) : cents
}

function pad(value: string): string {
  return value.padStart(2, "0")
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** « 01/12/2026 », « 1-12-26 », « 2026-12-01 » → « 2026-12-01 ». */
export function parseDateCell(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (iso) {
    const [, year, month, day] = iso
    if (!isRealDate(Number(year), Number(month), Number(day))) return null
    return `${year}-${pad(month ?? "")}-${pad(day ?? "")}`
  }

  const french = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value)
  if (french) {
    const [, day = "", month = "", rawYear = ""] = french
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
    if (!isRealDate(Number(year), Number(month), Number(day))) return null
    return `${year}-${pad(month)}-${pad(day)}`
  }

  return null
}

/* ── Tableau collé ──────────────────────────────────────────────────────── */

function detectSeparator(line: string): string {
  if (line.includes("\t")) return "\t"
  if (line.includes(";")) return ";"
  if (line.includes("|")) return "|"
  return "\t"
}

function splitLine(line: string, separator: string): string[] {
  if (separator !== ";" && separator !== "," && separator !== "|") {
    return line.split(separator).map((cell) => cell.trim())
  }
  const cells: string[] = []
  let current = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === separator && !quoted) {
      cells.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

export function splitTable(text: string): { table: string[][]; separator: string } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
  if (!lines.length) return { table: [], separator: "\t" }

  const separator = detectSeparator(lines[0] ?? "")
  const table = lines.map((line) => splitLine(line, separator))
  return { table, separator }
}

const HEADER_HINTS = [
  /libell|d[ée]signation|intitul|poste|prestation/i,
  /montant|somme|prix|total|ttc|euros/i,
  /[ée]ch[ée]ance|date|quand/i,
  /r[ée]f[ée]rence|num[ée]ro|facture|devis/i,
]

const COLUMN_HINTS: { key: keyof BudgetTableMapping; pattern: RegExp }[] = [
  { key: "label", pattern: /libell|d[ée]signation|intitul|poste|prestation|objet/i },
  { key: "amount", pattern: /montant|somme|prix|total|ttc|euros|€/i },
  { key: "dueDate", pattern: /[ée]ch[ée]ance|date|quand/i },
  { key: "reference", pattern: /r[ée]f[ée]rence|num[ée]ro|facture|devis/i },
]

function isHeaderRow(cells: string[]): boolean {
  const matches = HEADER_HINTS.filter((hint) => cells.some((cell) => hint.test(cell))).length
  return matches >= 2
}

function detectFromHeader(header: string[]): Partial<BudgetTableMapping> {
  const result: Partial<BudgetTableMapping> = {}
  header.forEach((cell, index) => {
    const text = cell.trim()
    if (!text) return
    for (const hint of COLUMN_HINTS) {
      if (result[hint.key] !== undefined) continue
      if (hint.pattern.test(text)) {
        result[hint.key] = index
        return
      }
    }
  })
  return result
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim().length === 0)
}

interface ColumnProfile {
  index: number
  amountScore: number
  dateScore: number
  averageLength: number
  filled: number
}

function profileColumns(rows: string[][]): ColumnProfile[] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const profiles: ColumnProfile[] = []
  for (let index = 0; index < width; index += 1) {
    let amountHits = 0
    let dateHits = 0
    let letters = 0
    let filled = 0
    for (const row of rows) {
      const cell = (row[index] ?? "").trim()
      if (!cell) continue
      filled += 1
      letters += cell.length
      if (parseAmountCell(cell) !== null) amountHits += 1
      if (parseDateCell(cell) !== null) dateHits += 1
    }
    profiles.push({
      index,
      amountScore: filled ? amountHits / filled : 0,
      dateScore: filled ? dateHits / filled : 0,
      averageLength: filled ? letters / filled : 0,
      filled,
    })
  }
  return profiles
}

export function detectMapping(rows: string[][], header?: string[]): BudgetTableMapping {
  const profiles = profileColumns(rows).filter((profile) => profile.filled > 0)
  const fromHeader = header ? detectFromHeader(header) : {}
  const used = new Set<number>()
  for (const value of Object.values(fromHeader)) {
    if (typeof value === "number") used.add(value)
  }

  function pick(
    predicate: (profile: ColumnProfile) => boolean,
    compare: (a: ColumnProfile, b: ColumnProfile) => number,
  ): number | null {
    const candidates = profiles.filter(
      (profile) => !used.has(profile.index) && predicate(profile),
    )
    candidates.sort(compare)
    const best = candidates[0]
    if (!best) return null
    used.add(best.index)
    return best.index
  }

  const dueDate =
    fromHeader.dueDate ??
    pick(
      (profile) => profile.dateScore >= 0.6 && profile.amountScore < 0.6,
      (a, b) => b.dateScore - a.dateScore,
    )

  const amount =
    fromHeader.amount ??
    pick(
      (profile) => profile.amountScore >= 0.6,
      (a, b) => b.amountScore - a.amountScore,
    )

  const label =
    fromHeader.label ?? pick(() => true, (a, b) => b.averageLength - a.averageLength)

  const reference =
    fromHeader.reference ??
    pick(
      (profile) => profile.averageLength <= 24,
      (a, b) => a.averageLength - b.averageLength,
    )

  return {
    label: label ?? 0,
    amount: amount ?? null,
    dueDate: dueDate ?? null,
    reference: reference ?? null,
  }
}

function presetMapping(preset: BudgetImportPreset): BudgetTableMapping | null {
  switch (preset) {
    case "label-amount-date":
      return { label: 0, amount: 1, dueDate: 2, reference: null }
    case "label-amount":
      return { label: 0, amount: 1, dueDate: null, reference: null }
    case "date-label-amount":
      return { label: 1, amount: 2, dueDate: 0, reference: null }
    default:
      return null
  }
}

export function parseBudgetTable(
  text: string,
  options: { preset?: BudgetImportPreset } = {},
): ParsedBudgetTable {
  const { table, separator } = splitTable(text)
  if (!table.length) {
    return {
      rows: [],
      rejected: [],
      mapping: { label: 0, amount: null, dueDate: null, reference: null },
      headerDetected: false,
      separator,
    }
  }

  const headerDetected = isHeaderRow(table[0] ?? [])
  const dataRows = headerDetected ? table.slice(1) : table
  const mapping =
    presetMapping(options.preset ?? "auto") ??
    detectMapping(dataRows, headerDetected ? (table[0] ?? []) : undefined)

  const rows: ParsedBudgetRow[] = []
  const rejected: RejectedBudgetRow[] = []

  dataRows.forEach((cells, index) => {
    if (isBlankRow(cells)) return
    const line = index + (headerDetected ? 2 : 1)
    const label = (cells[mapping.label] ?? "").trim()
    if (label.length < 2) {
      rejected.push({ line, reason: "Libellé manquant ou trop court" })
      return
    }

    const issues: string[] = []
    let amountCents: number | null = null
    const rawAmount = mapping.amount === null ? "" : (cells[mapping.amount] ?? "").trim()
    if (rawAmount) {
      amountCents = parseAmountCell(rawAmount)
      if (amountCents === null) {
        rejected.push({ line, reason: `Montant illisible : « ${rawAmount} »` })
        return
      }
      if (amountCents === 0) {
        rejected.push({ line, reason: "Montant nul" })
        return
      }
    }

    const rawDate = mapping.dueDate === null ? "" : (cells[mapping.dueDate] ?? "").trim()
    let dueDate: string | null = null
    if (rawDate) {
      dueDate = parseDateCell(rawDate)
      if (dueDate === null) {
        issues.push(`Date ignorée : « ${rawDate} »`)
      }
    }

    const reference =
      mapping.reference === null
        ? null
        : (cells[mapping.reference] ?? "").trim() || null

    rows.push({ label, amountCents, dueDate, reference, issues })
  })

  return { rows, rejected, mapping, headerDetected, separator }
}

/* ── Échéancier CCMI ────────────────────────────────────────────────────── */

export interface CcmiLine {
  label: string
  rate: number
  dueDate: string | null
}

/**
 * Échéancier légal type d'un CCMI avec plan (loi du 19 décembre 1990) :
 * 30 % à la signature, 25 % à l'achèvement des fondations, 40 % à la mise
 * hors d'eau, 5 % à la livraison. À vérifier ligne par ligne avec le contrat.
 */
export const CCMI_SCHEDULE_TEMPLATE: CcmiLine[] = [
  { label: "Appel de fonds n°1 — signature", rate: 30, dueDate: null },
  { label: "Appel de fonds n°2 — achèvement des fondations", rate: 25, dueDate: null },
  { label: "Appel de fonds n°3 — mise hors d'eau", rate: 40, dueDate: null },
  { label: "Appel de fonds n°4 — livraison", rate: 5, dueDate: null },
]

/**
 * Répartit un total en centimes selon des pourcentages, sans perdre un centime :
 * la ligne la plus grosse absorbe le reste d'arrondi.
 */
export function allocateCents(totalCents: number, rates: number[]): number[] {
  if (!rates.length) return []
  const amounts = rates.map((rate) => Math.round((totalCents * rate) / 100))
  const sum = amounts.reduce((acc, value) => acc + value, 0)
  const delta = totalCents - sum
  if (delta !== 0) {
    let target = 0
    for (let index = 1; index < amounts.length; index += 1) {
      if (Math.abs(amounts[index] ?? 0) > Math.abs(amounts[target] ?? 0)) target = index
    }
    amounts[target] = (amounts[target] ?? 0) + delta
  }
  return amounts
}

export function buildCemiSchedule(
  totalCents: number,
  lines: CcmiLine[],
): ParsedBudgetRow[] {
  const amounts = allocateCents(
    totalCents,
    lines.map((line) => line.rate),
  )
  return lines.map((line, index) => ({
    label: line.label.trim() || `Appel de fonds n°${index + 1}`,
    amountCents: amounts[index] ?? 0,
    dueDate: line.dueDate,
    reference: `CCMI-${String(index + 1).padStart(2, "0")}`,
    issues: [],
  }))
}

export function sumRates(lines: CcmiLine[]): number {
  return Math.round(lines.reduce((acc, line) => acc + line.rate, 0) * 100) / 100
}
