import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestContext, origin, signIn, tinyPng, type TestContext } from "./helpers.js"

let context: TestContext
let categoryId = ""

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await context.close()
})

describe("catégories personnalisées de documents", () => {
  it("crée, liste et renomme une catégorie (admin)", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")

    const created = await context.agent
      .post("/api/document-categories")
      .set("Origin", origin(context))
      .send({ name: "Électricité" })
    expect(created.status).toBe(201)
    expect(created.body.name).toBe("Électricité")
    expect(created.body.documentCount).toBe(0)
    categoryId = created.body.id

    const list = await context.agent.get("/api/document-categories").expect(200)
    expect(list.body.items.some((item: { id: string }) => item.id === categoryId)).toBe(true)

    const duplicate = await context.agent
      .post("/api/document-categories")
      .set("Origin", origin(context))
      .send({ name: "éLECTRICITÉ" })
    expect(duplicate.status).toBe(409)

    const renamed = await context.agent
      .patch(`/api/document-categories/${categoryId}`)
      .set("Origin", origin(context))
      .send({ name: "Électricité & domotique" })
    expect(renamed.status).toBe(200)
    expect(renamed.body.name).toBe("Électricité & domotique")
  })

  it("classe un document dans la catégorie et le filtre dessus", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")

    const upload = await context.agent
      .post("/api/documents")
      .set("Origin", origin(context))
      .field("title", "Tableau électrique")
      .field("category", "autre")
      .field("customCategoryId", categoryId)
      .attach("file", tinyPng, { filename: "tableau.png", contentType: "image/png" })
    expect(upload.status).toBe(201)
    expect(upload.body.customCategoryId).toBe(categoryId)
    expect(upload.body.customCategoryName).toBe("Électricité & domotique")

    const filtered = await context.agent
      .get(`/api/documents?customCategoryId=${categoryId}`)
      .expect(200)
    expect(filtered.body.items).toHaveLength(1)
    expect(filtered.body.items[0].id).toBe(upload.body.id)

    const renamed = await context.agent
      .patch(`/api/documents/${upload.body.id}`)
      .set("Origin", origin(context))
      .send({ customCategoryId: null })
    expect(renamed.status).toBe(200)
    expect(renamed.body.customCategoryId).toBeNull()
  })

  it("refuse une catégorie inconnue à l'upload", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const upload = await context.agent
      .post("/api/documents")
      .set("Origin", origin(context))
      .field("title", "Document orphelin")
      .field("category", "autre")
      .field("customCategoryId", "00000000-0000-4000-8000-000000000000")
      .attach("file", tinyPng, { filename: "orphelin.png", contentType: "image/png" })
    expect(upload.status).toBe(422)
    expect(upload.body.code).toBe("validation_error")
  })

  it("compte les documents et les détache à la suppression", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")

    const upload = await context.agent
      .post("/api/documents")
      .set("Origin", origin(context))
      .field("title", "Plan electrique")
      .field("category", "autre")
      .field("customCategoryId", categoryId)
      .attach("file", tinyPng, { filename: "plan-elec.png", contentType: "image/png" })
    expect(upload.status).toBe(201)

    const list = await context.agent.get("/api/document-categories").expect(200)
    const entry = list.body.items.find((item: { id: string }) => item.id === categoryId)
    expect(entry.documentCount).toBe(1)

    const removed = await context.agent
      .delete(`/api/document-categories/${categoryId}`)
      .set("Origin", origin(context))
    expect(removed.status).toBe(200)

    const after = await context.agent
      .get(`/api/documents?customCategoryId=${categoryId}`)
      .expect(200)
    expect(after.body.items).toHaveLength(0)

    const doc = await context.agent
      .get(`/api/documents?q=Plan%20electrique`)
      .expect(200)
    expect(doc.body.items[0]?.customCategoryId).toBeNull()
  })

  it("laisse la lecture aux invités mais pas l'écriture", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    expect((await context.agent.get("/api/document-categories")).status).toBe(200)
    const forbidden = await context.agent
      .post("/api/document-categories")
      .set("Origin", origin(context))
      .send({ name: "Interdit" })
    expect(forbidden.status).toBe(403)
  })
})
