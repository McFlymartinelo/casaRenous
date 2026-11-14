import { describe, expect, it } from "vitest"
import {
  centsToInput,
  EnvSchema,
  formatCents,
  parseEuroToCents,
  PROJECT_END_DATE,
} from "../src/index.js"

describe("montants en centimes", () => {
  it("convertit les saisies françaises sans flottant", () => {
    expect(parseEuroToCents("1 234,56 €")).toBe(123456)
    expect(parseEuroToCents("1234.56")).toBe(123456)
    expect(parseEuroToCents("12,5")).toBe(1250)
    expect(parseEuroToCents("-500")).toBe(-50000)
    expect(parseEuroToCents("0,01")).toBe(1)
  })

  it("refuse les saisies invalides", () => {
    expect(parseEuroToCents("")).toBeNull()
    expect(parseEuroToCents("12,345")).toBeNull()
    expect(parseEuroToCents("abc")).toBeNull()
    expect(parseEuroToCents("1e3")).toBeNull()
  })

  it("formate et ré-édite les centimes", () => {
    expect(formatCents(123456).replace(/[\u202f\u00a0]/g, " ")).toContain("1 234,56")
    expect(centsToInput(123456)).toBe("1234,56")
    expect(centsToInput(-50000)).toBe("-500,00")
  })
})

describe("environnement", () => {
  it("valide un environnement de développement", () => {
    const env = EnvSchema.parse({
      NODE_ENV: "development",
      APP_ORIGIN: "http://localhost:5173",
      SESSION_SECRET: "x".repeat(40),
      OTP_PEPPER: "y".repeat(40),
      FILE_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    })
    expect(env.APP_ORIGIN).toBe("http://localhost:5173")
    expect(env.PORT).toBe(3000)
  })

  it("refuse la production sans HTTPS ni secrets réels", () => {
    const result = EnvSchema.safeParse({
      NODE_ENV: "production",
      APP_ORIGIN: "http://casa.example",
      SESSION_SECRET: "x".repeat(40),
      OTP_PEPPER: "dev-otp-pepper-change-me-32-characters",
      FILE_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      MAIL_TRANSPORT: "console",
    })
    expect(result.success).toBe(false)
  })

  it("borne l'horizon du projet", () => {
    expect(PROJECT_END_DATE).toBe("2028-12-31")
  })
})
