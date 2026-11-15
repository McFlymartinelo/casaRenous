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
      pendingCount: 0,
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

    const bulkForbidden = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({
        items: [{ kind: "ccmi_call", label: "Interdit", amountCents: 100, clientId: randomUUID() }],
      })
    expect(bulkForbidden.status).toBe(403)

    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const csv = await context.agent.get("/api/budget/export.csv")
    expect(csv.status).toBe(200)
    expect(csv.headers["content-type"]).toContain("text/csv")
    expect(csv.text).toContain("Appel de fonds n°1")
    expect(csv.text).toContain("150000")
  })

  it("accepte une ligne sans montant et l'exclut des totaux", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const before = await context.agent.get("/api/budget").expect(200)

    const created = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "change_order",
        label: "Porte d'entrée — à chiffrer",
        clientId: randomUUID(),
      })
    expect(created.status).toBe(201)
    expect(created.body.amountCents).toBeNull()

    const after = await context.agent.get("/api/budget").expect(200)
    expect(after.body.summary.pendingCount).toBe(before.body.summary.pendingCount + 1)
    expect(after.body.summary.totalCents).toBe(before.body.summary.totalCents)
    expect(after.body.summary.count).toBe(before.body.summary.count + 1)

    // Le montant peut être renseigné plus tard.
    const filled = await context.agent
      .patch(`/api/budget/items/${created.body.id}`)
      .set("Origin", origin(context))
      .send({ amountCents: 89_000 })
    expect(filled.status).toBe(200)
    expect(filled.body.amountCents).toBe(89_000)

    const final = await context.agent.get("/api/budget").expect(200)
    expect(final.body.summary.pendingCount).toBe(before.body.summary.pendingCount)
    expect(final.body.summary.totalCents).toBe(before.body.summary.totalCents + 89_000)

    // Et redevenir « à compléter ».
    await context.agent
      .patch(`/api/budget/items/${created.body.id}`)
      .set("Origin", origin(context))
      .send({ amountCents: null })
      .expect(200)
    const cleared = await context.agent.get("/api/budget").expect(200)
    expect(cleared.body.summary.totalCents).toBe(before.body.summary.totalCents)
  })

  it("importe un échéancier en une requête, sans doublon", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const before = await context.agent.get("/api/budget").expect(200)

    const clientIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const amounts = [8_550_000, 7_125_000, 11_400_000, 1_425_000]
    const items = clientIds.map((clientId, index) => ({
      kind: "ccmi_call" as const,
      label: `Appel de fonds n°${index + 1}`,
      reference: `CCMI-0${index + 1}`,
      amountCents: amounts[index],
      dueDate: "2027-01-0" + (index + 1),
      clientId,
    }))

    const bulk = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({ items })
    expect(bulk.status).toBe(201)
    expect(bulk.body.items).toHaveLength(4)
    expect(bulk.body.items[0].amountCents).toBe(8_550_000)

    const after = await context.agent.get("/api/budget").expect(200)
    const total = amounts.reduce((sum, value) => sum + value, 0)
    expect(after.body.summary.totalCents).toBe(before.body.summary.totalCents + total)
    expect(after.body.summary.count).toBe(before.body.summary.count + 4)

    // Rejouer le même import ne crée rien de plus.
    const replay = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({ items })
    expect(replay.status).toBe(200)
    expect(replay.body.items).toHaveLength(4)
    expect(replay.body.items.map((item: { id: string }) => item.id)).toEqual(
      bulk.body.items.map((item: { id: string }) => item.id),
    )

    const unchanged = await context.agent.get("/api/budget").expect(200)
    expect(unchanged.body.summary.count).toBe(after.body.summary.count)
  })

  it("refuse un import invalide", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")

    const empty = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({ items: [] })
    expect(empty.status).toBe(422)

    const zero = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({
        items: [{ kind: "ccmi_call", label: "Zéro", amountCents: 0, clientId: randomUUID() }],
      })
    expect(zero.status).toBe(422)

    const negativeCall = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({
        items: [{ kind: "ccmi_call", label: "Négatif", amountCents: -1, clientId: randomUUID() }],
      })
    expect(negativeCall.status).toBe(422)

    const tooMany = await context.agent
      .post("/api/budget/items/bulk")
      .set("Origin", origin(context))
      .send({
        items: Array.from({ length: 61 }, (_, index) => ({
          kind: "change_order",
          label: `Ligne ${index}`,
          amountCents: 100,
          clientId: randomUUID(),
        })),
      })
    expect(tooMany.status).toBe(422)
  })
})
