import type { Env } from "@casarenous/shared"
import { rateLimit } from "express-rate-limit"
import type { RequestHandler } from "express"
import { ApiError } from "../lib/errors.js"

function limiter(options: {
  windowMs: number
  limit: number
  skipSuccessfulRequests?: boolean
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    handler: (_req, _res, next) => {
      next(ApiError.tooMany("Trop de requêtes, réessaie plus tard", "rate_limited"))
    },
  })
}

export interface RateLimiters {
  global: RequestHandler
  login: RequestHandler
  otp: RequestHandler
  otpResend: RequestHandler
  upload: RequestHandler
  pushTest: RequestHandler
  calendar: RequestHandler
}

export function createRateLimiters(_env: Env): RateLimiters {
  return {
    global: limiter({ windowMs: 60_000, limit: 300 }),
    login: limiter({
      windowMs: 15 * 60_000,
      limit: 10,
      skipSuccessfulRequests: true,
    }),
    otp: limiter({ windowMs: 15 * 60_000, limit: 20 }),
    otpResend: limiter({ windowMs: 60 * 60_000, limit: 8 }),
    upload: limiter({ windowMs: 60 * 60_000, limit: 60 }),
    pushTest: limiter({ windowMs: 60 * 60_000, limit: 3 }),
    calendar: limiter({ windowMs: 15 * 60_000, limit: 60 }),
  }
}
