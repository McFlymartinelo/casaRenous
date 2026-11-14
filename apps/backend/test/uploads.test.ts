import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { createTestContext, origin, signIn, tinyPng, type TestContext } from "./helpers.js"

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await context.close()
})

describe("coffre-fort documentaire", () => {
  it("refuse un faux fichier PDF (magic bytes)", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent
      .post("/api/documents")
      .set("Origin", origin(context))
      .field("title", "Faux PDF")
      .field("category", "autre")
      .attach("file", Buffer.from("ceci n'est pas un pdf"), {
        filename: "fake.pdf",
        contentType: "application/pdf",
      })
    expect(res.status).toBe(415)
    expect(res.body.code).toBe("unsupported_media_type")
  })

  it("accepte un PNG valide, le chiffre et le sert uniquement authentifié", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent
      .post("/api/documents")
      .set("Origin", origin(context))
      .field("title", "Plan de masse")
      .field("category", "plan")
      .attach("file", tinyPng, {
        filename: "plan.png",
        contentType: "image/png",
      })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe("Plan de masse")
    expect(res.body.mime).toBe("image/png")

    const file = await context.agent.get(`/api/documents/${res.body.id}/file`)
    expect(file.status).toBe(200)
    expect(file.headers["content-type"]).toBe("image/png")
    expect(file.headers["content-disposition"]).toContain("attachment")
    expect(Buffer.isBuffer(file.body)).toBe(true)
    expect(Buffer.compare(file.body as Buffer, tinyPng)).toBe(0)

    const anonymous = await request(context.app).get(`/api/documents/${res.body.id}/file`)
    expect(anonymous.status).toBe(401)
  })

  it("soft-delete un document et bloque le téléchargement", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const list = await context.agent.get("/api/documents").expect(200)
    const target = list.body.items[0]
    const deleted = await context.agent
      .delete(`/api/documents/${target.id}`)
      .set("Origin", origin(context))
    expect(deleted.status).toBe(200)
    const file = await context.agent.get(`/api/documents/${target.id}/file`)
    expect(file.status).toBe(404)
  })
})

describe("journal photo", () => {
  it("ré-encode la photo, extrait la géolocalisation et est idempotent", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    const clientId = randomUUID()
    const payload = context.agent
      .post("/api/photos")
      .set("Origin", origin(context))
      .field("caption", "Fondations côté jardin")
      .field("takenAt", "2026-11-13T10:30:00+01:00")
      .field("lat", "48.8566")
      .field("lng", "2.3522")
      .field("accuracyM", "12.5")
      .field("clientId", clientId)
      .attach("file", tinyPng, {
        filename: "chantier.png",
        contentType: "image/png",
      })

    const res = await payload
    expect(res.status).toBe(201)
    expect(res.body.mime).toBe("image/jpeg")
    expect(res.body.lat).toBeCloseTo(48.8566)
    expect(res.body.lng).toBeCloseTo(2.3522)

    const duplicate = await context.agent
      .post("/api/photos")
      .set("Origin", origin(context))
      .field("takenAt", "2026-11-13T10:30:00+01:00")
      .field("clientId", clientId)
      .attach("file", tinyPng, {
        filename: "chantier.png",
        contentType: "image/png",
      })
    expect(duplicate.status).toBe(200)
    expect(duplicate.body.id).toBe(res.body.id)

    const thumb = await context.agent.get(`/api/photos/${res.body.id}/thumb`)
    expect(thumb.status).toBe(200)
    expect(thumb.headers["content-type"]).toBe("image/jpeg")

    const list = await context.agent.get("/api/photos").expect(200)
    expect(list.body.items.some((item: { id: string }) => item.id === res.body.id)).toBe(true)
  })

  it("refuse une photo non authentifiée", async () => {
    const res = await request(context.app)
      .post("/api/photos")
      .set("Origin", origin(context))
      .field("takenAt", "2026-11-13T10:30:00+01:00")
      .field("clientId", randomUUID())
      .attach("file", tinyPng, { filename: "x.png", contentType: "image/png" })
    expect(res.status).toBe(401)
  })

  it("refuse un fichier texte déguisé en image", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent
      .post("/api/photos")
      .set("Origin", origin(context))
      .field("takenAt", "2026-11-13T10:30:00+01:00")
      .field("clientId", randomUUID())
      .attach("file", Buffer.from("<html>attaque</html>"), {
        filename: "x.png",
        contentType: "image/png",
      })
    expect(res.status).toBe(415)
  })
})
