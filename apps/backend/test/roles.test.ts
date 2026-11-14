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

describe("contrôle des rôles", () => {
  it("autorise les lectures aux invités", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    for (const path of [
      "/api/rooms",
      "/api/key-dates",
      "/api/project",
      "/api/budget",
      "/api/milestones",
      "/api/photos",
      "/api/documents",
      "/api/reserves",
    ]) {
      const res = await context.agent.get(path)
      expect(res.status, path).toBe(200)
    }
  })

  it("refuse les écritures admin aux invités", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")

    const keyDate = await context.agent
      .post("/api/key-dates")
      .set("Origin", origin(context))
      .send({ label: "Test", date: "2027-04-01", kind: "chantier" })
    expect(keyDate.status).toBe(403)

    const milestone = await context.agent
      .post("/api/milestones")
      .set("Origin", origin(context))
      .send({
        title: "Test",
        category: "chantier",
        plannedStart: "2027-04-01",
        plannedEnd: "2027-04-02",
      })
    expect(milestone.status).toBe(403)

    const budget = await context.agent
      .post("/api/budget/items")
      .set("Origin", origin(context))
      .send({
        kind: "ccmi_call",
        label: "Appel test",
        amountCents: 1000,
        clientId: randomUUID(),
      })
    expect(budget.status).toBe(403)

    const document = await context.agent
      .post("/api/documents")
      .set("Origin", origin(context))
      .send({ title: "Test", category: "autre" })
    expect(document.status).toBe(403)

    const audit = await context.agent.get("/api/admin/audit")
    expect(audit.status).toBe(403)
  })

  it("autorise l'admin à gérer les dates clés et les jalons", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")

    const created = await context.agent
      .post("/api/key-dates")
      .set("Origin", origin(context))
      .send({
        label: "Réunion de chantier",
        date: "2027-04-01",
        kind: "chantier",
        note: "Première réunion",
      })
    expect(created.status).toBe(201)
    expect(created.body.slug).toContain("reunion-de-chantier")

    const updated = await context.agent
      .patch(`/api/key-dates/${created.body.id}`)
      .set("Origin", origin(context))
      .send({ date: "2027-04-02" })
    expect(updated.status).toBe(200)
    expect(updated.body.date).toBe("2027-04-02")

    const deleted = await context.agent
      .delete(`/api/key-dates/${created.body.id}`)
      .set("Origin", origin(context))
    expect(deleted.status).toBe(200)

    const systemDate = await context.agent
      .get("/api/key-dates")
      .expect(200)
    const ccmi = systemDate.body.find(
      (item: { slug: string }) => item.slug === "signature-ccmi",
    )
    expect(ccmi).toBeTruthy()
    const deleteSystem = await context.agent
      .delete(`/api/key-dates/${ccmi.id}`)
      .set("Origin", origin(context))
    expect(deleteSystem.status).toBe(403)

    const milestone = await context.agent
      .post("/api/milestones")
      .set("Origin", origin(context))
      .send({
        title: "Réunion de chantier",
        category: "chantier",
        plannedStart: "2027-04-01",
        plannedEnd: "2027-04-01",
        isKey: true,
      })
    expect(milestone.status).toBe(201)

    const audit = await context.agent.get("/api/admin/audit")
    expect(audit.status).toBe(200)
    expect(audit.body.items.length).toBeGreaterThan(0)
  })

  it("borne les dates au 31 décembre 2028", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const dates = await context.agent.get("/api/key-dates").expect(200)
    const livraison = dates.body.find(
      (item: { slug: string }) => item.slug === "livraison",
    )
    const res = await context.agent
      .patch(`/api/key-dates/${livraison.id}`)
      .set("Origin", origin(context))
      .send({ date: "2029-01-15" })
    expect(res.status).toBe(422)
  })

  it("valide l'ordre des jalons", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent
      .post("/api/milestones")
      .set("Origin", origin(context))
      .send({
        title: "Jalon incohérent",
        category: "chantier",
        plannedStart: "2027-06-01",
        plannedEnd: "2027-05-01",
      })
    expect(res.status).toBe(422)
  })

  it("permet à un invité de faire évoluer une réserve, pas de la renommer", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    const created = await context.agent
      .post("/api/reserves")
      .set("Origin", origin(context))
      .send({
        title: "Rayure sur la porte",
        severity: "mineure",
        clientId: randomUUID(),
      })
    expect(created.status).toBe(201)

    const status = await context.agent
      .patch(`/api/reserves/${created.body.id}`)
      .set("Origin", origin(context))
      .send({ status: "resolved" })
    expect(status.status).toBe(200)
    expect(status.body.status).toBe("resolved")
    expect(status.body.resolvedAt).toBeTruthy()

    const rename = await context.agent
      .patch(`/api/reserves/${created.body.id}`)
      .set("Origin", origin(context))
      .send({ title: "Autre titre" })
    expect(rename.status).toBe(403)
  })
})
