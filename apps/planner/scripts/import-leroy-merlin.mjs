/**
 * Import d'un catalogue Leroy Merlin (FR) dans le planificateur.
 *
 * Leroy Merlin ne publie ni API publique ni modèles 3D, et ses fiches produits
 * sont protégées (DataDome). Les données sont donc récupérées via API.SH
 * (https://api.sh/leroymerlin) avec une clé gratuite : 1000 crédits/mois.
 *
 * Configuration : APISH_KEY dans l'environnement ou dans un .env (racine ou
 * apps/planner). Endpoint surchargeable avec APISH_BASE_URL pour les tests.
 *
 * Usage :
 *   node scripts/import-leroy-merlin.mjs
 *   node scripts/import-leroy-merlin.mjs --max=30 --dry-run --force
 *   node scripts/import-leroy-merlin.mjs --out=/tmp/catalog.ts
 *
 * Génère src/catalog/catalog-leroy-merlin.ts. Les meubles n'ont pas de GLB :
 * le planner utilise leurs modèles paramétriques (champ `kind`).
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REPO = path.resolve(ROOT, "..", "..")
const CATALOG_FILE = path.join(ROOT, "src", "catalog", "catalog-leroy-merlin.ts")
const CACHE_DIR = path.join(ROOT, ".cache", "leroy-merlin")
const BASE = process.env.APISH_BASE_URL || "https://api.api.sh"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const force = args.has("--force")
const option = (name, fallback) => {
  const found = [...args].find((arg) => arg.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}
const MAX = Number(option("max", "150"))
const OUT = option("out", CATALOG_FILE)
if (!Number.isFinite(MAX) || MAX <= 0) throw new Error("--max doit être un entier positif")

/** Requêtes ciblées sur le mobilier, pas sur l'outillage ou les matériaux. */
const PLAN = [
  { q: "meuble salle de bain lavabo", category: "Salle d'eau", kind: "vanity", limit: 3 },
  { q: "lavabo salle de bain", category: "Salle d'eau", kind: "vanity", limit: 2 },
  { q: "cabine de douche", category: "Salle d'eau", kind: "shower", limit: 2 },
  { q: "baignoire", category: "Salle d'eau", kind: "bathtub", limit: 2 },
  { q: "wc toilette", category: "Salle d'eau", kind: "toilet", limit: 2 },
  { q: "meuble de cuisine bas", category: "Cuisine", kind: "kitchenBase", limit: 3 },
  { q: "ilot cuisine", category: "Cuisine", kind: "kitchenIsland", limit: 2 },
  { q: "table a manger", category: "Salon", kind: "diningTable", limit: 3 },
  { q: "chaise", category: "Salon", kind: "diningChair", limit: 3 },
  { q: "canape", category: "Salon", kind: "sofa", limit: 3 },
  { q: "fauteuil", category: "Salon", kind: "armchair", limit: 2 },
  { q: "table basse", category: "Salon", kind: "coffeeTable", limit: 2 },
  { q: "meuble tv", category: "Salon", kind: "tvUnit", limit: 2 },
  { q: "bibliotheque", category: "Salon", kind: "shelf", limit: 3 },
  { q: "etagere", category: "Salon", kind: "shelf", limit: 2 },
  { q: "armoire", category: "Chambre", kind: "wardrobe", limit: 3 },
  { q: "commode", category: "Chambre", kind: "chestOfDrawers", limit: 3 },
  { q: "lit", category: "Chambre", kind: "bed", limit: 3 },
  { q: "table de chevet", category: "Chambre", kind: "nightstand", limit: 2 },
  { q: "bureau", category: "Bureau", kind: "desk", limit: 2 },
  { q: "table de jardin", category: "Jardin", kind: "diningTable", outdoor: true, limit: 2 },
  { q: "parasol", category: "Jardin", kind: "parasol", outdoor: true, limit: 2 },
  { q: "jardiniere", category: "Jardin", kind: "planter", outdoor: true, limit: 2 },

  // Compléments : mobilier et équipements encore peu couverts
  { q: "table repas", category: "Salon", kind: "diningTable", limit: 3 },
  { q: "chaise de table", category: "Salon", kind: "diningChair", limit: 3 },
  { q: "canape 3 places", category: "Salon", kind: "sofa", limit: 3 },
  { q: "canape angle", category: "Salon", kind: "sofaCorner", limit: 2 },
  { q: "table basse salon", category: "Salon", kind: "coffeeTable", limit: 3 },
  { q: "meuble television", category: "Salon", kind: "tvUnit", limit: 3 },
  { q: "etagere salon", category: "Salon", kind: "shelf", limit: 3 },
  { q: "commode chambre", category: "Chambre", kind: "chestOfDrawers", limit: 3 },
  { q: "lit double", category: "Chambre", kind: "bed", limit: 3 },
  { q: "chevet chambre", category: "Chambre", kind: "nightstand", limit: 3 },
  { q: "dressing armoire", category: "Chambre", kind: "wardrobe", limit: 3 },
  { q: "bureau maison", category: "Bureau", kind: "desk", limit: 3 },
  { q: "chaise bureau", category: "Bureau", kind: "officeChair", limit: 2 },
  { q: "four encastrable", category: "Cuisine", kind: "kitchenOvenBank", limit: 2 },
  { q: "refrigerateur", category: "Cuisine", kind: "fridge", limit: 2 },
  { q: "lave vaisselle", category: "Cuisine", kind: "dishwasher", limit: 2 },
  { q: "hotte cuisine", category: "Cuisine", kind: "hood", limit: 2 },
  { q: "micro ondes", category: "Cuisine", kind: "microwave", limit: 2 },
  { q: "meuble haut cuisine", category: "Cuisine", kind: "kitchenUpper", limit: 2 },
  { q: "lit bebe", category: "Enfant", kind: "crib", limit: 2 },
  { q: "bureau enfant", category: "Enfant", kind: "desk", limit: 2 },
  { q: "salon de jardin", category: "Jardin", kind: "sofa", outdoor: true, limit: 2 },
  { q: "barbecue", category: "Jardin", kind: "bbq", outdoor: true, limit: 2 },
  { q: "eclairage jardin", category: "Jardin", kind: "gardenLight", outdoor: true, limit: 2 },
]

const REJECT = /lot de|recharge|accessoire|pièce détachée|housse|protège|nettoyant|produit d'entretien/i

const VARIANT = {
  id: "lm",
  name: "Fini Leroy Merlin",
  primary: "#d8d1c3",
  secondary: "#c5bcab",
  wood: "#b58a5c",
  metal: "#2b2c29",
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (n) => Math.round(n * 1000) / 1000

function findApiKey() {
  if (process.env.APISH_KEY) return process.env.APISH_KEY.trim()
  for (const file of [path.join(REPO, ".env"), path.join(ROOT, ".env")]) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?APISH_KEY\s*=\s*(.+?)\s*$/)
      if (match) return match[1].replace(/^["']|["']$/g, "")
    }
  }
  return null
}

/** Longueur depuis une caractéristique : "80 cm", "1,2 m", "1200 mm". */
function parseLength(value) {
  const match = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .match(/([\d]+[.,]?\d*)\s*(millim[eè]tres?|mm|centim[eè]tres?|cm|m[eè]tres?|m)?/i)
  if (!match) return null
  let number = Number(match[1].replace(",", "."))
  if (!Number.isFinite(number) || number <= 0) return null
  const unit = (match[2] || "cm").toLowerCase()
  if (unit.startsWith("milli") || unit === "mm") number /= 1000
  else if (unit.startsWith("m") && !unit.startsWith("milli") && unit !== "cm") {
    // mètre (déjà en m)
  } else number /= 100
  return number <= 8 ? round(number) : null
}

/** Cotes depuis le tableau « Caractéristiques » de la fiche API.SH, avec
 *  repli sur le nom du produit ("160x32x30cm") quand le tableau est vide. */
function dimensionsFrom(product, fallbackName = "") {
  let longueur = null
  let largeur = null
  let profondeur = null
  let hauteur = null
  for (const row of product.characteristics ?? []) {
    const name = String(row?.name ?? "").toLowerCase()
    // On ignore l'emballage, les dimensions intérieures et les valeurs min/max.
    if (/emball|int[ée]rieur|assise|totale|minimum|maximum/.test(name)) continue
    const value = row?.value
    const combined = String(value ?? "").match(/(\d+[.,]?\d*)\s*[x×]\s*(\d+[.,]?\d*)\s*[x×]\s*(\d+[.,]?\d*)/i)
    if (combined && /^dimensions?/.test(name)) {
      const values = combined.slice(1).map((v) => Number(v.replace(",", ".")) / 100)
      if (values.every((v) => v >= 0.02 && v <= 4)) {
        return { w: round(values[0]), d: round(values[1]), h: round(values[2]) }
      }
    }
    const length = parseLength(value)
    if (length === null) continue
    if (/^longueur/.test(name)) longueur ??= length
    else if (/^largeur/.test(name)) largeur ??= length
    else if (/^profondeur/.test(name)) profondeur ??= length
    else if (/^hauteur/.test(name)) hauteur ??= length
  }

  // Une longueur (> largeur) est la dimension principale : elle devient `w`.
  const w = longueur ?? largeur ?? profondeur
  const d = longueur !== null ? (largeur ?? profondeur) : (profondeur ?? largeur)
  if ([w, d, hauteur].every((v) => v !== null && v >= 0.02 && v <= 4)) {
    return { w: round(w), d: round(d), h: round(hauteur) }
  }

  const nameMatch = String(fallbackName).match(
    /(\d{2,3}(?:[.,]\d+)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d+)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d+)?)/i,
  )
  if (nameMatch) {
    const values = nameMatch.slice(1).map((v) => Number(v.replace(",", ".")) / 100)
    if (values.every((v) => v >= 0.02 && v <= 4)) {
      return { w: round(values[0]), d: round(values[1]), h: round(values[2]) }
    }
  }
  return null
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex")}.json`)
}

async function cached(key, fetcher) {
  const file = cachePath(key)
  if (!force && existsSync(file)) {
    try {
      return { value: JSON.parse(await readFile(file, "utf8")), fromCache: true }
    } catch {
      /* cache corrompu : on refetch */
    }
  }
  const value = await fetcher()
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(file, JSON.stringify(value), "utf8")
  return { value, fromCache: false }
}

async function apiGet(endpoint, params, key) {
  const url = new URL(`/leroymerlin/v1/${endpoint}`, BASE)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
  const response = await fetch(url, {
    headers: { "x-api-key": key, accept: "application/json" },
  })
  const text = await response.text()
  if (!response.ok) {
    if (response.status === 401) throw new Error("Clé API.SH invalide ou absente (401)")
    if (response.status === 429) throw new Error("Quota API.SH épuisé (429)")
    throw new Error(`API.SH ${response.status} sur ${endpoint} : ${text.slice(0, 160)}`)
  }
  return { data: JSON.parse(text), credits: JSON.parse(text).credits_used ?? 0 }
}

async function main() {
  const key = findApiKey()
  if (!key) {
    console.error("APISH_KEY manquant.")
    console.error(`Ajoute une ligne APISH_KEY=ta_cle dans ${path.join(REPO, ".env")}`)
    console.error("(compte gratuit sur api.sh : 1000 crédits/mois), ou définis la variable d'environnement.")
    process.exit(1)
  }

  let credits = 0
  const seen = new Set()
  const entries = []
  let skipped = 0

  outer: for (const plan of PLAN) {
    let result
    try {
      const cacheKey = `search:${plan.q}`
      result = await cached(cacheKey, async () => {
        const { data, credits: used } = await apiGet(
          "search",
          { q: plan.q, country: "fr", sold_by_leroy_merlin: "true" },
          key,
        )
        return { data, credits: used }
      })
      credits += result.fromCache ? 0 : (result.value.credits ?? 0)
    } catch (error) {
      console.warn(`[ Recherche ] ${plan.q} : ${error.message}`)
      continue
    }

    const items = result.value.data?.items ?? []
    let kept = 0
    for (const product of items.slice(0, 24)) {
      if (kept >= plan.limit) break
      if (!product?.id || !product?.url || seen.has(product.id)) continue
      if (REJECT.test(`${product.name ?? ""}`)) continue
      // Le filtre API `sold_by_leroy_merlin` laisse passer des placements
      // marketplace : on les écarte pour rester sur du catalogue Leroy Merlin.
      if (product.seller?.type === "marketplace" || product.sellers === "3P_only") continue

      let detail
      try {
        const cacheKey = `product:${product.id}`
        detail = await cached(cacheKey, async () => {
          const { data, credits: used } = await apiGet("product", { id: product.id, country: "fr" }, key)
          return { data, credits: used }
        })
        credits += detail.fromCache ? 0 : (detail.value.credits ?? 0)
      } catch (error) {
        console.warn(`  ${product.id} : ${error.message}`)
        continue
      }

      const size = dimensionsFrom(detail.value.data ?? {}, product.name ?? "")
      if (!size) {
        skipped += 1
        continue
      }

      seen.add(product.id)
      kept += 1
      const price = detail.value.data?.price ?? product.price ?? null
      entries.push({
        id: `lm-${product.id}`,
        name: `${product.name ?? detail.value.data?.name ?? "Meuble"}`.replace(/\s+/g, " ").trim().slice(0, 90),
        category: plan.category,
        kind: plan.kind,
        ...size,
        ...(plan.outdoor ? { outdoor: true } : {}),
        variants: [VARIANT],
        defaultVariant: VARIANT.id,
        keywords: `leroy merlin ${product.name ?? ""} ${product.brand ?? ""} ${plan.category}`.slice(0, 200),
        brand: "Leroy Merlin",
        reference: String(product.id),
        productUrl: detail.value.data?.url ?? product.url,
        ...(typeof price === "number" && price > 0 ? { price } : {}),
        ...(product.image ? { image: product.image } : {}),
      })
      console.log(`  ${product.id}  ${size.w}×${size.d}×${size.h} m  ${price ?? "—"} €`)
      await sleep(120)

      if (entries.length >= MAX) break outer
    }
    console.log(`[ ${plan.q} ] ${kept} meuble${kept > 1 ? "s" : ""}`)
    await sleep(150)
  }

  const header = [
    "// Généré par apps/planner/scripts/import-leroy-merlin.mjs — ne pas éditer à la main.",
    "// Données Leroy Merlin via API.SH, non affiliées à Leroy Merlin. Vérifier les cotes avant usage.",
    'import type { CatalogItem } from "@/types"',
    "",
    "export const LM_CATALOG: CatalogItem[] = [",
  ].join("\n")
  if (!dryRun) {
    const body = entries.map((entry) => `  ${JSON.stringify(entry)},`).join("\n")
    await mkdir(path.dirname(OUT), { recursive: true })
    await writeFile(OUT, `${header}\n${body}\n]\n`, "utf8")
  }

  console.log(`\n${entries.length} entrées ${dryRun ? "trouvées (dry-run, rien écrit)" : `écrites dans ${path.relative(REPO, OUT)}`}`)
  console.log(`${credits} crédits API.SH consommés (1000 gratuits/mois)`)
  if (skipped) console.log(`${skipped} résultats ignorés (cotes indisponibles)`)
}

await main()
