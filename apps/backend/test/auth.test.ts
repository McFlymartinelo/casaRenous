import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestContext, origin, signIn, type TestContext } from "./helpers.js"

let context: TestContext

beforeAll(async () => {
  context = await createTestContext()
})

afterAll(async () => {
  await context.close()
})

describe("santé et CSRF", () => {
  it("expose /api/health sans authentification", async () => {
    const res = await context.agent.get("/api/health")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: "ok", db: "up" })
  })

  it("refuse une mutation sans Origin", async () => {
    const res = await context.agent
      .post("/api/auth/login")
      .send({ email: "admin@test.local", password: "x" })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe("origin_not_allowed")
  })

  it("refuse une origine inconnue", async () => {
    const res = await context.agent
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "admin@test.local", password: "x" })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe("origin_not_allowed")
  })

  it("refuse une requête marquée cross-site", async () => {
    const res = await context.agent
      .post("/api/auth/login")
      .set("Origin", origin(context))
      .set("Sec-Fetch-Site", "cross-site")
      .send({ email: "admin@test.local", password: "x" })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe("cross_site_request")
  })

  it("refuse un Content-Type non JSON", async () => {
    const res = await context.agent
      .post("/api/auth/login")
      .set("Origin", origin(context))
      .set("Content-Type", "text/plain")
      .send("hello")
    expect(res.status).toBe(415)
    expect(res.body.code).toBe("bad_content_type")
  })
})

describe("authentification par mot de passe + OTP", () => {
  it("renvoie une erreur générique sur mauvais mot de passe", async () => {
    const res = await context.agent
      .post("/api/auth/login")
      .set("Origin", origin(context))
      .send({ email: "admin@test.local", password: "Mauvais-Mot-De-Passe" })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe("invalid_credentials")
    expect(JSON.stringify(res.body)).not.toContain("admin@test.local")
  })

  it("connecte l'admin après OTP et pose un cookie HttpOnly SameSite=Lax", async () => {
    const login = await context.agent
      .post("/api/auth/login")
      .set("Origin", origin(context))
      .send({ email: "admin@test.local", password: "Admin-Test-Password-2026!" })
    expect(login.status).toBe(200)
    expect(login.body.needsOtp).toBe(true)
    expect(login.body.emailMasked).toBe("a****@test.local")

    const code = context.mailer.codes.at(-1)
    expect(code).toMatch(/^\d{6}$/)

    const verify = await context.agent
      .post("/api/auth/otp")
      .set("Origin", origin(context))
      .send({ code })
    expect(verify.status).toBe(200)
    expect(verify.body.user.role).toBe("admin")

    const cookies = verify.headers["set-cookie"] as unknown as string[]
    const session = cookies.find((cookie) => cookie.startsWith("cr_session="))
    expect(session).toContain("HttpOnly")
    expect(session).toContain("SameSite=Lax")
    expect(session).toContain("Path=/")

    const me = await context.agent.get("/api/auth/me")
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe("admin@test.local")
  })

  it("rejette un code OTP incorrect puis le rejeu", async () => {
    await context.agent
      .post("/api/auth/login")
      .set("Origin", origin(context))
      .send({ email: "sevin@test.local", password: "Sevin-Test-Password-2026!" })
      .expect(200)

    const wrong = await context.agent
      .post("/api/auth/otp")
      .set("Origin", origin(context))
      .send({ code: "000000" })
    expect(wrong.status).toBe(401)
    expect(wrong.body.code).toBe("otp_invalid")

    const code = context.mailer.codes.at(-1) as string
    const ok = await context.agent
      .post("/api/auth/otp")
      .set("Origin", origin(context))
      .send({ code })
    expect(ok.status).toBe(200)

    const replay = await context.agent
      .post("/api/auth/otp")
      .set("Origin", origin(context))
      .send({ code })
    expect(replay.status).toBe(401)
  })

  it("déconnecte et invalide la session", async () => {
    const user = await signIn(
      context,
      "sevin@test.local",
      "Sevin-Test-Password-2026!",
    )
    expect(user.role).toBe("invites")

    await context.agent
      .post("/api/auth/logout")
      .set("Origin", origin(context))
      .expect(200)

    const me = await context.agent.get("/api/auth/me")
    expect(me.status).toBe(401)
  })

  it("liste les sessions actives", async () => {
    await signIn(context, "renous@test.local", "Renous-Test-Password-2026!")
    const res = await context.agent.get("/api/auth/sessions")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.some((session: { current: boolean }) => session.current)).toBe(true)
  })

  it("révoque les sessions au changement de mot de passe", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    const change = await context.agent
      .post("/api/auth/password")
      .set("Origin", origin(context))
      .send({
        currentPassword: "Sevin-Test-Password-2026!",
        newPassword: "Sevin-New-Password-2026!",
      })
    expect(change.status).toBe(200)

    const me = await context.agent.get("/api/auth/me")
    expect(me.status).toBe(401)

    await signIn(context, "sevin@test.local", "Sevin-New-Password-2026!")
  })

  it("verrouille un compte après cinq échecs", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await context.agent
        .post("/api/auth/login")
        .set("Origin", origin(context))
        .send({ email: "renous@test.local", password: "Mauvais-Mot-De-Passe" })
      expect(res.status).toBe(401)
    }

    const locked = await context.agent
      .post("/api/auth/login")
      .set("Origin", origin(context))
      .send({ email: "renous@test.local", password: "Renous-Test-Password-2026!" })
    expect(locked.status).toBe(401)
    expect(locked.body.code).toBe("invalid_credentials")
  })
})
