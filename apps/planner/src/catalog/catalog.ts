import type {
  CatalogItem,
  FurnitureCategory,
  FurnitureItem,
  FurnitureSize,
  FurnitureVariant,
} from "@/types"

function variant(
  id: string,
  name: string,
  primary: string,
  secondary: string,
  wood = "#8a6a49",
  metal = "#2b2c29",
  stone = "#d9d4ca",
): FurnitureVariant {
  return { id, name, primary, secondary, wood, metal, stone }
}

const FABRICS: FurnitureVariant[] = [
  variant("lin-sable", "Lin sable", "#c9bda9", "#b8aa95"),
  variant("laine-argile", "Laine argile", "#b5836b", "#a5735c"),
  variant("velours-sauge", "Velours sauge", "#71816c", "#61715d"),
  variant("boucle-ivoire", "Bouclé ivoire", "#e1d8c8", "#d2c8b5"),
]

const BEDDING: FurnitureVariant[] = [
  variant("lin-blanc", "Lin blanc", "#e9e2d6", "#d8cfc0"),
  variant("argile-douce", "Argile douce", "#cbb39d", "#b9a08a"),
  variant("sauge-profonde", "Sauge profonde", "#758570", "#65745f"),
  variant("nuit-bleue", "Nuit bleue", "#5d6c7a", "#4f5d6a"),
]

const WOODS: FurnitureVariant[] = [
  variant("chene-clair", "Chêne clair", "#b58a5c", "#a1784d", "#a97d50"),
  variant("noyer", "Noyer", "#6e4c35", "#5e3f2b", "#67462f"),
  variant("frene-blanc", "Frêne blanchi", "#d1b995", "#bf9f77", "#c9af88"),
  variant("laque-noire", "Laqué noir", "#2c2d2a", "#232421", "#2b2c28", "#2b2c29"),
]

const PAINTS: FurnitureVariant[] = [
  variant("blanc-craie", "Blanc craie", "#e8e2d6", "#d8d0c0", "#c7b592", "#3a3b38", "#ded9cf"),
  variant("vert-sauge", "Vert sauge", "#74836f", "#647260", "#b58a5c", "#3a3b38", "#ded9cf"),
  variant("bleu-ardoise", "Bleu ardoise", "#65747d", "#57666f", "#b58a5c", "#3a3b38", "#ded9cf"),
  variant("terre-cuite", "Terre cuite", "#b66f50", "#a35f42", "#b58a5c", "#3a3b38", "#ded9cf"),
]

const CUISINE: FurnitureVariant[] = [
  variant("calacatta", "Calacatta & laque ivoire", "#e9e4da", "#d8d0c2", "#c8a071", "#252622", "#eae5da"),
  variant("laque-blanche", "Laque blanc & chêne", "#f0ece4", "#dfd8cc", "#c49a67", "#2e2f2c", "#e6e1d7"),
  variant("sable-noyer", "Laque sable & noyer", "#ded5c5", "#cec4b2", "#7b5638", "#20211f", "#e4dfd5"),
]

const CERAMICS: FurnitureVariant[] = [
  variant("blanc-mat", "Blanc mat", "#f2efe8", "#e4e0d7"),
  variant("gres-sable", "Grès sable", "#d8cbb8", "#c9bba6"),
  variant("noir-mat", "Noir mat", "#323330", "#292a27"),
  variant("vert-pale", "Vert pâle", "#aeb9aa", "#9dab98"),
]

const METALS: FurnitureVariant[] = [
  variant("acier", "Acier brossé", "#b8b9b4", "#a2a39f", "#9b7047", "#aeb0ab"),
  variant("noir-mat", "Noir mat", "#2e2f2c", "#252623", "#9b7047", "#252623"),
  variant("laiton", "Laiton", "#b08d52", "#9a7944", "#9b7047", "#ab8950"),
  variant("blanc", "Blanc laqué", "#e7e3da", "#d7d2c8", "#9b7047", "#c9c9c5"),
]

const GREENS: FurnitureVariant[] = [
  variant("olivier", "Olivier", "#6f8560", "#5e7351", "#8b6844", "#b08d52"),
  variant("sauge", "Sauge", "#7d9278", "#6b8066", "#8b6844", "#b08d52"),
  variant("fougere", "Fougère", "#4f6b4d", "#405a3f", "#8b6844", "#b08d52"),
  variant("panache", "Panaché", "#95a77d", "#84976c", "#8b6844", "#b08d52"),
]

interface Entry {
  id: string
  name: string
  category: FurnitureCategory
  kind: string
  w: number
  d: number
  h: number
  variants?: FurnitureVariant[]
  elevation?: number
  allowOverlap?: boolean
  keywords?: string
  model?: CatalogItem["model"]
}

const entries: Entry[] = [
  // Salon
  { id: "canape-angle", name: "Canapé d'angle", category: "Salon", kind: "sofaCorner", w: 2.6, d: 2.0, h: 0.86, variants: FABRICS, keywords: "sofa canapé angle tissu" },
  { id: "canape-3p", name: "Canapé 3 places", category: "Salon", kind: "sofa", w: 2.2, d: 0.94, h: 0.82, variants: FABRICS, keywords: "sofa canapé tissu" },
  { id: "fauteuil", name: "Fauteuil lounge", category: "Salon", kind: "armchair", w: 0.86, d: 0.9, h: 0.82, variants: FABRICS, keywords: "fauteuil assise" },
  { id: "pouf", name: "Pouf rond", category: "Salon", kind: "pouf", w: 0.56, d: 0.56, h: 0.42, variants: FABRICS, keywords: "pouf repose pied" },
  { id: "table-basse", name: "Table basse", category: "Salon", kind: "coffeeTable", w: 1.2, d: 0.65, h: 0.4, variants: WOODS, keywords: "table basse salon" },
  { id: "table-basse-ronde", name: "Table basse ronde", category: "Salon", kind: "roundTable", w: 0.9, d: 0.9, h: 0.38, variants: WOODS, keywords: "table ronde" },
  { id: "meuble-tv", name: "Meuble TV", category: "Salon", kind: "tvUnit", w: 1.8, d: 0.42, h: 0.52, variants: WOODS, keywords: "tv télé meuble" },
  { id: "tv", name: "Téléviseur 55\"", category: "Salon", kind: "tv", w: 1.23, d: 0.09, h: 0.72, variants: METALS, elevation: 0.52, allowOverlap: true, keywords: "tv écran télévision" },
  { id: "tapis", name: "Tapis laine", category: "Salon", kind: "rug", w: 2.4, d: 1.7, h: 0.014, variants: FABRICS, allowOverlap: true, keywords: "tapis moquette" },
  { id: "plante", name: "Plante d'intérieur", category: "Déco", kind: "plant", w: 0.46, d: 0.46, h: 1.5, variants: GREENS, keywords: "plante vert pot" },
  { id: "lampadaire", name: "Lampadaire", category: "Salon", kind: "floorLamp", w: 0.4, d: 0.4, h: 1.66, variants: METALS, keywords: "lampe lumière sol" },
  { id: "bibliotheque", name: "Bibliothèque", category: "Salon", kind: "shelf", w: 1.6, d: 0.34, h: 1.9, variants: WOODS, keywords: "livre étagère rangement" },
  { id: "coussin", name: "Coussin", category: "Déco", kind: "cushion", w: 0.46, d: 0.16, h: 0.44, variants: FABRICS, elevation: 0.42, allowOverlap: true, keywords: "coussin déco textile" },

  // Cuisine
  { id: "ilot", name: "Îlot central", category: "Cuisine", kind: "kitchenIsland", w: 1.8, d: 0.9, h: 0.92, variants: PAINTS, keywords: "ilot cuisine plan" },
  { id: "plan-travail", name: "Plan de travail", category: "Cuisine", kind: "counter", w: 2.4, d: 0.65, h: 0.9, variants: PAINTS, keywords: "cuisine meuble bas plan" },
  { id: "frigo", name: "Réfrigérateur", category: "Cuisine", kind: "fridge", w: 0.7, d: 0.68, h: 1.9, variants: METALS, keywords: "frigo réfrigérateur cuisine" },
  { id: "hotte", name: "Hotte murale", category: "Cuisine", kind: "hood", w: 0.9, d: 0.52, h: 0.62, variants: METALS, elevation: 1.55, allowOverlap: true, keywords: "hotte aspiration cuisine" },
  { id: "table-manger", name: "Table à manger", category: "Cuisine", kind: "diningTable", w: 1.8, d: 0.9, h: 0.75, variants: WOODS, keywords: "table manger repas" },
  { id: "chaise", name: "Chaise", category: "Cuisine", kind: "diningChair", w: 0.48, d: 0.52, h: 0.84, variants: WOODS, keywords: "chaise assise repas" },
  { id: "suspension", name: "Suspension", category: "Cuisine", kind: "pendant", w: 0.46, d: 0.46, h: 0.5, variants: METALS, elevation: 1.75, allowOverlap: true, keywords: "suspension lampe plafond" },

  // Cuisine — suite photo (colonnes, îlot, marbre, appareils)
  { id: "cuisine-colonne-four", name: "Colonne four double", category: "Cuisine", kind: "kitchenOvenBank", w: 1.93, d: 0.65, h: 2.36, variants: CUISINE, keywords: "cuisine colonne four double oven micro-ondes rangement laque" },
  { id: "cuisine-meuble-bas", name: "Meuble bas cuisine", category: "Cuisine", kind: "kitchenBase", w: 0.6, d: 0.62, h: 0.88, variants: CUISINE, keywords: "cuisine meuble bas tiroir porte laque sans poignée" },
  { id: "cuisine-cave-vin", name: "Cave à vin", category: "Cuisine", kind: "wineFridge", w: 0.6, d: 0.62, h: 0.88, variants: CUISINE, keywords: "cuisine cave vin bouteille verre noir" },
  { id: "cuisine-plan-marbre", name: "Plan de travail marbre", category: "Cuisine", kind: "marbleTop", w: 1.2, d: 0.64, h: 0.045, variants: CUISINE, elevation: 0.88, allowOverlap: true, keywords: "cuisine plan travail marbre calacatta calacatta or" },
  { id: "cuisine-evier", name: "Évier noir", category: "Cuisine", kind: "blackSink", w: 0.8, d: 0.46, h: 0.02, variants: CUISINE, elevation: 0.925, allowOverlap: true, keywords: "cuisine évier noir inox cuve" },
  { id: "cuisine-robinet", name: "Robinet noir", category: "Cuisine", kind: "blackTap", w: 0.07, d: 0.22, h: 0.35, variants: CUISINE, elevation: 0.925, allowOverlap: true, keywords: "cuisine robinet mitigeur noir" },
  { id: "cuisine-plaque", name: "Plaque induction", category: "Cuisine", kind: "inductionHob", w: 0.6, d: 0.52, h: 0.012, variants: CUISINE, elevation: 0.925, allowOverlap: true, keywords: "cuisine plaque induction cuisson noire" },
  { id: "cuisine-hotte-inclinee", name: "Hotte inclinée noire", category: "Cuisine", kind: "angledHood", w: 0.7, d: 0.36, h: 0.58, variants: CUISINE, elevation: 1.68, allowOverlap: true, keywords: "cuisine hotte inclinée noire aspiration" },
  { id: "cuisine-ilot-marbre", name: "Îlot marbre & chêne", category: "Cuisine", kind: "marbleIsland", w: 2.3, d: 1.15, h: 0.94, variants: CUISINE, keywords: "cuisine îlot marbre chêne panneau tabourets" },
  { id: "cuisine-tabouret", name: "Tabouret filaire blanc", category: "Cuisine", kind: "wireStool", w: 0.46, d: 0.46, h: 0.95, variants: CUISINE, allowOverlap: true, keywords: "cuisine tabouret filaire blanc îlot bar" },
  { id: "cuisine-suspension-globe", name: "Suspension globe fumé", category: "Cuisine", kind: "smokedGlobePendant", w: 0.34, d: 0.34, h: 0.34, variants: CUISINE, elevation: 1.55, allowOverlap: true, keywords: "cuisine suspension globe verre fumé noir laiton" },
  { id: "cuisine-etagere-chene", name: "Étagère chêne", category: "Cuisine", kind: "floatingShelf", w: 0.52, d: 0.24, h: 0.045, variants: CUISINE, elevation: 1.45, allowOverlap: true, keywords: "cuisine étagère chêne murale flottante" },
  { id: "cuisine-credence-marbre", name: "Crédence marbre", category: "Cuisine", kind: "marbleBacksplash", w: 0.6, d: 0.02, h: 0.53, variants: CUISINE, elevation: 0.925, allowOverlap: true, keywords: "cuisine crédence marbre calacatta mur" },
  { id: "cuisine-meuble-haut-angle", name: "Meuble haut d'angle", category: "Cuisine", kind: "kitchenUpper", w: 0.64, d: 0.35, h: 0.91, variants: CUISINE, elevation: 1.45, allowOverlap: true, keywords: "cuisine meuble haut angle laque" },
  { id: "cuisine-sol-pierre", name: "Sol pierre claire", category: "Cuisine", kind: "stoneFloor", w: 3.4, d: 3.2, h: 0.004, variants: CUISINE, elevation: 0.001, allowOverlap: true, keywords: "cuisine sol pierre calcaire dalle claire" },
  { id: "cuisine-planche", name: "Planche à découper", category: "Cuisine", kind: "cuttingBoard", w: 0.3, d: 0.03, h: 0.44, variants: CUISINE, elevation: 0.925, allowOverlap: true, keywords: "cuisine planche découper chêne bois" },
  { id: "cuisine-machine-cafe", name: "Machine à café", category: "Cuisine", kind: "coffeeMachine", w: 0.16, d: 0.28, h: 0.32, variants: CUISINE, elevation: 0.925, allowOverlap: true, keywords: "cuisine machine café noir capsules" },

  // Déco — détails de la cuisine
  { id: "cuisine-livres", name: "Livres déco", category: "Déco", kind: "bookStack", w: 0.3, d: 0.22, h: 0.13, variants: CUISINE, elevation: 1.495, allowOverlap: true, keywords: "livres déco étagère cuisine blanc" },
  { id: "cuisine-plante-retombante", name: "Pothos retombant", category: "Déco", kind: "trailingPlant", w: 0.3, d: 0.3, h: 0.42, variants: GREENS, elevation: 1.865, allowOverlap: true, keywords: "plante retombante pothos étagère cuisine" },
  { id: "cuisine-cadre-botanique", name: "Cadre botanique", category: "Déco", kind: "botanicalArt", w: 0.62, d: 0.035, h: 0.82, variants: CUISINE, elevation: 1.42, allowOverlap: true, keywords: "cadre botanique art mural cuisine" },

  // Chambre
  { id: "lit-double", name: "Lit 160 × 200", category: "Chambre", kind: "bed", w: 1.6, d: 2.0, h: 1.05, variants: BEDDING, keywords: "lit chambre couchage" },
  { id: "lit-simple", name: "Lit 90 × 200", category: "Chambre", kind: "bed", w: 0.9, d: 2.0, h: 1.0, variants: BEDDING, keywords: "lit simple chambre" },
  { id: "table-nuit", name: "Table de nuit", category: "Chambre", kind: "nightstand", w: 0.46, d: 0.4, h: 0.5, variants: WOODS, keywords: "chevet table nuit" },
  { id: "armoire", name: "Armoire 2 portes", category: "Chambre", kind: "wardrobe", w: 1.8, d: 0.6, h: 2.2, variants: WOODS, keywords: "armoire penderie rangement" },
  { id: "bureau", name: "Bureau", category: "Chambre", kind: "desk", w: 1.4, d: 0.7, h: 0.75, variants: WOODS, keywords: "bureau travail" },
  { id: "chaise-bureau", name: "Chaise de bureau", category: "Chambre", kind: "officeChair", w: 0.62, d: 0.62, h: 1.02, variants: FABRICS, keywords: "chaise bureau travail" },

  // Salle d'eau
  { id: "douche", name: "Douche 90 × 90", category: "Salle d'eau", kind: "shower", w: 0.9, d: 0.9, h: 2.1, variants: CERAMICS, keywords: "douche verre salle eau" },
  { id: "vasque", name: "Meuble vasque", category: "Salle d'eau", kind: "vanity", w: 0.9, d: 0.5, h: 0.86, variants: WOODS, keywords: "vasque lavabo salle eau" },
  { id: "wc", name: "WC suspendu", category: "Salle d'eau", kind: "toilet", w: 0.4, d: 0.55, h: 0.82, variants: CERAMICS, keywords: "wc toilette salle eau" },
  { id: "baignoire", name: "Baignoire îlot", category: "Salle d'eau", kind: "bathtub", w: 1.7, d: 0.8, h: 0.6, variants: CERAMICS, keywords: "baignoire bain salle eau" },
  { id: "seche-serviette", name: "Sèche-serviettes", category: "Salle d'eau", kind: "radiator", w: 0.5, d: 0.12, h: 1.2, variants: METALS, elevation: 0.35, allowOverlap: true, keywords: "serviette radiateur salle eau" },
  { id: "miroir", name: "Miroir", category: "Salle d'eau", kind: "mirror", w: 0.6, d: 0.05, h: 0.8, variants: WOODS, elevation: 1.05, allowOverlap: true, keywords: "miroir salle eau" },

  // Déco
  { id: "tableau", name: "Tableau", category: "Déco", kind: "art", w: 0.8, d: 0.05, h: 1.0, variants: FABRICS, elevation: 1.15, allowOverlap: true, keywords: "tableau cadre art mur" },
  { id: "rideau", name: "Rideau", category: "Déco", kind: "curtain", w: 1.6, d: 0.08, h: 2.4, variants: FABRICS, elevation: 0.04, allowOverlap: true, keywords: "rideau fenêtre textile" },
  { id: "vase", name: "Vase", category: "Déco", kind: "vase", w: 0.26, d: 0.26, h: 0.46, variants: CERAMICS, elevation: 0.75, allowOverlap: true, keywords: "vase fleur déco" },
  { id: "vase-sculptural", name: "Vase sculptural", category: "Déco", kind: "vase", w: 0.3, d: 0.3, h: 0.9, variants: CERAMICS, keywords: "vase sculpture grès déco glb", model: { url: "/models/vase-sculptural.glb" } },
  { id: "lampe-table", name: "Lampe de table", category: "Déco", kind: "tableLamp", w: 0.3, d: 0.3, h: 0.5, variants: METALS, elevation: 0.75, allowOverlap: true, keywords: "lampe table lumière" },
  { id: "etagere", name: "Étagère murale", category: "Déco", kind: "shelf", w: 0.8, d: 0.3, h: 1.8, variants: WOODS, keywords: "étagère rangement" },
]

export const CATALOG: CatalogItem[] = entries.map((entry) => ({
  ...entry,
  variants: entry.variants ?? FABRICS,
  defaultVariant: (entry.variants ?? FABRICS)[0]?.id,
}))

export const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]))

export const CATEGORIES: FurnitureCategory[] = [
  "Salon",
  "Cuisine",
  "Chambre",
  "Salle d'eau",
  "Déco",
]

export function getCatalogItem(id: string): CatalogItem {
  const item = CATALOG_BY_ID.get(id)
  if (!item) throw new Error(`Meuble inconnu : ${id}`)
  return item
}

export function getVariant(item: CatalogItem, variantId: string): FurnitureVariant {
  return item.variants.find((variant) => variant.id === variantId) ?? item.variants[0]!
}

/** Cotes effectives d'un meuble : personnalisées si présentes, sinon catalogue. */
export function getItemSize(item: FurnitureItem): FurnitureSize {
  const catalog = getCatalogItem(item.catalogId)
  const positive = (value: number | undefined, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
  return {
    w: positive(item.size?.w, catalog.w),
    d: positive(item.size?.d, catalog.d),
    h: positive(item.size?.h, catalog.h),
  }
}
