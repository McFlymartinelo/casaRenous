import type { Logger } from "pino"
import pino from "pino"

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "casarenous-api" },
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers['set-cookie']",
        "*.password",
        "*.newPassword",
        "*.currentPassword",
        "*.code",
        "*.token",
        "*.otp",
        "err.body",
        "err.rawBody",
      ],
      censor: "[redacted]",
    },
  })
}
