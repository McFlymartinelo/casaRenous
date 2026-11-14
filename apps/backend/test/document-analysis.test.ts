import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import request from "supertest"
import {
  createTestContext,
  makePdf,
  origin,
  signIn,
  tinyPng,
  type TestContext,
} from "./helpers.js"

let context: TestContext

const INVOICE_PDF = makePdf([
  "SARL DUPONT BATIMENT",
  "12 rue des Artisans, 35000 Rennes",
  "SIRET 812 345 678 00019",
  "FACTURE N F-2026-042",
  "Date de facture : 12/11/2026",
  "Maconnerie fondations 1 450,00 EUR",
  "Total HT 1 450,00 EUR",
  "TVA 20% 290,00 EUR",
  "Total TTC 1 740,00 EUR",
  "Echeance de paiement : 12/12/2026",
])

async function uploadDocument(
  file: Buffer,
  filename: string,
  contentType: string,
  category = "facture",
): Promise<{ id: string }> {
  const response = await context.agent
    .post("/api/documents")
    .set("Origin", origin(context))
    .field("title", "Facture fournisseur")
    .field("category", category)
    .attach("file", file, { filename, contentType })
  expect(response.status).toBe(201)
  return response.body as { id: string }
}

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await context.close()
})

describe("lecture automatique d'une facture PDF", () => {
  it("extrait les informations clés d'une facture", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const document = await uploadDocument(INVOICE_PDF, "facture.pdf", "application/pdf")

    const response = await context.agent
      .post(`/api/documents/${document.id}/analyze`)
      .set("Origin", origin(context))
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.status).toBe("ready")
    expect(response.body.documentId).toBe(document.id)
    expect(response.body.textLength).toBeGreaterThan(40)
    expect(response.body.engine).toContain("heuristic-v1")

    const extraction = response.body.extraction
    expect(extraction.supplierName).toBe("SARL DUPONT BATIMENT")
    expect(extraction.supplierTaxId).toBe("81234567800019")
    expect(extraction.invoiceNumber).toBe("F-2026-042")
    expect(extraction.issuedOn).toBe("2026-11-12")
    expect(extraction.dueDate).toBe("2026-12-12")
    expect(extraction.totalCents).toBe(174_000)
    expect(extraction.vatCents).toBe(29_000)
    expect(extraction.amountDueCents).toBe(174_000)
    expect(extraction.currency).toBe("EUR")
    expect(extraction.summary).toContain("Facture F-2026-042")
  })

  it("met le résultat en cache et le sert via GET", async () => {
    const list = await context.agent.get("/api/documents").expect(200)
    const target = list.body.items[0] as { id: string }

    const first = await context.agent.get(`/api/documents/${target.id}/analysis`)
    expect(first.status).toBe(200)
    expect(first.body.status).toBe("ready")

    const second = await context.agent
      .post(`/api/documents/${target.id}/analyze`)
      .set("Origin", origin(context))
      .send({})
    expect(second.status).toBe(200)
    expect(second.body.extraction.invoiceNumber).toBe("F-2026-042")
  })

  it("explique clairement qu'une image n'est pas encore lisible", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const document = await uploadDocument(tinyPng, "scan.png", "image/png")

    const response = await context.agent
      .post(`/api/documents/${document.id}/analyze`)
      .set("Origin", origin(context))
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.status).toBe("unsupported")
    expect(response.body.extraction).toBeNull()
    expect(response.body.message).toMatch(/PDF/)
  })

  it("refuse l'analyse d'un document inconnu", async () => {
    const response = await context.agent
      .post(`/api/documents/${randomUUID()}/analyze`)
      .set("Origin", origin(context))
      .send({})
    expect(response.status).toBe(404)
    expect(response.body.code).toBe("document_not_found")
  })

  it("renvoie 404 quand aucune analyse n'existe", async () => {
    const list = await context.agent
      .get("/api/documents?category=plan")
      .expect(200)
    const plan = (list.body.items as { id: string }[])[0]
    if (!plan) return
    const response = await context.agent.get(`/api/documents/${plan.id}/analysis`)
    expect(response.status).toBe(404)
    expect(response.body.code).toBe("analysis_not_found")
  })

  it("exige une session authentifiée", async () => {
    const list = await context.agent.get("/api/documents").expect(200)
    const target = list.body.items[0] as { id: string }
    const anonymous = await request(context.app)
      .post(`/api/documents/${target.id}/analyze`)
      .set("Origin", origin(context))
      .send({})
    expect(anonymous.status).toBe(401)
  })

  it("journalise la qualité et les corrections manuelles", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const list = await context.agent.get("/api/documents?category=facture").expect(200)
    const invoice = (list.body.items as { id: string; mime: string }[]).find(
      (item) => item.mime === "application/pdf",
    )
    if (!invoice) throw new Error("facture de test absente")

    const analysis = await context.agent.get(`/api/documents/${invoice.id}/analysis`)
    expect(analysis.status).toBe(200)
    expect(analysis.body.quality).toMatchObject({
      missingFields: [],
      hasAmount: true,
      hasDueDate: true,
      corrected: false,
    })

    const summary = await context.agent
      .get("/api/documents/analysis-quality")
      .expect(200)
    expect(summary.body.total).toBeGreaterThanOrEqual(2)
    expect(summary.body.ready).toBeGreaterThanOrEqual(1)
    expect(summary.body.unsupported).toBeGreaterThanOrEqual(1)
    expect(summary.body.fields).toHaveLength(7)
    expect(summary.body.missingAmount).toBe(0)

    const correction = await context.agent
      .post(`/api/documents/${invoice.id}/analysis/correction`)
      .set("Origin", origin(context))
      .send({ amountCents: 170_000 })
    expect(correction.status).toBe(200)

    const after = await context.agent
      .get("/api/documents/analysis-quality")
      .expect(200)
    expect(after.body.corrected).toBeGreaterThanOrEqual(1)

    // Une ré-analyse conserve la trace de la correction.
    const again = await context.agent
      .post(`/api/documents/${invoice.id}/analyze`)
      .set("Origin", origin(context))
      .send({})
    expect(again.body.quality.corrected).toBe(true)
    expect(again.body.quality.correctedAmountCents).toBe(170_000)
  })

  it("réserve le journal qualité et les corrections à l'admin", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    expect((await context.agent.get("/api/documents/analysis-quality")).status).toBe(403)

    const list = await context.agent.get("/api/documents?category=facture").expect(200)
    const invoice = (list.body.items as { id: string; mime: string }[]).find(
      (item) => item.mime === "application/pdf",
    )
    if (!invoice) return
    const forbidden = await context.agent
      .post(`/api/documents/${invoice.id}/analysis/correction`)
      .set("Origin", origin(context))
      .send({ amountCents: 1_000 })
    expect(forbidden.status).toBe(403)
  })
})
