/**
 * Import ciblé d'Amazon.fr dans le planificateur via API.SH.
 * 1 crédit par recherche, 3 crédits par fiche produit.
 *
 * Quota demandé : 15 électroménager, 20 jardin, 35 déco = 70 articles.
 *
 * Usage : node scripts/import-amazon.mjs [--max=70] [--force] [--dry-run]
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { apiGet, cached, dimensionsFromRows, findApiKey, writeCatalog } from "./lib/apish.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const REPO = path.resolve(ROOT, "..", "..")
const CATALOG_FILE = path.join(ROOT, "src", "catalog", "catalog-amazon.ts")
const CACHE_DIR = path.join(ROOT, ".cache", "amazon")

const args = new Set(process.argv.slice(2))
const force = args.has("--force")
const dryRun = args.has("--dry-run")
const option = (name, fallback) => {
  const found = [...args].find((a) => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}
const MAX = Number(option("max", "70"))
const OUT = option("out", CATALOG_FILE)
if (!Number.isFinite(MAX) || MAX <= 0) throw new Error("--max doit être un entier positif")

/** 15 électro + 20 jardin + 35 déco. */
const PLAN = [
  // Électroménager (15)
  { q: "refrigerateur", category: "Cuisine", kind: "fridge", limit: 4 },
  { q: "micro ondes", category: "Cuisine", kind: "microwave", limit: 4 },
  { q: "machine a cafe", category: "Cuisine", kind: "coffeeMachine", limit: 4 },
  { q: "hotte cuisine", category: "Cuisine", kind: "hood", limit: 3 },

  // Jardin (20)
  { q: "chaise de jardin", category: "Jardin", kind: "diningChair", outdoor: true, limit: 5 },
  { q: "parasol jardin", category: "Jardin", kind: "parasol", outdoor: true, limit: 5 },
  { q: "barbecue jardin", category: "Jardin", kind: "bbq", outdoor: true, limit: 5 },
  { q: "jardiniere exterieur", category: "Jardin", kind: "planter", outdoor: true, limit: 5 },

  // Déco (35)
  { q: "table basse salon", category: "Déco", kind: "coffeeTable", limit: 6 },
  { q: "bibliotheque salon", category: "Déco", kind: "shelf", limit: 6 },
  { q: "lampadaire", category: "Déco", kind: "floorLamp", limit: 6 },
  { q: "tapis salon", category: "Déco", kind: "rug", limit: 6 },
  { q: "vase decoration", category: "Déco", kind: "vase", limit: 6 },
  { q: "cadre mural", category: "Déco", kind: "art", limit: 5 },

  // Complément pour atteindre le quota : +3 jardin, +9 déco
  { q: "table de jardin", category: "Jardin", kind: "diningTable", outdoor: true, limit: 3 },
  { q: "tapis", category: "Déco", kind: "rug", limit: 3 },
  { q: "miroir mural", category: "Déco", kind: "mirror", limit: 3 },
  { q: "plante artificielle", category: "Déco", kind: "plant", limit: 3 },

  // Requêtes prêtes pour le prochain renouvellement de crédits (non lancées).
  { q: "table d'appoint", category: "Déco", kind: "sideTable", limit: 4 },
  { q: "console entree", category: "Déco", kind: "consoleTable", limit: 4 },
  { q: "suspension luminaire", category: "Déco", kind: "pendant", limit: 4 },
  { q: "lampe de table", category: "Déco", kind: "tableLamp", limit: 4 },
  { q: "etagere murale", category: "Déco", kind: "floatingShelf", limit: 4 },
  { q: "rideau", category: "Déco", kind: "curtain", limit: 4 },
  { q: "bougie decoration", category: "Déco", kind: "candle", limit: 3 },
  { q: "salon de jardin", category: "Jardin", kind: "sofa", outdoor: true, limit: 4 },
  { q: "transat jardin", category: "Jardin", kind: "diningChair", outdoor: true, limit: 4 },
  { q: "eclairage jardin", category: "Jardin", kind: "gardenLight", outdoor: true, limit: 4 },
  { q: "cave a vin", category: "Cuisine", kind: "wineFridge", limit: 3 },
  { q: "lave vaisselle", category: "Cuisine", kind: "dishwasher", limit: 3 },
  { q: "four encastrable", category: "Cuisine", kind: "kitchenOvenBank", limit: 3 },
  { q: "plaque induction", category: "Cuisine", kind: "inductionHob", limit: 3 },
]

const REJECT = /renewed|occasion|reconditionn|lot de|housse|protection|accessoire/i

const VARIANT = {
  id: "amazon",
  name: "Fini Amazon",
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
  const totals = { Cuisine: 0, Jardin: 0, "Salle d'eau": 0, Déco: 0 }
  let credits = 0
  let skipped = 0

  outer: for (const plan of PLAN) {
    let result
    try {
      result = await cached(`search:${plan.q}`, async () => {
        const { data, credits: used } = await apiGet("amazon", "search", { q: plan.q, domain: "fr" }, key)
        return { data, credits: used }
      }, CACHE_DIR, force)
      credits += result.fromCache ? 0 : (result.value.credits ?? 0)
    } catch (error) {
      console.warn(`[ Recherche ] ${plan.q} : ${error.message}`)
      continue
    }

    let kept = 0
    // On limite le nombre de fiches interrogées par requête : chaque fiche
    // coûte 3 crédits, même quand elle n'a pas de cotes exploitables.
    for (const product of (result.value.data?.products ?? []).slice(0, plan.limit * 4)) {
      if (kept >= plan.limit) break
      if (!product?.asin || seen.has(product.asin)) continue
      if (product.sponsored === true) continue
      if (REJECT.test(`${product.title ?? ""}`)) continue

      let detail
      try {
        detail = await cached(`product:${product.asin}`, async () => {
          const { data, credits: used } = await apiGet(
            "amazon",
            "product",
            { url: product.asin, domain: "fr" },
            key,
          )
          return { data, credits: used }
        }, CACHE_DIR, force)
        credits += detail.fromCache ? 0 : (detail.value.credits ?? 0)
      } catch (error) {
        console.warn(`  ${product.asin} : ${error.message}`)
        continue
      }

      const data = detail.value.data ?? {}
      const rows = [
        ...Object.entries(data.details ?? {}).map(([name, value]) => ({ name, value })),
        ...Object.entries(data.overview ?? {}).map(([name, value]) => ({ name, value })),
      ]
      const size = dimensionsFromRows(rows)
      if (!size) {
        skipped += 1
        continue
      }

      seen.add(product.asin)
      kept += 1
      totals[plan.category] = (totals[plan.category] ?? 0) + 1
      const image = data.images?.[0]
      entries.push({
        id: `amazon-${product.asin}`,
        name: String(data.title ?? product.title ?? "Article").replace(/\s+/g, " ").trim().slice(0, 90),
        category: plan.category,
        kind: plan.kind,
        ...size,
        ...(plan.outdoor ? { outdoor: true } : {}),
        variants: [VARIANT],
        defaultVariant: VARIANT.id,
        keywords: `amazon ${product.title ?? ""} ${data.brand ?? ""} ${plan.category}`.slice(0, 200),
        brand: "Amazon",
        reference: String(product.asin),
        productUrl: data.url ?? product.url,
        ...(typeof data.price_value === "number" && data.price_value > 0 ? { price: data.price_value } : {}),
        ...(typeof image === "string" ? { image } : image?.large ? { image: image.large } : {}),
      })
      console.log(`  ${product.asin}  ${size.w}×${size.d}×${size.h} m  ${data.price_value ?? "—"} €`)
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
      "// Généré par apps/planner/scripts/import-amazon.mjs — ne pas éditer à la main.\n// Données API.SH non affiliées à Amazon.",
      "AMAZON_CATALOG",
    )
  }
  console.log(`\n${entries.length} entrées ${dryRun ? "trouvées (dry-run)" : `écrites dans ${path.relative(ROOT, OUT)}`}`)
  console.log(`Répartition : ${JSON.stringify(totals)}`)
  console.log(`${credits} crédits API.SH consommés`)
  if (skipped) console.log(`${skipped} résultats ignorés (cotes indisponibles)`)
}

await main()
