import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createTestContext, origin, signIn, type TestContext } from "./helpers.js"

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await context.close()
})

describe("budget en centimes entiers", () => {
  it("crée des appels CCMI et des avenants signés, calcule les totaux", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const ccmiClientId = randomUUID()
    const ccmi = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "ccmi_call",
        label: "Appel de fonds n°1",
        reference: "CCMI-01",
        amountCents: 150_000,
        dueDate: "2026-12-01",
        clientId: ccmiClientId,
      })
    expect(ccmi.status).toBe(201)
    expect(ccmi.body.amountCents).toBe(150_000)

    const avenant = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "change_order",
        label: "Moins-value portes",
        amountCents: -25_000,
        clientId: randomUUID(),
      })
    expect(avenant.status).toBe(201)

    const duplicate = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "ccmi_call",
        label: "Appel de fonds n°1",
        amountCents: 150_000,
        clientId: ccmiClientId,
      })
    expect(duplicate.status).toBe(200)
    expect(duplicate.body.id).toBe(ccmi.body.id)

    const budget = await context.agent.get("/api/budget").expect(200)
    expect(budget.body.summary).toEqual({
      totalCents: 125_000,
      ccmiCents: 150_000,
      changeOrdersCents: -25_000,
      invoiceCents: 0,
      paidCents: 0,
      remainingCents: 125_000,
      count: 2,
    })
  })

  it("refuse un montant nul ou un appel négatif", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const zero = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "ccmi_call",
        label: "Zéro",
        amountCents: 0,
        clientId: randomUUID(),
      })
    expect(zero.status).toBe(422)

    const negative = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "ccmi_call",
        label: "Négatif",
        amountCents: -100,
        clientId: randomUUID(),
      })
    expect(negative.status).toBe(422)
  })

  it("met à jour le statut payé sans flottant", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const list = await context.agent.get("/api/budget").expect(200)
    const item = list.body.items.find(
      (entry: { kind: string }) => entry.kind === "ccmi_call",
    )
    const paid = await context.agent
      .patch(`/api/budget/items/${item.id}`)
      .set("Origin", origin(context))
      .send({ status: "paid", paidAt: "2026-12-02" })
    expect(paid.status).toBe(200)
    expect(paid.body.amountCents).toBe(150_000)

    const budget = await context.agent.get("/api/budget").expect(200)
    expect(budget.body.summary.paidCents).toBe(150_000)
    expect(budget.body.summary.remainingCents).toBe(-25_000)
  })

  it("compte les factures d'achat dans le total de la maison", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const invoice = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "invoice",
        label: "Facture Boulanger — F905NV89219",
        reference: "F905NV89219",
        amountCents: 18_999,
        status: "paid",
        paidAt: "2026-07-06",
        clientId: randomUUID(),
      })
    expect(invoice.status).toBe(201)

    const negative = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "invoice",
        label: "Facture négative",
        amountCents: -100,
        clientId: randomUUID(),
      })
    expect(negative.status).toBe(422)

    const budget = await context.agent.get("/api/budget").expect(200)
    expect(budget.body.summary.invoiceCents).toBe(18_999)
    expect(budget.body.summary.totalCents).toBe(143_999)
    expect(budget.body.summary.paidCents).toBe(168_999)
  })

  it("réserve l'écriture à l'admin et l'export CSV à l'admin", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    const forbidden = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "ccmi_call",
        label: "Interdit",
        amountCents: 100,
        clientId: randomUUID(),
      })
    expect(forbidden.status).toBe(403)
    expect((await context.agent.get("/api/budget/export.csv")).status).toBe(403)

    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const csv = await context.agent.get("/api/budget/export.csv")
    expect(csv.status).toBe(200)
    expect(csv.headers["content-type"]).toContain("text/csv")
    expect(csv.text).toContain("Appel de fonds n°1")
    expect(csv.text).toContain("150000")
  })
})
