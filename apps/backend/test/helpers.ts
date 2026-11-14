import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import pino from "pino"
import request from "supertest"
import { EnvSchema, type Env } from "@casarenous/shared"
import { createApp } from "../src/app.js"
import type { Database } from "../src/db/client.js"
import { seedDatabase } from "../src/db/seed.js"
import * as schema from "../src/db/schema.js"
import type {
  InvitationMailInput,
  Mailer,
  OtpMailInput,
} from "../src/lib/mailer.js"
import { migrationsFolder } from "../src/db/migrate.js"

export class CaptureMailer implements Mailer {
  codes: string[] = []
  invitations: string[] = []
  lastTo: string | null = null

  async sendOtp(input: OtpMailInput): Promise<void> {
    this.codes.push(input.code)
    this.lastTo = input.to
  }

  async sendInvitation(input: InvitationMailInput): Promise<void> {
    this.invitations.push(input.code)
    this.lastTo = input.to
  }
}

export interface TestContext {
  app: ReturnType<typeof createApp>
  db: Database
  env: Env
  mailer: CaptureMailer
  agent: ReturnType<typeof request.agent>
  close: () => Promise<void>
}

export async function createTestContext(
  overrides: Record<string, string | undefined> = {},
): Promise<TestContext> {
  const env = EnvSchema.parse({ ...process.env, ...overrides })
  const pglite = new PGlite()
  const db = drizzle(pglite, { schema }) as unknown as Database
  await migrate(db, { migrationsFolder: migrationsFolder() })
  await seedDatabase(db, env)

  const mailer = new CaptureMailer()
  const logger = pino({ level: "silent" })
  const app = createApp({ env, db, mailer, logger })
  const agent = request.agent(app)

  return {
    app,
    db,
    env,
    mailer,
    agent,
    close: async () => {
      await pglite.close()
    },
  }
}

export async function signIn(
  context: TestContext,
  email: string,
  password: string,
): Promise<{ id: string; role: string }> {
  const login = await context.agent
    .post("/api/auth/login")
    .set("Origin", context.env.APP_ORIGIN)
    .send({ email, password })
  if (login.status !== 200) {
    throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`)
  }
  const code = context.mailer.codes.at(-1)
  if (!code) throw new Error("OTP code not captured")

  const verify = await context.agent
    .post("/api/auth/otp")
    .set("Origin", context.env.APP_ORIGIN)
    .send({ code })
  if (verify.status !== 200) {
    throw new Error(`otp failed: ${verify.status} ${JSON.stringify(verify.body)}`)
  }
  return verify.body.user
}

export function origin(context: TestContext): string {
  return context.env.APP_ORIGIN
}

export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGM4UREARwzEcQCR0hkB/rK5kAAAAABJRU5ErkJggg==",
  "base64",
)

export function uploadPath(name = "photo.png"): string {
  return path.resolve(process.cwd(), "test", "fixtures", name)
}

/**
 * Construit un PDF minimal mais valide (1 page, texte non compressé) pour
 * les tests. Volontairement ASCII : les accents sont couverts par les tests
 * unitaires du parseur, pas par l'encodage PDF.
 */
export function makePdf(lines: string[]): Buffer {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  const operations = ["BT", "/F1 11 Tf", "14 TL", "50 800 Td"]
  for (const line of lines) {
    operations.push(`(${escape(line)}) Tj`, "T*")
  }
  operations.push("ET")
  const content = operations.join("\n")

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(pdf, "latin1")
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, "latin1")
}
