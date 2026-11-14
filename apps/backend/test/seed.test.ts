import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { users } from "../src/db/schema.js"
import { createTestContext, type TestContext } from "./helpers.js"

let context: TestContext

beforeAll(async () => {
  context = await createTestContext({
    SEED_ADMIN_2_EMAIL: "second.admin@test.local",
    SEED_ADMIN_2_NAME: "Second Admin",
    SEED_ADMIN_2_PASSWORD: "Second-Admin-Password-2026!",
  })
})

afterAll(async () => {
  await context.close()
})

describe("seed", () => {
  it("crée le second administrateur quand SEED_ADMIN_2_* est défini", async () => {
    const [user] = await context.db
      .select()
      .from(users)
      .where(eq(users.email, "second.admin@test.local"))
      .limit(1)
    expect(user).toBeTruthy()
    expect(user?.role).toBe("admin")
    expect(user?.displayName).toBe("Second Admin")
  })
})
