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

async function createInvitation(
  email: string,
  displayName: string,
  role: "admin" | "invites" = "invites",
) {
  return context.agent
    .post("/api/admin/invitations")
    .set("Origin", origin(context))
    .send({ email, displayName, role })
}

describe("inscription sur invitation + OTP", () => {
  it("réserve la création d'invitation à l'admin", async () => {
    await signIn(context, "sevin@test.local", "Sevin-Test-Password-2026!")
    const res = await createInvitation("nouveau@test.local", "Nouveau")
    expect(res.status).toBe(403)
  })

  it("crée une invitation, inscrit l'invité et ouvre sa session", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const invitation = await createInvitation(
      "nouveau@test.local",
      "Nouveau Voisin",
      "invites",
    )
    expect(invitation.status).toBe(201)
    expect(invitation.body.code).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(invitation.body.emailSent).toBe(true)

    const list = await context.agent.get("/api/admin/invitations")
    expect(list.status).toBe(200)
    expect(list.body.some((item: { id: string }) => item.id === invitation.body.invitation.id)).toBe(true)

    const inviteAgent = request.agent(context.app)
    const registration = await inviteAgent
      .post("/api/auth/register")
      .set("Origin", origin(context))
      .send({
        invitationCode: invitation.body.code,
        email: "nouveau@test.local",
        displayName: "Nouveau Voisin",
        password: "Nouveau-Test-Password-2026!",
      })
    expect(registration.status).toBe(200)
    expect(registration.body.needsOtp).toBe(true)

    const code = context.mailer.codes.at(-1)
    expect(code).toMatch(/^\d{6}$/)

    const verify = await inviteAgent
      .post("/api/auth/register/otp")
      .set("Origin", origin(context))
      .send({ code })
    expect(verify.status).toBe(201)
    expect(verify.body.user.role).toBe("invites")
    expect(verify.body.user.email).toBe("nouveau@test.local")

    const me = await inviteAgent.get("/api/auth/me")
    expect(me.status).toBe(200)
    expect(me.body.user.role).toBe("invites")

    const reuse = await request(context.app)
      .post("/api/auth/register")
      .set("Origin", origin(context))
      .send({
        invitationCode: invitation.body.code,
        email: "nouveau@test.local",
        displayName: "Nouveau Voisin",
        password: "Nouveau-Test-Password-2026!",
      })
    expect(reuse.status).toBe(401)
    expect(reuse.body.code).toBe("invitation_invalid")
  })

  it("refuse une invitation dont l'email ne correspond pas", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const invitation = await createInvitation("cible@test.local", "Cible")
    const res = await request(context.app)
      .post("/api/auth/register")
      .set("Origin", origin(context))
      .send({
        invitationCode: invitation.body.code,
        email: "autre@test.local",
        displayName: "Autre",
        password: "Autre-Test-Password-2026!",
      })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe("invitation_invalid")
  })

  it("refuse un code OTP incorrect puis accepte le bon", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const invitation = await createInvitation("otp@test.local", "Test OTP")
    const agent = request.agent(context.app)
    await agent
      .post("/api/auth/register")
      .set("Origin", origin(context))
      .send({
        invitationCode: invitation.body.code,
        email: "otp@test.local",
        displayName: "Test OTP",
        password: "Otp-Test-Password-2026!",
      })
      .expect(200)

    const wrong = await agent
      .post("/api/auth/register/otp")
      .set("Origin", origin(context))
      .send({ code: "000000" })
    expect(wrong.status).toBe(401)
    expect(wrong.body.code).toBe("otp_invalid")

    const code = context.mailer.codes.at(-1) as string
    const ok = await agent
      .post("/api/auth/register/otp")
      .set("Origin", origin(context))
      .send({ code })
    expect(ok.status).toBe(201)
    expect(ok.body.user.email).toBe("otp@test.local")
  })

  it("permet d'inviter un second administrateur", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const invitation = await createInvitation("admin2@test.local", "Admin 2", "admin")
    const agent = request.agent(context.app)
    await agent
      .post("/api/auth/register")
      .set("Origin", origin(context))
      .send({
        invitationCode: invitation.body.code,
        email: "admin2@test.local",
        displayName: "Admin 2",
        password: "Admin2-Test-Password-2026!",
      })
      .expect(200)
    const code = context.mailer.codes.at(-1) as string
    const verify = await agent
      .post("/api/auth/register/otp")
      .set("Origin", origin(context))
      .send({ code })
    expect(verify.status).toBe(201)
    expect(verify.body.user.role).toBe("admin")
  })

  it("révoque une invitation et bloque l'inscription", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const invitation = await createInvitation("revoque@test.local", "Révoqué")
    const revoke = await context.agent
      .delete(`/api/admin/invitations/${invitation.body.invitation.id}`)
      .set("Origin", origin(context))
    expect(revoke.status).toBe(200)

    const res = await request(context.app)
      .post("/api/auth/register")
      .set("Origin", origin(context))
      .send({
        invitationCode: invitation.body.code,
        email: "revoque@test.local",
        displayName: "Révoqué",
        password: "Revoque-Test-Password-2026!",
      })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe("invitation_invalid")
  })

  it("refuse un email déjà utilisé", async () => {
    await signIn(context, "admin@test.local", "Admin-Test-Password-2026!")
    const res = await createInvitation("sevin@test.local", "Doublon")
    expect(res.status).toBe(409)
    expect(res.body.code).toBe("email_taken")
  })
})
