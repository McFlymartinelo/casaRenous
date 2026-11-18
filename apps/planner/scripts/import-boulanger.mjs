/**
 * Import du catalogue Boulanger (FR) dans le planificateur via API.SH.
 * 1 crédit par recherche et par fiche produit.
 *
 * Usage : node scripts/import-boulanger.mjs [--max=60] [--force] [--dry-run]
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { apiGet, cached, dimensionsFromRows, findApiKey, writeCatalog } from "./lib/apish.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REPO = path.resolve(ROOT, "..", "..")
const CATALOG_FILE = path.join(ROOT, "src", "catalog", "catalog-boulanger.ts")
const CACHE_DIR = path.join(ROOT, ".cache", "boulanger")

const args = new Set(process.argv.slice(2))
const force = args.has("--force")
const dryRun = args.has("--dry-run")
const option = (name, fallback) => {
  const found = [...args].find((a) => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}
const MAX = Number(option("max", "60"))
const OUT = option("out", CATALOG_FILE)
if (!Number.isFinite(MAX) || MAX <= 0) throw new Error("--max doit être un entier positif")

/** Boulanger = électroménager et high-tech : peu de mobilier, beaucoup d'équipements. */
const PLAN = [
  { q: "refrigerateur", category: "Cuisine", kind: "fridge", limit: 3 },
  { q: "congelateur", category: "Cuisine", kind: "fridge", limit: 2 },
  { q: "lave vaisselle", category: "Cuisine", kind: "dishwasher", limit: 3 },
  { q: "four encastrable", category: "Cuisine", kind: "kitchenOvenBank", limit: 3 },
  { q: "micro ondes", category: "Cuisine", kind: "microwave", limit: 3 },
  { q: "hotte cuisine", category: "Cuisine", kind: "hood", limit: 3 },
  { q: "plaque induction", category: "Cuisine", kind: "inductionHob", limit: 3 },
  { q: "machine a cafe", category: "Cuisine", kind: "coffeeMachine", limit: 2 },
  { q: "television", category: "Salon", kind: "tv", limit: 2 },
  { q: "meuble tv", category: "Salon", kind: "tvUnit", limit: 2 },
  { q: "bibliotheque", category: "Salon", kind: "shelf", limit: 2 },
  { q: "fauteuil", category: "Salon", kind: "armchair", limit: 2 },

  // Requêtes prêtes pour le prochain renouvellement de crédits (non lancées).
  { q: "table a manger", category: "Salon", kind: "diningTable", limit: 2 },
  { q: "chaise", category: "Salon", kind: "diningChair", limit: 2 },
  { q: "canape", category: "Salon", kind: "sofa", limit: 2 },
  { q: "lit", category: "Chambre", kind: "bed", limit: 2 },
  { q: "armoire", category: "Chambre", kind: "wardrobe", limit: 2 },
  { q: "commode", category: "Chambre", kind: "chestOfDrawers", limit: 2 },
  { q: "table de chevet", category: "Chambre", kind: "nightstand", limit: 2 },
  { q: "etagere", category: "Salon", kind: "shelf", limit: 2 },
  { q: "lampadaire", category: "Déco", kind: "floorLamp", limit: 2 },
  { q: "tapis", category: "Déco", kind: "rug", limit: 2 },
  { q: "salon de jardin", category: "Jardin", kind: "sofa", outdoor: true, limit: 2 },
  { q: "parasol", category: "Jardin", kind: "parasol", outdoor: true, limit: 2 },
  { q: "barbecue", category: "Jardin", kind: "bbq", outdoor: true, limit: 2 },
]

const REJECT = /lot de|recharge|accessoire|housse|protection|nettoyant|consommable/i

const VARIANT = {
  id: "boulanger",
  name: "Fini Boulanger",
  primary: "#d8d1c3",
  secondary: "#c5bcab",
  wood: "#b58a5c",
  metal: "#2b2c29",
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const key = findApiKey([REPO, ROOT])
  if (!key) {
    console.error("APISH_KEY manquant. Ajoute-le dans le .env à la racine.")
    process.exit(1)
  }

  const seen = new Set()
  const entries = []
  let credits = 0
  let skipped = 0

  outer: for (const plan of PLAN) {
    let result
    try {
      result = await cached(`search:${plan.q}`, async () => {
        const { data, credits: used } = await apiGet("boulanger", "search", { q: plan.q }, key)
        return { data, credits: used }
      }, CACHE_DIR, force)
      credits += result.fromCache ? 0 : (result.value.credits ?? 0)
    } catch (error) {
      console.warn(`[ Recherche ] ${plan.q} : ${error.message}`)
      continue
    }

    let kept = 0
    for (const product of (result.value.data?.products ?? []).slice(0, 20)) {
      if (kept >= plan.limit) break
      if (!product?.id || seen.has(product.id)) continue
      if (product.marketplace === true) continue
      if (REJECT.test(`${product.title ?? ""}`)) continue

      let detail
      try {
        detail = await cached(`product:${product.id}`, async () => {
          const { data, credits: used } = await apiGet("boulanger", "product", { id: product.id }, key)
          return { data, credits: used }
        }, CACHE_DIR, force)
        credits += detail.fromCache ? 0 : (detail.value.credits ?? 0)
      } catch (error) {
        console.warn(`  ${product.id} : ${error.message}`)
        continue
      }

      const data = detail.value.data ?? {}
      const size = dimensionsFromRows(data.specifications ?? [])
      if (!size) {
        skipped += 1
        continue
      }

      seen.add(product.id)
      kept += 1
      entries.push({
        id: `boulanger-${product.id}`,
        name: String(data.title ?? product.title ?? "Appareil").replace(/\s+/g, " ").trim().slice(0, 90),
        category: plan.category,
        kind: plan.kind,
        ...size,
        variants: [VARIANT],
        defaultVariant: VARIANT.id,
        keywords: `boulanger ${product.title ?? ""} ${product.brand ?? ""} ${plan.category}`.slice(0, 200),
        brand: "Boulanger",
        reference: String(product.id),
        productUrl: data.url ?? product.url,
        ...(typeof data.price === "number" && data.price > 0 ? { price: data.price } : {}),
        ...(product.image ? { image: product.image } : {}),
      })
      console.log(`  ${product.id}  ${size.w}×${size.d}×${size.h} m  ${data.price ?? "—"} €`)
      await sleep(120)
      if (entries.length >= MAX) break outer
    }
    console.log(`[ ${plan.q} ] ${kept} article${kept > 1 ? "s" : ""}`)
    await sleep(150)
  }

  if (!dryRun) {
    await mkdir(path.dirname(OUT), { recursive: true })
    await writeCatalog(
      OUT,
      entries,
      "// Généré par apps/planner/scripts/import-boulanger.mjs — ne pas éditer à la main.\n// Données API.SH non affiliées à Boulanger.",
      "BOULANGER_CATALOG",
    )
  }
  console.log(`\n${entries.length} entrées ${dryRun ? "trouvées (dry-run)" : `écrites dans ${path.relative(ROOT, OUT)}`}`)
  console.log(`${credits} crédits API.SH consommés`)
  if (skipped) console.log(`${skipped} résultats ignorés (cotes indisponibles)`)
}

await main()
