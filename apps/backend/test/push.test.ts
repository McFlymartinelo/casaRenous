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

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/wp/test-endpoint",
  keys: {
    p256dh: "BOr8p1n7m6q5r4s3t2u1v0w9x8y7z6a5b4c3d2e1f0g",
    auth: "auth-secret-123456",
  },
}

describe("push VAPID", () => {
  it("exige une session", async () => {
    const res = await request(context.app).get("/api/push/vapid")
    expect(res.status).toBe(401)
  })

  it("refuse un endpoint hors allowlist (anti-SSRF)", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent
      .post("/api/push/subscribe")
      .set("Origin", origin(context))
      .send({
        ...validSubscription,
        endpoint: "https://evil.example/push",
      })
    expect(res.status).toBe(422)
  })

  it("abonne, liste puis désabonne un appareil", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const subscribe = await context.agent
      .post("/api/push/subscribe")
      .set("Origin", origin(context))
      .send(validSubscription)
    expect(subscribe.status).toBe(200)

    const status = await context.agent.get("/api/push/status")
    expect(status.status).toBe(200)
    expect(status.body.configured).toBe(false)
    expect(status.body.subscriptions).toBe(1)

    const testPush = await context.agent
      .post("/api/push/test")
      .set("Origin", origin(context))
      .send({})
    expect(testPush.status).toBe(200)
    expect(testPush.body.skipped).toBe(true)

    const unsubscribe = await context.agent
      .post("/api/push/unsubscribe")
      .set("Origin", origin(context))
      .send({ endpoint: validSubscription.endpoint })
    expect(unsubscribe.status).toBe(200)

    const after = await context.agent.get("/api/push/status")
    expect(after.body.subscriptions).toBe(0)
  })

  it("accepte un endpoint Apple", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await context.agent
      .post("/api/push/subscribe")
      .set("Origin", origin(context))
      .send({
        ...validSubscription,
        endpoint: "https://web.push.apple.com/QGVsbG8",
      })
    expect(res.status).toBe(200)
  })
})
