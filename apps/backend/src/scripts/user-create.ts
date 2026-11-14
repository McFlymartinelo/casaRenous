import "dotenv/config"
import { createInterface } from "node:readline/promises"
import { eq } from "drizzle-orm"
import { loadEnvOrExit } from "../config.js"
import { createDatabase } from "../db/client.js"
import { users } from "../db/schema.js"
import { hashPassword, passwordPolicyIssues } from "../lib/password.js"

/**
 * Crée ou met à jour un compte directement en base, sans OTP.
 * Sert uniquement au bootstrap d'un vrai admin quand les comptes seedés
 * utilisent une adresse email non délivrable.
 *
 * Usage :
 *   npm run user:create -- email@exemple.fr "Nom affiché" admin
 */
const email = process.argv[2]?.trim().toLowerCase()
const displayName = process.argv[3]?.trim() || email?.split("@")[0] || ""
const role = process.argv[4] === "admin" ? "admin" : "invites"

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage : npm run user:create -- email@exemple.fr \"Nom affiché\" admin|invites")
  process.exit(1)
}

const env = loadEnvOrExit()
const handle = createDatabase(env.DATABASE_URL)
const rl = createInterface({ input: process.stdin, output: process.stdout })

try {
  const password = await rl.question(`Mot de passe pour ${email} (12+ caractères) : `)
  const issues = passwordPolicyIssues(password)
  if (issues.length) {
    console.error(`[user:create] Mot de passe refusé : ${issues.join(", ")}`)
    process.exitCode = 1
  } else {
    const passwordHash = await hashPassword(password)
    const [existing] = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing) {
      await handle.db
        .update(users)
        .set({
          displayName,
          role,
          passwordHash,
          passwordVersion: existing.passwordVersion + 1,
          failedAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
      console.log(`[user:create] Compte mis à jour : ${email} (${role})`)
      console.log("[user:create] Les sessions existantes restent valides ; change le mot de passe depuis l'UI pour les révoquer.")
    } else {
      await handle.db.insert(users).values({
        email,
        displayName,
        role,
        passwordHash,
      })
      console.log(`[user:create] Compte créé : ${email} (${role})`)
    }

    console.log("[user:create] Connecte-toi maintenant avec cette adresse. L'OTP arrivera sur cette boîte si SMTP est configuré.")
  }
} finally {
  rl.close()
  await handle.close()
}
