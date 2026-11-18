/**
 * Import d'un catalogue IKEA (market FR) dans le planificateur.
 *
 * Source : endpoints publics utilisés par le site IKEA (non officiels) :
 *  - recherche / catégories : sik.search.blue.cdtapps.com
 *  - modèles 3D : URLs publiées dans le HTML des fiches produits
 *    (web-api.ikea.com/dimma/assets/.../glb/...)
 *
 * Les cotes sont relevées dans le GLB (coordonnées métriques, Y-up) quand il
 * est disponible ; le texte de mesure IKEA sert de repli.
 *
 * Usage :
 *   node scripts/import-ikea.mjs
 *   node scripts/import-ikea.mjs --max=48 --dry-run
 *   node scripts/import-ikea.mjs --force
 *
 * Génère src/catalog/catalog-ikea.ts et télécharge les GLB dans
 * public/models/ikea/. Les fichiers déjà présents ne sont pas retéléchargés
 * sauf avec --force.
 */

import { readFileSync } from "node:fs"
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const MODELS_DIR = path.join(ROOT, "public", "models", "ikea")
const CATALOG_FILE = path.join(ROOT, "src", "catalog", "catalog-ikea.ts")
const SEARCH_URL = "https://sik.search.blue.cdtapps.com/fr/fr/search-result-page"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const force = args.has("--force")
const maxArg = [...args].find((a) => a.startsWith("--max="))
const MAX = maxArg ? Number(maxArg.split("=")[1]) : 150
if (!Number.isFinite(MAX) || MAX <= 0) throw new Error("--max doit être un entier positif")

/** Requêtes ciblées : on reste sur du mobilier, pas sur tout le catalogue IKEA. */
const PLAN = [
  { q: "canapé 3 places", category: "Salon", kind: "sofa", limit: 3 },
  { q: "canapé d'angle", category: "Salon", kind: "sofaCorner", limit: 2 },
  { q: "fauteuil", category: "Salon", kind: "armchair", limit: 3 },
  { q: "table basse", category: "Salon", kind: "coffeeTable", limit: 3 },
  { q: "bibliothèque", category: "Salon", kind: "shelf", limit: 3 },
  { q: "KALLAX étagère", category: "Salon", kind: "shelf", limit: 3 },
  { q: "table à manger", category: "Salon", kind: "diningTable", limit: 3 },
  { q: "chaise", category: "Salon", kind: "diningChair", limit: 3 },
  { q: "lit", category: "Chambre", kind: "bed", limit: 3 },
  { q: "armoire", category: "Chambre", kind: "wardrobe", limit: 3 },
  { q: "commode", category: "Chambre", kind: "chestOfDrawers", limit: 3 },
  { q: "table de chevet", category: "Chambre", kind: "nightstand", limit: 3 },
  { q: "bureau", category: "Bureau", kind: "desk", limit: 3 },

  // Salon & rangement
  { q: "canapé 2 places", category: "Salon", kind: "sofa", limit: 2 },
  { q: "pouf", category: "Salon", kind: "pouf", limit: 2 },
  { q: "meuble TV", category: "Salon", kind: "tvUnit", limit: 3 },
  { q: "console", category: "Salon", kind: "consoleTable", limit: 2 },
  { q: "étagère", category: "Salon", kind: "shelf", limit: 3 },

  // Cuisine
  { q: "meuble bas cuisine", category: "Cuisine", kind: "kitchenBase", limit: 3 },
  { q: "îlot de cuisine", category: "Cuisine", kind: "kitchenIsland", limit: 2 },
  { q: "plan de travail cuisine", category: "Cuisine", kind: "counter", limit: 2 },
  { q: "table de cuisine", category: "Cuisine", kind: "diningTable", limit: 2 },

  // Salle d'eau
  { q: "meuble de salle de bain", category: "Salle d'eau", kind: "vanity", limit: 3 },

  // Bureau & enfant
  { q: "chaise de bureau", category: "Bureau", kind: "officeChair", limit: 2 },
  { q: "caisson à tiroirs", category: "Bureau", kind: "filingCabinet", limit: 2 },
  { q: "lit enfant", category: "Enfant", kind: "bed", limit: 2 },
  { q: "bureau enfant", category: "Enfant", kind: "desk", limit: 2 },

  // Déco
  { q: "lampadaire", category: "Déco", kind: "floorLamp", limit: 2 },
  { q: "lampe de table", category: "Déco", kind: "tableLamp", limit: 2 },
  { q: "plante artificielle", category: "Déco", kind: "plant", limit: 2 },

  // Jardin
  { q: "table de jardin", category: "Jardin", kind: "diningTable", outdoor: true, limit: 2 },
  { q: "chaise de jardin", category: "Jardin", kind: "diningChair", outdoor: true, limit: 2 },
  { q: "salon de jardin", category: "Jardin", kind: "sofa", outdoor: true, limit: 2 },

  // Cuisine : électroménager et équipements
  { q: "réfrigérateur", category: "Cuisine", kind: "fridge", limit: 2 },
  { q: "lave-vaisselle", category: "Cuisine", kind: "dishwasher", limit: 2 },
  { q: "four encastrable", category: "Cuisine", kind: "kitchenOvenBank", limit: 2 },
  { q: "micro-ondes", category: "Cuisine", kind: "microwave", limit: 2 },
  { q: "hotte cuisine", category: "Cuisine", kind: "hood", limit: 2 },
  { q: "plaque à induction", category: "Cuisine", kind: "inductionHob", limit: 2 },
  { q: "cave à vin", category: "Cuisine", kind: "wineFridge", limit: 2 },
  { q: "caisson haut cuisine", category: "Cuisine", kind: "kitchenUpper", limit: 2 },
  { q: "évier cuisine", category: "Cuisine", kind: "blackSink", limit: 2 },
  { q: "mitigeur cuisine", category: "Cuisine", kind: "blackTap", limit: 2 },
  { q: "tabouret cuisine", category: "Cuisine", kind: "wireStool", limit: 2 },
  { q: "poubelle cuisine", category: "Cuisine", kind: "kitchenBin", limit: 2 },
  { q: "machine à café", category: "Cuisine", kind: "coffeeMachine", limit: 2 },
  { q: "planche à découper", category: "Cuisine", kind: "cuttingBoard", limit: 2 },

  // Salle d'eau
  { q: "WC", category: "Salle d'eau", kind: "toilet", limit: 2 },
  { q: "cabine de douche", category: "Salle d'eau", kind: "shower", limit: 2 },
  { q: "baignoire", category: "Salle d'eau", kind: "bathtub", limit: 2 },
  { q: "radiateur", category: "Salle d'eau", kind: "radiator", limit: 2 },
  { q: "miroir salle de bain", category: "Salle d'eau", kind: "mirror", limit: 2 },

  // Déco & salon
  { q: "tapis", category: "Déco", kind: "rug", limit: 3 },
  { q: "tapis rond", category: "Déco", kind: "roundRug", limit: 2 },
  { q: "rideau", category: "Déco", kind: "curtain", limit: 2 },
  { q: "vase", category: "Déco", kind: "vase", limit: 2 },
  { q: "cadre photo", category: "Déco", kind: "art", limit: 2 },
  { q: "bougie", category: "Déco", kind: "candle", limit: 2 },
  { q: "coussin", category: "Déco", kind: "cushion", limit: 2 },
  { q: "suspension", category: "Déco", kind: "pendant", limit: 3 },
  { q: "lampe de bureau", category: "Bureau", kind: "deskLamp", limit: 2 },
  { q: "étagère flottante", category: "Déco", kind: "floatingShelf", limit: 2 },
  { q: "table ronde", category: "Salon", kind: "roundTable", limit: 2 },
  { q: "table d'appoint", category: "Salon", kind: "sideTable", limit: 2 },

  // Enfant
  { q: "lit bébé", category: "Enfant", kind: "crib", limit: 2 },
  { q: "table à langer", category: "Enfant", kind: "changingTable", limit: 2 },

  // Jardin (équipements)
  { q: "parasol", category: "Jardin", kind: "parasol", outdoor: true, limit: 2 },
  { q: "barbecue", category: "Jardin", kind: "bbq", outdoor: true, limit: 2 },
  { q: "jardinière", category: "Jardin", kind: "planter", outdoor: true, limit: 2 },
  { q: "lampe de jardin", category: "Jardin", kind: "gardenLight", outdoor: true, limit: 2 },
]

/** Accessoires et pièces détachées : on ne veut que des meubles / objets posés.
 *  Tapis, rideaux, vases, cadres, coussins et bougies sont désormais conservés. */
const REJECT =
  /housse|plaid|patin|rouleau|colle|vis|cheville|poignée|accessoire|lot de|kit de|serviette|ustensile|ampoule|batterie/i

/** Petits objets : hauteur/profondeur souvent < 15 cm, mais cotes GLB valides. */
const MIN_SIZE = 0.005

/** Règles de placement des objets décoratifs et des équipements encastrés. */
const OVERLAYS = {
  art: { elevation: 1.15, allowOverlap: true },
  mirror: { elevation: 1.4, allowOverlap: true },
  vase: { elevation: 0.75, allowOverlap: true },
  candle: { elevation: 0.75, allowOverlap: true },
  cushion: { elevation: 0.45, allowOverlap: true },
  rug: { allowOverlap: true },
  roundRug: { allowOverlap: true },
  pendant: { elevation: 2.2, allowOverlap: true },
  floatingShelf: { elevation: 1.45, allowOverlap: true },
  deskLamp: { elevation: 0.75, allowOverlap: true },
  tableLamp: { elevation: 0.75, allowOverlap: true },
  bookStack: { elevation: 0.75, allowOverlap: true },
  botanicalArt: { elevation: 1.15, allowOverlap: true },
  trailingPlant: { elevation: 1.4, allowOverlap: true },
  blackSink: { elevation: 0.9, allowOverlap: true },
  blackTap: { elevation: 0.9, allowOverlap: true },
  cuttingBoard: { elevation: 0.9, allowOverlap: true },
  coffeeMachine: { elevation: 0.9, allowOverlap: true },
}

const VARIANT = {
  id: "ikea",
  name: "Fini IKEA",
  primary: "#d8d1c3",
  secondary: "#c5bcab",
  wood: "#b58a5c",
  metal: "#2b2c29",
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (n) => Math.round(n * 1000) / 1000

/** "80x28x202 cm" -> { w, d, h }. Les measures partielles sont ignorées : leur
 *  ordre varie selon le type de meuble (longueur × hauteur pour une étagère,
 *  longueur × largeur pour une table). Le GLB reste la source principale. */
function parseMeasure(text) {
  const match = String(text ?? "").match(/([\d]+[.,]?\d*)\s*x\s*([\d]+[.,]?\d*)\s*x\s*([\d]+[.,]?\d*)/i)
  if (!match) return null
  const values = match.slice(1).map((v) => Number(v.replace(",", ".")) / 100)
  if (!values.every((v) => Number.isFinite(v) && v >= 0.15 && v <= 4)) return null
  const [w, d, h] = values
  return { w: round(w), d: round(d), h: round(h) }
}

/** Lit les bornes de position du GLB (mètres, Y-up) pour obtenir ses cotes réelles. */
function glbSize(file) {
  const buffer = readFileSync(file)
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"))
  const mins = []
  const maxs = []
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION]
      if (!accessor?.min || !accessor?.max) return null
      mins.push(accessor.min)
      maxs.push(accessor.max)
    }
  }
  if (!mins.length) return null
  const min = [0, 1, 2].map((i) => Math.min(...mins.map((m) => m[i])))
  const max = [0, 1, 2].map((i) => Math.max(...maxs.map((m) => m[i])))
  const size = { w: round(max[0] - min[0]), h: round(max[1] - min[1]), d: round(max[2] - min[2]) }
  if (![size.w, size.d, size.h].every((v) => v >= MIN_SIZE && v <= 4)) return null
  return size
}

function reference(itemNo) {
  return String(itemNo).replace(/^(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3")
}

async function searchProducts(query) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&size=24`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Recherche IKEA ${response.status} pour « ${query} »`)
  const json = await response.json()
  return json.searchResultPage?.products?.main?.items ?? []
}

/** Préfère un GLB non compressé (Draco) : aucun décodeur externe nécessaire. */
function pickGlb(html) {
  const urls = [
    ...new Set(
      [...html.matchAll(/https:\/\/web-api\.ikea\.com\/dimma\/assets\/[^'" ]+?\.glb(?:\?[^'" ]*)?/g)].map(
        (m) => m[0],
      ),
    ),
  ]
  const score = (url) => {
    if (url.includes("glb_draco")) return -1
    if (/\/rqp[23]\/glb\//.test(url)) return 5
    if (/\/iqp1\/glb\//.test(url)) return 4
    if (/\/glb\//.test(url)) return 3
    return 0
  }
  urls.sort((a, b) => score(b) - score(a))
  return score(urls[0] ?? "") > 0 ? urls[0] : null
}

async function modelUrl(pipUrl) {
  const response = await fetch(pipUrl)
  if (!response.ok) return null
  return pickGlb(await response.text())
}

async function fileExists(file) {
  try {
    return (await stat(file)).size > 0
  } catch {
    return false
  }
}

async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Téléchargement GLB ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(destination, buffer)
  return buffer.length
}

async function main() {
  if (!dryRun) await mkdir(MODELS_DIR, { recursive: true })

  const seen = new Set()
  const entries = []
  let glbFound = 0
  let skipped = 0

  outer: for (const plan of PLAN) {
    let items
    try {
      items = await searchProducts(plan.q)
    } catch (error) {
      console.warn(`[ Recherche ] ${error.message}`)
      continue
    }

    let kept = 0
    for (const wrap of items) {
      if (kept >= plan.limit) break
      const product = wrap?.product
      if (!product) continue
      if (product.onlineSellable === false) continue
      if (!product.pipUrl || seen.has(product.itemNo)) continue
      if (REJECT.test(`${product.name ?? ""} ${product.typeName ?? ""}`)) continue

      const measure = product.itemMeasureReferenceText ?? ""
      const duplicateKey = `${product.name}|${measure}`
      if (seen.has(duplicateKey)) continue

      const modelFile = path.join(MODELS_DIR, `${product.itemNo}.glb`)
      let size = null
      let modelAvailable = false

      if (!dryRun) {
        if (!(await fileExists(modelFile)) || force) {
          try {
            const url = await modelUrl(product.pipUrl)
            if (url) {
              const bytes = await download(url, modelFile)
              glbFound += 1
              modelAvailable = true
              console.log(`  GLB  ${product.itemNo}  ${(bytes / 1024).toFixed(0)} Ko`)
            } else {
              console.warn(`  GLB  ${product.itemNo} : aucun modèle (repli paramétrique)`)
            }
            await sleep(150)
          } catch (error) {
            console.warn(`  GLB  ${product.itemNo} : ${error.message}`)
          }
        } else {
          modelAvailable = true
        }
        if (modelAvailable) size = glbSize(modelFile)
      }
      size ??= parseMeasure(measure)
      if (!size) {
        skipped += 1
        continue
      }

      seen.add(product.itemNo)
      seen.add(duplicateKey)
      kept += 1

      entries.push({
        id: `ikea-${product.itemNo}`,
        name: `${product.name} ${product.typeName ?? ""}`.replace(/\s+/g, " ").trim(),
        category: plan.category,
        kind: plan.kind,
        ...size,
        ...(plan.outdoor ? { outdoor: true } : {}),
        ...(OVERLAYS[plan.kind] ?? {}),
        variants: [VARIANT],
        defaultVariant: VARIANT.id,
        model: modelAvailable ? { url: `/models/ikea/${product.itemNo}.glb`, rotation: 0 } : undefined,
        keywords: `ikea ${product.name} ${product.typeName ?? ""} ${plan.category}`,
        brand: "IKEA",
        reference: reference(product.itemNo),
        productUrl: product.pipUrl,
        price: product.salesPrice?.numeral,
        image: product.mainImageUrl,
      })

      if (entries.length >= MAX) break outer
    }
    console.log(`[ ${plan.q} ] ${kept} meuble${kept > 1 ? "s" : ""}`)
    await sleep(200)
  }

  const header = [
    "// Généré par apps/planner/scripts/import-ikea.mjs — ne pas éditer à la main.",
    "// Données publiques IKEA FR, non affiliées à IKEA. Vérifier les cotes avant usage.",
    'import type { CatalogItem } from "@/types"',
    "",
    "export const IKEA_CATALOG: CatalogItem[] = [",
  ].join("\n")
  const body = entries.map((entry) => `  ${JSON.stringify(entry)},`).join("\n")
  await writeFile(CATALOG_FILE, `${header}\n${body}\n]\n`, "utf8")

  if (!dryRun) {
    const used = new Set(entries.map((entry) => path.basename(entry.model?.url ?? "")))
    for (const file of await readdir(MODELS_DIR)) {
      if (file.endsWith(".glb") && !used.has(file)) {
        await unlink(path.join(MODELS_DIR, file))
        console.log(`  nettoyage : ${file}`)
      }
    }
  }

  console.log(`\n${entries.length} entrées écrites dans ${path.relative(ROOT, CATALOG_FILE)}`)
  console.log(`${glbFound} modèles 3D téléchargés dans ${path.relative(ROOT, MODELS_DIR)}`)
  if (skipped) console.log(`${skipped} résultats ignorés (cotes indisponibles)`)
}

await main()
