import type { Role } from "@casarenous/shared"
import type { RequestHandler } from "express"
import { ApiError } from "../lib/errors.js"
import type { AuthLocals } from "./require-auth.js"

export function requireRole(...roles: Role[]): RequestHandler {
  const allowed = new Set<Role>(roles)
  return (_req, res, next) => {
    const auth = res.locals.auth as AuthLocals | undefined
    if (!auth) return next(ApiError.unauthorized("Connexion requise", "auth_required"))
    if (!allowed.has(auth.user.role)) {
      return next(ApiError.forbidden("Ton rôle ne permet pas cette action", "role_forbidden"))
    }
    return next()
  }
}
