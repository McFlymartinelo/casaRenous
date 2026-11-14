import { Router } from "express"
import { sql } from "drizzle-orm"
import type { Database } from "../db/client.js"
import { asyncHandler } from "../lib/http.js"

export function healthRouter(db: Database): Router {
  const router = Router()

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      try {
        await db.execute(sql`select 1`)
        res.json({ status: "ok", db: "up" })
      } catch {
        res.status(503).json({ status: "degraded", db: "down" })
      }
    }),
  )

  return router
}
