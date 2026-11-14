import type { CookieOptions, Response } from "express"

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    if (key !== name) continue
    const raw = part.slice(index + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions & { maxAgeSeconds?: number },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${options.path ?? "/"}`)
  if (options.httpOnly !== false) parts.push("HttpOnly")
  const sameSite = options.sameSite ?? "Lax"
  const sameSiteValue =
    typeof sameSite === "string"
      ? `${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1).toLowerCase()}`
      : sameSite
        ? "Strict"
        : "Lax"
  parts.push(`SameSite=${sameSiteValue}`)
  if (options.secure) parts.push("Secure")
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  }
  if (options.domain) parts.push(`Domain=${options.domain}`)
  return parts.join("; ")
}

export function appendSetCookie(res: Response, cookie: string): void {
  const existing = res.getHeader("Set-Cookie")
  const list = Array.isArray(existing)
    ? existing.map(String)
    : typeof existing === "string"
      ? [existing]
      : []
  res.setHeader("Set-Cookie", [...list, cookie])
}

export function cookieName(base: string, production: boolean): string {
  return production ? `__Host-${base}` : base
}
