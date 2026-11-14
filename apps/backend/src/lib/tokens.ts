import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

export function randomId(): string {
  return randomUUID()
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url")
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@")
  const visible = local.slice(0, 1)
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`
}
