import type { Env } from "@casarenous/shared"
import { SESSION_COOKIE } from "@casarenous/shared"
import type { RequestHandler } from "express"
import type { Database } from "../db/client.js"
import { cookieName, readCookie } from "../lib/cookies.js"
import { ApiError } from "../lib/errors.js"
import { resolveSession } from "../services/auth.js"

export interface AuthLocals {
  user: import("@casarenous/shared").UserPublic
  sessionId: string
}

export function requireAuth(db: Database, env: Env): RequestHandler {
  const name = cookieName(SESSION_COOKIE, env.NODE_ENV === "production")

  return async (req, res, next) => {
    try {
      const token = readCookie(req.header("cookie"), name)
      if (!token) throw ApiError.unauthorized("Connexion requise", "auth_required")

      const session = await resolveSession(db, env, token)
      if (!session) {
        throw ApiError.unauthorized("Session expirée, reconnecte-toi", "session_expired")
      }

      res.locals.auth = {
        user: session.user,
        sessionId: session.sessionId,
      } satisfies AuthLocals
      next()
    } catch (error) {
      next(error)
    }
  }
}
