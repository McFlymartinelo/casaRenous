import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import type { ScryptOptions } from "node:crypto"

const N = 16_384
const R = 8
const P = 1
const KEY_LENGTH = 64

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

/**
 * Format versionné : scrypt$N$r$p$salt$hash (base64url).
 * Les paramètres sont relus à la vérification, ce qui permet de les durcir
 * plus tard sans invalider les hashes existants.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  })
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$")
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  const salt = Buffer.from(parts[4] ?? "", "base64url")
  const expected = Buffer.from(parts[5] ?? "", "base64url")
  if (salt.length < 8 || expected.length === 0) return false

  const key = await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  })
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}

/**
 * Consomme le même coût CPU qu'une vérification réelle quand l'utilisateur
 * n'existe pas, pour limiter l'énumération par timing.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  const salt = randomBytes(16)
  await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  })
}

export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < 12) issues.push("12 caractères minimum")
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length
  if (classes < 3) issues.push("au moins 3 familles de caractères")
  return issues
}
