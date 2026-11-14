import "dotenv/config"
import { createInterface } from "node:readline/promises"
import { eq } from "drizzle-orm"
import { loadEnvOrExit } from "../config.js"
import { createDatabase } from "../db/client.js"
import { users } from "../db/schema.js"
import { hashPassword, passwordPolicyIssues } from "../lib/password.js"

const env = loadEnvOrExit()
const email = process.argv[2]?.toLowerCase()
if (!email) {
  console.error("Usage : npm run user:passwd -- email@exemple.fr")
  process.exit(1)
}

const handle = createDatabase(env.DATABASE_URL)
const rl = createInterface({ input: process.stdin, output: process.stdout })

try {
  const [user] = await handle.db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) {
    console.error(`[user:passwd] Utilisateur introuvable : ${email}`)
    process.exitCode = 1
  } else {
    const password = await rl.question(`Nouveau mot de passe pour ${email} : `)
    const issues = passwordPolicyIssues(password)
    if (issues.length) {
      console.error(`[user:passwd] Mot de passe refusé : ${issues.join(", ")}`)
      process.exitCode = 1
    } else {
      await handle.db
        .update(users)
        .set({
          passwordHash: await hashPassword(password),
          passwordVersion: user.passwordVersion + 1,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
      console.log("[user:passwd] Mot de passe mis à jour, sessions à révoquer manuellement si besoin.")
    }
  }
} finally {
  rl.close()
  await handle.close()
}
