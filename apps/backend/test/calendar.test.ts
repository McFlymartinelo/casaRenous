import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import { createTestContext, origin, signIn, type TestContext } from "./helpers.js"

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await context.close()
})

describe("rétroplanning et export ICS", () => {
  it("seed le CCMI signé le 6 novembre 2026 et les jalons jusqu'en 2028", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const dates = await context.agent.get("/api/key-dates").expect(200)
    const ccmi = dates.body.find((item: { slug: string }) => item.slug === "signature-ccmi")
    expect(ccmi.date).toBe("2026-11-06")
    expect(ccmi.completedOn).toBe("2026-11-06")
    expect(ccmi.isProvisional).toBe(false)

    const livraison = dates.body.find((item: { slug: string }) => item.slug === "livraison")
    expect(livraison.date.startsWith("2028-")).toBe(true)

    const milestones = await context.agent.get("/api/milestones").expect(200)
    expect(milestones.body.length).toBeGreaterThanOrEqual(10)
    expect(
      milestones.body.some(
        (item: { title: string; status: string }) =>
          item.title.includes("CCMI") && item.status === "done",
      ),
    ).toBe(true)
  })

  it("produit un calendrier RFC 5545 avec alarmes", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent.get("/api/milestones/calendar.ics")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toContain("text/calendar")
    expect(res.text).toContain("BEGIN:VCALENDAR")
    expect(res.text).toContain("PRODID:-//CasaRenous//Retroplanning//FR")
    expect(res.text).toContain("SUMMARY:Signature du CCMI")
    expect(res.text).toContain("BEGIN:VALARM")
    expect(res.text).toContain("TRIGGER:-P7D")
    expect(res.text).toContain("DTSTART;VALUE=DATE:20280601")
    expect(res.text).toContain("\r\n")
  })

  it("refuse le flux sans session ni jeton", async () => {
    const res = await request(context.app).get("/api/milestones/calendar.ics")
    expect(res.status).toBe(401)
  })

  it("génère un jeton révocable pour les agendas externes", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const created = await context.agent
      .post("/api/calendar/token")
      .set("Origin", origin(context))
      .send({})
    expect(created.status).toBe(201)
    expect(created.body.url).toContain("/api/milestones/calendar.ics?token=")

    const url = new URL(created.body.url)
    const feed = await request(context.app).get(`${url.pathname}${url.search}`)
    expect(feed.status).toBe(200)
    expect(feed.text).toContain("BEGIN:VCALENDAR")

    const metadata = await context.agent.get("/api/calendar/token")
    expect(metadata.body.exists).toBe(true)
    expect(metadata.body.lastUsedAt).toBeTruthy()

    await context.agent
      .delete("/api/calendar/token")
      .set("Origin", origin(context))
      .expect(200)

    const revoked = await request(context.app).get(`${url.pathname}${url.search}`)
    expect(revoked.status).toBe(401)
  })
})
