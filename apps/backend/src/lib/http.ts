import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { ZodTypeAny, z } from "zod"
import { ApiError } from "./errors.js"

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}

function zodDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_"
    details[key] = [...(details[key] ?? []), issue.message]
  }
  return details
}

export function parseBody<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw ApiError.unprocessable("Données invalides", zodDetails(parsed.error))
  }
  return parsed.data
}

export function parseQuery<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw ApiError.unprocessable("Paramètres invalides", zodDetails(parsed.error))
  }
  return parsed.data
}

export function parseParams<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw ApiError.unprocessable("Paramètres invalides", zodDetails(parsed.error))
  }
  return parsed.data
}
