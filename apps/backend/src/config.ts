import { EnvSchema, type Env } from "@casarenous/shared"

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuration invalide :\n${issues.join("\n")}`)
    this.name = "EnvError"
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`,
    )
    throw new EnvError(issues)
  }
  return parsed.data
}

export function loadEnvOrExit(source: NodeJS.ProcessEnv = process.env): Env {
  try {
    return parseEnv(source)
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(`\n[config] ${error.message}\n`)
      process.exit(1)
    }
    throw error
  }
}
