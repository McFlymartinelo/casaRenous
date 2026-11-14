export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, string[]>

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message: string, code = "bad_request"): ApiError {
    return new ApiError(400, code, message)
  }

  static unauthorized(message = "Session invalide", code = "unauthorized"): ApiError {
    return new ApiError(401, code, message)
  }

  static forbidden(message = "Accès refusé", code = "forbidden"): ApiError {
    return new ApiError(403, code, message)
  }

  static notFound(message = "Introuvable", code = "not_found"): ApiError {
    return new ApiError(404, code, message)
  }

  static conflict(message: string, code = "conflict"): ApiError {
    return new ApiError(409, code, message)
  }

  static unprocessable(
    message: string,
    details?: Record<string, string[]>,
    code = "validation_error",
  ): ApiError {
    return new ApiError(422, code, message, details)
  }

  static tooLarge(message = "Fichier trop volumineux", code = "payload_too_large"): ApiError {
    return new ApiError(413, code, message)
  }

  static unsupportedMedia(
    message = "Type de fichier non autorisé",
    code = "unsupported_media_type",
  ): ApiError {
    return new ApiError(415, code, message)
  }

  static tooMany(message = "Trop de requêtes", code = "rate_limited"): ApiError {
    return new ApiError(429, code, message)
  }

  static internal(message = "Erreur interne", code = "internal_error"): ApiError {
    return new ApiError(500, code, message)
  }
}
