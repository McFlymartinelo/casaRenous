import { describe, expect, it } from "vitest"
import { buildDocumentSummary } from "../src/lib/document-summary.js"

const NOTICE = `
S.A.P.O.  BP.201 ROUVRES ST JEAN 45302 PITHIVIERS CEDEX
S.A.S. au capital de 356 860 € RC ORLEANS B087 080 412

NOTICE DESCRIPTIVE
Prévue par les articles R.231-4 et R.232-4 du Code de la Construction et de
l'Habitation relatifs au Contrat de Construction d'une Maison Individuelle
Immeuble à construire pour le compte de :
M RENOUS Axel et Mme SEVIN Diane
11 rue de la libération
Lieu de construction :
1A Ruelle des Prés Lot B
78490 MAREIL-LE-GUYON
Caractéristiques techniques : Pavillon en R + 1 + combles perdus sur vide sanitaire.

Abattage, dessouchage et évacuation d'arbres génants l'accès au chantier x 5000,00
Evacuation des terres en décharge. x 4500,00|

Montant du prix convenu pour les ouvrages de la colonne 3 |_218 800 €
Coût des travaux dont le Maître d'Ouvrage se réserve l'exécution, colonne 5 | 85 103 €
Goûttotal | 303 903 €
`

describe("buildDocumentSummary", () => {
  const summary = buildDocumentSummary(NOTICE, "NOTICE CONTRAT RENOUS SEVIN")

  it("identifie le type de document et les parties", () => {
    expect(summary.kind).toBe("notice")
    expect(summary.who).toContain("M RENOUS Axel et Mme SEVIN Diane")
    expect(summary.who).toContain("S.A.P.O.")
  })

  it("décrit l'objet et le lieu", () => {
    expect(summary.what).toContain("maison individuelle")
    expect(summary.what).toContain("Pavillon en R + 1")
    expect(summary.where).toContain("78490 MAREIL-LE-GUYON")
  })

  it("retrouve les montants sans confondre le capital social", () => {
    expect(summary.amounts).toEqual([
      { label: "Coût total", amountCents: 30_390_300 },
      { label: "Prix convenu", amountCents: 21_880_000 },
      { label: "Travaux réservés", amountCents: 8_510_300 },
    ])
  })

  it("extrait les lignes détaillées des travaux réservés", () => {
    expect(summary.reservedWorks.length).toBeGreaterThan(0)
    expect(summary.reservedWorks).toContainEqual({
      label: "Abattage, dessouchage et évacuation d'arbres génants l'accès au chantier",
      amountCents: 500_000,
    })
    expect(summary.reservedWorksEdited).toBe(false)
  })

  it("tolère le bruit OCR du serveur (Goûttotài, montant à la ligne)", () => {
    const noisy = [
      "NOTICE DESCRIPTIVE",
      "Abattage, dessouchage et évacuation d'arbres génants l'accès au chantier x 5000,00]",
      "Goûttotài [303 903 €]",
      "/_____Montant du prix convenu pour les ouvrages de la colonne 3",
      "|_218 800 €",
    ].join("\n")
    const result = buildDocumentSummary(noisy, "NOTICE")
    expect(result.amounts).toContainEqual({ label: "Coût total", amountCents: 30_390_300 })
    expect(result.amounts).toContainEqual({ label: "Prix convenu", amountCents: 21_880_000 })
    expect(result.reservedWorks.some((item) => item.amountCents === 500_000)).toBe(true)
  })

  it("rédige une description lisible", () => {
    expect(summary.description).toContain("303 903")
    expect(summary.description).toContain("Concernant M RENOUS Axel")
    expect(summary.description).not.toContain("356 860")
  })
})
