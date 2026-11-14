import express from "express"
import helmet from "helmet"
import type { IncomingMessage, ServerResponse } from "node:http"
import { pinoHttp } from "pino-http"
import type { Logger } from "pino"
import type { Env } from "@casarenous/shared"
import type { Database } from "./db/client.js"
import { ApiError } from "./lib/errors.js"
import type { Mailer } from "./lib/mailer.js"
import { errorHandler } from "./middleware/error-handler.js"
import { originGuard } from "./middleware/origin-guard.js"
import { createRateLimiters } from "./middleware/rate-limit.js"
import { requestId } from "./middleware/request-id.js"
import { adminRouter } from "./routes/admin.js"
import { authRouter } from "./routes/auth.js"
import { budgetRouter } from "./routes/budget.js"
import { documentsRouter } from "./routes/documents.js"
import { healthRouter } from "./routes/health.js"
import { keyDatesRouter } from "./routes/key-dates.js"
import { milestonesRouter } from "./routes/milestones.js"
import { notesRouter } from "./routes/notes.js"
import { photosRouter } from "./routes/photos.js"
import { pushRouter } from "./routes/push.js"
import { reservesRouter } from "./routes/reserves.js"
import { roomsRouter } from "./routes/rooms.js"

export interface AppDependencies {
  env: Env
  db: Database
  mailer: Mailer
  logger: Logger
}

export function createApp({ env, db, mailer, logger }: AppDependencies) {
  const app = express()
  const limiters = createRateLimiters(env)

  app.disable("x-powered-by")
  app.set("trust proxy", env.TRUST_PROXY)

  app.use(requestId())
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => String(res.locals.requestId ?? "unknown"),
      // On ne journalise ni les en-têtes (cookies) ni la query string :
      // les jetons de calendrier et d'OTP ne doivent jamais atterrir dans les logs.
      serializers: {
        req: (req: IncomingMessage & { id?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
          remoteAddress: req.socket?.remoteAddress,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      autoLogging: {
        ignore: (req) => req.url === "/api/health",
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return "error"
        if (res.statusCode >= 400) return "warn"
        return "info"
      },
    }),
  )
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
      hsts:
        env.NODE_ENV === "production"
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
          : false,
    }),
  )
  app.use(originGuard(env))
  app.use(express.json({ limit: "1mb", strict: true }))
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store")
    next()
  })

  app.use("/api", limiters.global)
  app.use("/api/auth", authRouter({ db, env, mailer, limiters }))
  app.use("/api", healthRouter(db))
  app.use("/api", roomsRouter(db, env))
  app.use("/api", keyDatesRouter(db, env))
  app.use("/api", milestonesRouter(db, env, limiters))
  app.use("/api", documentsRouter(db, env, limiters))
  app.use("/api", photosRouter(db, env, limiters))
  app.use("/api", notesRouter(db, env))
  app.use("/api", reservesRouter(db, env))
  app.use("/api", budgetRouter(db, env))
  app.use("/api", pushRouter(db, env, limiters))
  app.use("/api", adminRouter(db, env, mailer))

  app.use("/api", (_req, _res, next) => {
    next(ApiError.notFound("Route API inconnue", "route_not_found"))
  })

  app.use(errorHandler(logger))

  return app
}
