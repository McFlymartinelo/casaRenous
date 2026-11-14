import { randomUUID } from "node:crypto"
import type { RequestHandler } from "express"

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id")
    const id =
      typeof incoming === "string" && /^[A-Za-z0-9._-]{8,100}$/.test(incoming)
        ? incoming
        : randomUUID()
    res.locals.requestId = id
    res.setHeader("X-Request-Id", id)
    ;(req as { id?: string }).id = id
    next()
  }
}
