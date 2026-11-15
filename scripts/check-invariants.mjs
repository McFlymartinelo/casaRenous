import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const ROOT = process.cwd()
const PORTAL = path.join(ROOT, "apps", "portal", "src")
const SCANNED_DIRS = ["components", "features", "screens", "auth"]
const HEX = /#[0-9a-fA-F]{3,8}\b/
const problems = []

async function walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/")
}

const files = []
for (const dir of SCANNED_DIRS) files.push(...(await walk(path.join(PORTAL, dir))))
for (const extra of ["App.tsx", "main.tsx"]) {
  try {
    await readFile(path.join(PORTAL, extra))
    files.push(path.join(PORTAL, extra))
  } catch {
    // absent
  }
}

for (const file of files) {
  const text = await readFile(file, "utf8")
  const name = rel(file)

  if (HEX.test(text)) {
    problems.push(`${name} : couleur hexadécimale codée en dur`)
  }

  if (/\bfetch\s*\(/.test(text)) {
    problems.push(`${name} : fetch() interdit hors api-client / media`)
  }

  if (
    /from\s+["']three["']|from\s+["']@react-three\//.test(text) &&
    !name.includes("features/viewer/")
  ) {
    // La 3D reste hors du bundle initial : seul le dossier features/viewer/
    // (atteint uniquement via le React.lazy de HouseViewer) importe three.
    problems.push(`${name} : import 3D statique (HouseViewer doit rester lazy)`)
  }

  if (
    name.endsWith("Screen.tsx") &&
    /^import\s+(?!type\b)(?:[^"'\n]|\n)*?from\s+["']@\/features\/viewer\/(HouseViewer|WalkRig|TouchStick)["']/m.test(
      text,
    )
  ) {
    problems.push(`${name} : la visionneuse doit être chargée via React.lazy`)
  }

  if (name.endsWith("Screen.tsx")) {
    const heroes = (text.match(/variant=["']hero["']/g) ?? []).length
    if (heroes > 1) problems.push(`${name} : ${heroes} cartes héro (max 1)`)
    const stats = (text.match(/<Stat\b/g) ?? []).length
    if (stats > 3) problems.push(`${name} : ${stats} Stat (max 3)`)
  }
}

const appCss = await readFile(path.join(PORTAL, "styles", "app.css"), "utf8")
if (HEX.test(appCss) || /oklch\(/.test(appCss)) {
  problems.push(
    "apps/portal/src/styles/app.css : couleur concrète interdite (utiliser var(--aura-*) ou color-mix)",
  )
}

const portalPackage = JSON.parse(
  await readFile(path.join(ROOT, "apps", "portal", "package.json"), "utf8"),
)
const dependencies = {
  ...(portalPackage.dependencies ?? {}),
  ...(portalPackage.devDependencies ?? {}),
}
for (const forbidden of ["tailwindcss", "shadcn", "shadcn-ui", "@radix-ui/react-dialog"]) {
  if (forbidden in dependencies) {
    problems.push(`apps/portal/package.json : dépendance UI interdite « ${forbidden} »`)
  }
}

if (problems.length) {
  console.error("\n[lint:aura] invariants violés :\n")
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error("")
  process.exit(1)
}

console.log(`[lint:aura] OK — ${files.length} fichiers UI vérifiés, tokens Aura uniquement.`)
