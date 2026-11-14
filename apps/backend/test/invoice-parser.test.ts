import { describe, expect, it } from "vitest"
import { parseAmountToCents, parseInvoiceText } from "../src/lib/invoice-parser.js"

const INVOICE = `SARL DUPONT BATIMENT
12 rue des Artisans, 35000 Rennes
SIRET 812 345 678 00019
TVA intracommunautaire FR 12 812345678

FACTURE N° F-2026-042
Date de facture : 12/11/2026

DESIGNATION                      MONTANT
Maconnerie fondations         1 450,00 EUR
Fourniture beton                890,50 EUR
Main d oeuvre                   900,00 EUR

Total HT                      3 240,50 EUR
TVA 20%                         648,10 EUR
Total TTC                     3 888,60 EUR
Net a payer                   3 888,60 EUR
Echeance de paiement : 12/12/2026`

describe("parseAmountToCents", () => {
  it("accepte les formats français et anglo-saxons", () => {
    expect(parseAmountToCents("1 450,00")).toBe(145_000)
    expect(parseAmountToCents("1.450,00")).toBe(145_000)
    expect(parseAmountToCents("1,450.00")).toBe(145_000)
    expect(parseAmountToCents("890,50")).toBe(89_050)
    expect(parseAmountToCents("890.5")).toBe(89_050)
    expect(parseAmountToCents("-120,00")).toBe(-12_000)
    expect(parseAmountToCents("12 345")).toBe(1_234_500)
    expect(parseAmountToCents("42")).toBe(4_200)
  })

  it("refuse ce qui n'est pas un montant", () => {
    expect(parseAmountToCents("abc")).toBeNull()
    expect(parseAmountToCents("")).toBeNull()
    expect(parseAmountToCents("12,,5")).toBeNull()
  })
})

describe("parseInvoiceText — facture complète", () => {
  const result = parseInvoiceText(INVOICE)

  it("identifie le fournisseur et son SIRET", () => {
    expect(result.supplierName).toBe("SARL DUPONT BATIMENT")
    expect(result.supplierTaxId).toBe("81234567800019")
    expect(result.confidence.supplierName).toBe("high")
    expect(result.confidence.supplierTaxId).toBe("high")
  })

  it("identifie le numéro de facture sans le confondre avec une date", () => {
    expect(result.invoiceNumber).toBe("F-2026-042")
  })

  it("identifie les dates de facture et d'échéance", () => {
    expect(result.issuedOn).toBe("2026-11-12")
    expect(result.dueDate).toBe("2026-12-12")
    expect(result.confidence.issuedOn).toBe("high")
    expect(result.confidence.dueDate).toBe("high")
  })

  it("identifie les montants en centimes entiers", () => {
    expect(result.totalCents).toBe(388_860)
    expect(result.vatCents).toBe(64_810)
    expect(result.amountDueCents).toBe(388_860)
    expect(result.confidence.totalCents).toBe("high")
  })

  it("compte les lignes sans absorber les totaux", () => {
    expect(result.lineCount).toBe(3)
    expect(result.lines.map((line) => line.amountCents)).toEqual([
      145_000, 89_050, 90_000,
    ])
  })

  it("produit une synthèse lisible", () => {
    const summary = result.summary.replace(/\s/g, " ")
    expect(summary).toContain("Facture F-2026-042 de SARL DUPONT BATIMENT")
    expect(summary).toContain("3 888,60")
    expect(summary).toContain("12/12/2026")
  })

  it("ne signale aucune incohérence comptable", () => {
    expect(result.warnings).not.toContain(
      expect.stringContaining("HT + TVA"),
    )
  })
})

describe("parseInvoiceText — cas limites", () => {
  it("déduit l'échéance des conditions de paiement, avec confiance faible", () => {
    const result = parseInvoiceText(`SAS BATIR
Facture F2026-100
Date de facture : 01/03/2026
Paiement a 30 jours
Total TTC 1 200,00 EUR`)
    expect(result.dueDate).toBe("2026-03-31")
    expect(result.confidence.dueDate).toBe("low")
  })

  it("distingue le net à payer du total TTC", () => {
    const result = parseInvoiceText(`EURL TOITURE
Facture 2026-0042
Total TTC 5 000,00 EUR
Acompte 1 500,00 EUR
Net a payer 3 500,00 EUR
Echeance : 15/01/2026`)
    expect(result.totalCents).toBe(500_000)
    expect(result.amountDueCents).toBe(350_000)
    expect(result.warnings.some((warning) => warning.includes("diffère du total"))).toBe(true)
  })

  it("signale un HT + TVA qui ne retombe pas sur le TTC", () => {
    const result = parseInvoiceText(`SCI LES CHENES
Facture A-1
Total HT 1 000,00 EUR
TVA 200,00 EUR
Total TTC 1 500,00 EUR`)
    expect(result.warnings.some((warning) => warning.includes("HT + TVA"))).toBe(true)
    expect(result.confidence.totalCents).not.toBe("high")
  })

  it("signale une échéance antérieure à la facture", () => {
    const result = parseInvoiceText(`EI MARTIN
Facture 2026-9
Date de facture : 20/06/2026
Echeance : 10/06/2026
Total TTC 800,00 EUR`)
    expect(result.warnings.some((warning) => warning.includes("précède"))).toBe(true)
    expect(result.confidence.dueDate).toBe("low")
  })

  it("reste honnête sur un texte vide", () => {
    const result = parseInvoiceText("   ")
    expect(result.totalCents).toBeNull()
    expect(result.summary).toContain("scanné")
    expect(result.warnings).toHaveLength(1)
  })

  it("ne prend pas un numéro de téléphone pour un montant", () => {
    const result = parseInvoiceText(`SARL TEST
Tel : 02 99 12 34 56
Facture T-2026-1
Total TTC 100,00 EUR`)
    expect(result.totalCents).toBe(10_000)
    expect(result.lines).toHaveLength(0)
  })
})

describe("parseInvoiceText — ticket de caisse réel", () => {
  // Reproduit les pièges d'un ticket Boulanger : code-barres en tête,
  // numéro de TVA intracommunautaire, capital social, RCS, colonnes
  // P.U./TVA et montants déjà réglés.
  const TICKET = `*F905NV89219*
Boulanger
avec vous, 7j/7
Facture F905NV89219-26-002 du 06.07.2026 12:53 Page /1 1
Boulanger Les Clayes-Sous-Bois
SIRET 34738457001340
M MARTY ALEXANDRE
REFERENCE DE L'ACHAT CODE Qté P.U.TTC T.TVA TOTAL TTC
Ecouteur SHOKZ OpenDots One 2 Blanc 0001240661 1 199.95 20.00 199.95
ECO-PART DEEE 0.04
Remise commerciale -10.00
TOTAL HT (Euros) 158.33
TOTAL TTC (Euros) 189.99
Dont TVA (20.00 %) 31.66
Dont éco-part. DEEE (TTC) 0.04
REGLEMENTS Règlement perçu 189.99
Au capital de 40 611 564 EUR
RCS LILLE B 347 384 570
TVA I.C. FR 78 347 384 570
Votre facture fait office de garantie`

  const result = parseInvoiceText(TICKET)

  it("ignore les longs identifiants et trouve les vrais montants", () => {
    expect(result.totalCents).toBe(18_999)
    expect(result.vatCents).toBe(3_166)
    expect(result.amountDueCents).toBe(18_999)
    expect(result.confidence.vatCents).toBe("high")
  })

  it("lit le numéro de facture malgré des groupes qui ressemblent à une date", () => {
    expect(result.invoiceNumber).toBe("F905NV89219-26-002")
    expect(result.confidence.invoiceNumber).toBe("high")
  })

  it("ne prend ni le code-barres ni le capital social comme fournisseur", () => {
    expect(result.supplierName).toBe("Boulanger")
  })

  it("écarte les mentions légales et le numéro de TVA des lignes", () => {
    const labels = result.lines.map((line) => line.label)
    expect(labels).toHaveLength(3)
    expect(labels.some((label) => label.includes("capital"))).toBe(false)
    expect(labels.some((label) => label.includes("RCS"))).toBe(false)
    expect(labels.some((label) => /^dont/i.test(label))).toBe(false)
    expect(result.lines[0]?.amountCents).toBe(19_995)
  })

  it("ne tronque pas un libellé contenant « eur »", () => {
    expect(result.lines[0]?.label).toContain("Ecouteur")
  })

  it("ne produit aucun avertissement d'incohérence comptable", () => {
    expect(result.warnings).toHaveLength(0)
  })
})
