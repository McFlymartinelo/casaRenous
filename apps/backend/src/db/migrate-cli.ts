import "dotenv/config"
import { loadEnvOrExit } from "../config.js"
import { createDatabase } from "./client.js"
import { runMigrations } from "./migrate.js"

const env = loadEnvOrExit()
const handle = createDatabase(env.DATABASE_URL)
try {
  await runMigrations(handle.db)
  console.log("[migrate] base à jour")
} finally {
  await handle.close()
}
