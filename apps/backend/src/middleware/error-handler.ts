import { MulterError } from "multer"
import { ZodError } from "zod"
import type { ErrorRequestHandler } from "express"
import type { Logger } from "pino"
import { ApiError } from "../lib/errors.js"

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error)

    const requestId = String(res.locals.requestId ?? "unknown")
    const log = (req as { log?: Logger }).log ?? logger

    let status = 500
    let code = "internal_error"
    let message = "Une erreur interne est survenue"
    let details: Record<string, string[]> | undefined

    if (error instanceof ApiError) {
      status = error.status
      code = error.code
      message = error.message
      details = error.details
    } else if (error instanceof ZodError) {
      status = 422
      code = "validation_error"
      message = "Données invalides"
      details = {}
      for (const issue of error.issues) {
        const key = issue.path.length ? issue.path.join(".") : "_"
        details[key] = [...(details[key] ?? []), issue.message]
      }
    } else if (error instanceof MulterError) {
      status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400
      code = error.code === "LIMIT_FILE_SIZE" ? "payload_too_large" : "upload_error"
      message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Fichier trop volumineux"
          : "Téléversement invalide"
    } else if (
      error instanceof SyntaxError &&
      "status" in error &&
      (error as { status?: number }).status === 400
    ) {
      status = 400
      code = "invalid_json"
      message = "Corps JSON invalide"
    }

    if (status >= 500) {
      log.error({ err: error, requestId }, "unhandled request error")
    } else {
      log.warn({ err: error, requestId, status, code }, "request rejected")
    }

    res.status(status).json({
      error: message,
      code,
      requestId,
      ...(details ? { details } : {}),
    })
  }
}
