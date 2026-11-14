import "dotenv/config"
import { loadEnvOrExit } from "../config.js"
import { createDatabase } from "./client.js"
import { runMigrations } from "./migrate.js"
import { seedDatabase } from "./seed.js"

const env = loadEnvOrExit()
const handle = createDatabase(env.DATABASE_URL)

try {
  await runMigrations(handle.db)
  const result = await seedDatabase(handle.db, env)

  if (result.generated.length) {
    console.log("\n[seed] Comptes créés — note ces mots de passe, ils ne seront plus affichés :\n")
    for (const item of result.generated) {
      console.log(`  ${item.role.padEnd(8)} ${item.email}  ${item.password}`)
    }
    console.log("\n  Change-les depuis Réglages → Mot de passe après la première connexion.\n")
  } else {
    console.log("[seed] Aucun compte créé (déjà présents). Données de référence à jour.")
  }
} finally {
  await handle.close()
}
