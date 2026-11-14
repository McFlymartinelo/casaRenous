import "dotenv/config"
import { mkdir } from "node:fs/promises"
import { createServer } from "node:http"
import { loadEnvOrExit } from "./config.js"
import { createApp } from "./app.js"
import { createDatabase } from "./db/client.js"
import { runMigrations } from "./db/migrate.js"
import { seedDatabase } from "./db/seed.js"
import { createLogger } from "./lib/logger.js"
import { createMailer } from "./lib/mailer.js"
import { startScheduler } from "./services/scheduler.js"

async function main() {
  const env = loadEnvOrExit()
  const logger = createLogger(env.LOG_LEVEL)

  await mkdir(env.UPLOAD_DIR, { recursive: true, mode: 0o700 })

  const handle = createDatabase(env.DATABASE_URL)
  await runMigrations(handle.db)

  if (env.SEED_ON_START) {
    const result = await seedDatabase(handle.db, env)
    if (result.generated.length) {
      for (const account of result.generated) {
        logger.warn(
          { email: account.email, role: account.role },
          "compte créé au démarrage — mot de passe affiché une seule fois sur la console du seed",
        )
      }
    }
  }

  const mailer = createMailer(env, logger)
  const app = createApp({ env, db: handle.db, mailer, logger })
  const server = createServer(app)
  const stopScheduler = startScheduler(handle.db, env, logger)

  server.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        origin: env.APP_ORIGIN,
        push: env.PUSH_ENABLED,
        mail: env.MAIL_TRANSPORT,
      },
      "CasaRenous API démarrée",
    )
  })

  let closing = false
  const shutdown = async (signal: string) => {
    if (closing) return
    closing = true
    logger.info({ signal }, "arrêt en cours")
    stopScheduler()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await handle.close()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

main().catch((error) => {
  console.error("[api] démarrage impossible", error)
  process.exit(1)
})
