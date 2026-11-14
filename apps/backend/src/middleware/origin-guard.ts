import type { Env } from "@casarenous/shared"
import type { RequestHandler } from "express"
import { ApiError } from "../lib/errors.js"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Protection CSRF par vérification stricte de l'en-tête Origin.
 * Toute mutation (POST/PATCH/PUT/DELETE) doit venir d'une origine autorisée.
 * Le cookie SameSite=Lax est la seconde barrière ; Origin est la première.
 */
export function originGuard(env: Env): RequestHandler {
  const allowed = new Set(
    [env.APP_ORIGIN, ...env.EXTRA_ORIGINS].map((origin) => origin.toLowerCase()),
  )

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()

    const origin = req.header("origin")?.toLowerCase()
    if (!origin || !allowed.has(origin)) {
      return next(
        ApiError.forbidden("Origine de la requête non autorisée", "origin_not_allowed"),
      )
    }

    const fetchSite = req.header("sec-fetch-site")
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return next(
        ApiError.forbidden("Requête cross-site refusée", "cross_site_request"),
      )
    }

    const contentType = req.header("content-type")
    if (
      contentType &&
      !contentType.toLowerCase().startsWith("application/json") &&
      !contentType.toLowerCase().startsWith("multipart/form-data")
    ) {
      return next(
        ApiError.unsupportedMedia("Content-Type JSON ou multipart attendu", "bad_content_type"),
      )
    }

    return next()
  }
}
