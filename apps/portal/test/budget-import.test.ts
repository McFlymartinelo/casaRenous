import { describe, expect, it } from "vitest"
import {
  allocateCents,
  buildCemiSchedule,
  parseAmountCell,
  parseBudgetTable,
  parseDateCell,
  splitTable,
  sumRates,
} from "../src/lib/budget-import"

describe("montants collés depuis un tableur", () => {
  it("reconnaît les formats français et anglo-saxons", () => {
    expect(parseAmountCell("1 234,56 €")).toBe(123_456)
    expect(parseAmountCell("1\u00a0234,56")).toBe(123_456)
    expect(parseAmountCell("1.234,56")).toBe(123_456)
    expect(parseAmountCell("1234.56")).toBe(123_456)
    expect(parseAmountCell("1,234.56")).toBe(123_456)
    expect(parseAmountCell("1.234")).toBe(123_400)
    expect(parseAmountCell("-500")).toBe(-50_000)
    expect(parseAmountCell("(500)")).toBe(-50_000)
  })

  it("renvoie null sur une cellule vide ou illisible", () => {
    expect(parseAmountCell("")).toBeNull()
    expect(parseAmountCell("   ")).toBeNull()
    expect(parseAmountCell("à chiffrer")).toBeNull()
    expect(parseAmountCell("01/12/2026")).toBeNull()
  })
})

describe("dates collées depuis un tableur", () => {
  it("accepte les formats usuels", () => {
    expect(parseDateCell("01/12/2026")).toBe("2026-12-01")
    expect(parseDateCell("1/2/2027")).toBe("2027-02-01")
    expect(parseDateCell("1-12-26")).toBe("2026-12-01")
    expect(parseDateCell("2026-12-01")).toBe("2026-12-01")
  })

  it("refuse une date inexistante", () => {
    expect(parseDateCell("31/02/2026")).toBeNull()
    expect(parseDateCell("demain")).toBeNull()
    expect(parseDateCell("")).toBeNull()
  })
})

describe("découpage du tableau collé", () => {
  it("sépare sur les tabulations", () => {
    const { table, separator } = splitTable("A\tB\tC\n1\t2\t3")
    expect(separator).toBe("\t")
    expect(table).toEqual([
      ["A", "B", "C"],
      ["1", "2", "3"],
    ])
  })

  it("gère les points-virgules et les guillemets", () => {
    const { table } = splitTable('Libellé;Montant\n"A; B";1 200,00')
    expect(table[1]).toEqual(["A; B", "1 200,00"])
  })

  it("ignore les lignes vides", () => {
    expect(splitTable("a\n\n\nb").table).toHaveLength(2)
  })
})

describe("import d'un tableau de budget", () => {
  const sample = [
    "Libellé\tMontant\tÉchéance",
    "Appel de fonds n°1 — signature\t85 500,00\t01/12/2026",
    "Appel de fonds n°2 — fondations\t71 250,00\t01/03/2027",
  ].join("\n")

  it("détecte l'en-tête et les colonnes", () => {
    const parsed = parseBudgetTable(sample)
    expect(parsed.headerDetected).toBe(true)
    expect(parsed.mapping).toEqual({
      label: 0,
      amount: 1,
      dueDate: 2,
      reference: null,
    })
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({
      label: "Appel de fonds n°1 — signature",
      amountCents: 8_550_000,
      dueDate: "2026-12-01",
      issues: [],
    })
  })

  it("crée des lignes à compléter quand il n'y a pas de montant", () => {
    const parsed = parseBudgetTable("Peinture\nCarrelage")
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows.map((row) => row.amountCents)).toEqual([null, null])
  })

  it("ignore une ligne dont le montant est illisible", () => {
    const parsed = parseBudgetTable(
      ["Libellé\tMontant", "Porte d'entrée\tabc", "Fenêtres\t1 200,00"].join("\n"),
    )
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.label).toBe("Fenêtres")
    expect(parsed.rejected).toEqual([
      { line: 2, reason: "Montant illisible : « abc »" },
    ])
  })

  it("signale une date illisible sans rejeter la ligne", () => {
    const parsed = parseBudgetTable(
      ["Libellé\tMontant\tÉchéance", "Acompte\t1 000,00\tbientôt"].join("\n"),
    )
    expect(parsed.rows[0]?.dueDate).toBeNull()
    expect(parsed.rows[0]?.issues).toHaveLength(1)
  })

  it("respecte une disposition imposée même sans colonne d'échéance", () => {
    const parsed = parseBudgetTable("Peinture\t2 500", { preset: "label-amount-date" })
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      label: "Peinture",
      amountCents: 250_000,
      dueDate: null,
    })
  })
})

describe("échéancier CCMI", () => {
  it("répartit un total sans perdre un centime", () => {
    const amounts = allocateCents(28_500_000, [30, 25, 40, 5])
    expect(amounts).toEqual([8_550_000, 7_125_000, 11_400_000, 1_425_000])
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(28_500_000)
  })

  it("absorbe les arrondis sur la plus grosse ligne", () => {
    const amounts = allocateCents(101, [33.33, 33.33, 33.34])
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(101)
  })

  it("produit quatre appels datables", () => {
    const rows = buildCemiSchedule(28_500_000, [
      { label: "Signature", rate: 30, dueDate: "2026-11-06" },
      { label: "Fondations", rate: 25, dueDate: null },
      { label: "Hors d'eau", rate: 40, dueDate: null },
      { label: "Livraison", rate: 5, dueDate: null },
    ])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ label: "Signature", reference: "CCMI-01" })
    expect(rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0)).toBe(28_500_000)
    expect(sumRates([{ label: "a", rate: 30, dueDate: null }, { label: "b", rate: 70, dueDate: null }])).toBe(100)
  })
})
