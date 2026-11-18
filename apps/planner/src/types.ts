export type LevelId = "rdc" | "etage"
export type Point2 = [number, number]
export type Rect2 = [number, number, number, number]

/** Palier de qualité ajusté automatiquement selon les performances mesurées. */
export type QualityTier = "high" | "medium" | "low"

export type TextureKind =
  | "wood"
  | "tile"
  | "plaster"
  | "concrete"
  | "fabric"
  | "stone"
  | "marble"
  | "grass"
  | "bark"
  | "metal"

export interface MaterialTextures {
  map?: string
  normalMap?: string
  roughnessMap?: string
  bumpMap?: string
}

export interface MaterialConfig {
  name?: string
  color: string
  roughness: number
  metalness: number
  texture?: TextureKind
  /** Taille physique d'un motif, en mètres (ex. 1,2 pour une planche de 1,2 m). */
  textureScale?: number
  textures?: MaterialTextures
  bump?: number
  opacity?: number
  transparent?: boolean
  clearcoat?: number
  clearcoatRoughness?: number
  sheen?: number
  emissive?: string
  emissiveIntensity?: number
  side?: "front" | "back" | "double"
}

export type OpeningType = "window" | "door" | "garage" | "bay" | "passage"

export interface OpeningConfig {
  /** Coordonnée absolue le long du mur (x pour un mur est-ouest, y pour un mur nord-sud). */
  from: number
  to: number
  sill: number
  top: number
  type: OpeningType
  divisions?: number
  hinge?: "start" | "end"
  swing?: 1 | -1
}

export interface WallConfig {
  id: string
  level: LevelId
  from: Point2
  to: Point2
  thickness: number
  height?: number
  material: string
  exterior?: boolean
  baseboard?: "auto" | "both" | "none"
  openings?: OpeningConfig[]
}

export interface RoomConfig {
  id: string
  name: string
  level: LevelId
  rect: Rect2
  floor: string
  labelAt?: Point2
  program?: string
  /** Surface officielle (tableau des surfaces), sinon déduite du rect. */
  areaM2?: number
  /** Masque l'étiquette (ex. zones fusionnées en une seule « Pièce de vie »). */
  hideLabel?: boolean
  provisional?: boolean
}

export interface LevelConfig {
  id: LevelId
  name: string
  shortName: string
  elevation: number
  ceilingHeight: number
  /** Épaisseur du plancher porteur sous ce niveau. */
  slabThickness: number
  floorMaterial: string
  /** Découpage du sol (permet la trémie d'escalier). */
  floorRects?: Rect2[]
  provisional?: boolean
}

export interface StairConfig {
  level: LevelId
  rect: Rect2
  steps: number
  material: string
  treadMaterial: string
  riserMaterial: string
  railing?: boolean
}

export interface RoofConfig {
  pitch: number
  overhangSide: number
  overhangGable: number
  thickness: number
  material: string
  ridgeMaterial: string
  gutterMaterial: string
}

/** Allée : ruban continu d'une largeur donnée, suivant une ligne de points. */
export interface DrivewayConfig {
  material: string
  /** Largeur du revêtement, en mètres. */
  width: number
  /** Axe du ruban, du garage vers la voie (repère plan). */
  points: Point2[]
}

export interface SiteConfig {
  grass: string
  terrace: { rect: Rect2; material: string }
  driveway: DrivewayConfig
  /** Limite de parcelle : polygone cadastral du plan de masse. */
  plot?: { points: Point2[]; material: string }
  /** Emprise réellement enrobée : stationnement, aire devant la maison et accès. */
  asphaltArea?: {
    points: Point2[]
    material: string
    /** Trous laissés en herbe (fosses d'arbres), polygones intérieurs au contour. */
    holes?: Point2[][]
  }
  path?: { rect: Rect2; material: string }
  trees?: { at: Point2; height: number; radius: number }[]
}

export interface AmbienceConfig {
  hour: number
  latitude: number
  dayOfYear: number
  exposure: number
  /** HDRI optionnel, ex. "textures/studio.hdr". Sinon un environnement est généré. */
  environmentHdri?: string
  softShadows: boolean
  textures: boolean
  /** Brins d'herbe 3D et feuillage détaillé (plus coûteux en GPU). */
  vegetation: boolean
  ambientOcclusion: boolean
  details: boolean
  cutaway: boolean
  roof: boolean
  grid: boolean
}

export interface CameraConfig {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  planZoom: number
}

export type FurnitureCategory =
  | "Salon"
  | "Cuisine"
  | "Chambre"
  | "Salle d'eau"
  | "Déco"
  | "Garage"
  | "Bureau"
  | "Enfant"
  | "Jardin"

export interface FurnitureVariant {
  id: string
  name: string
  /** Couleur principale (tissu, laque, céramique). */
  primary: string
  /** Couleur secondaire (assise, plateau, accents). */
  secondary: string
  wood: string
  metal: string
  stone?: string
}

export interface CatalogModel {
  /** Chemin public du GLB, ex. "/models/mon-canape.glb". */
  url: string
  /** Ajuste le modèle sur l'emprise du catalogue (true par défaut). */
  fit?: boolean
  rotation?: number
}

export interface CatalogItem {
  id: string
  name: string
  category: FurnitureCategory
  kind: string
  /** Largeur, profondeur, hauteur en mètres. */
  w: number
  d: number
  h: number
  variants: FurnitureVariant[]
  defaultVariant?: string
  /** Élévation au-dessus du sol (tableau, miroir, hotte…). */
  elevation?: number
  allowOverlap?: boolean
  /** Objet destiné au site extérieur (enrobée) : autorisé hors du plancher. */
  outdoor?: boolean
  model?: CatalogModel
  keywords?: string
  /** Enseigne d'origine, ex. "IKEA" (catalogues importés). */
  brand?: string
  /** Référence commerciale affichée dans l'inspecteur, ex. "205.220.46". */
  reference?: string
  /** Fiche produit d'origine, ex. une URL ikea.com. */
  productUrl?: string
  /** Prix public relevé lors de l'import (indicatif). */
  price?: number
  /** URL de la photo du catalogue. */
  image?: string
}

export interface FurnitureSize {
  /** Largeur, profondeur et hauteur en mètres. */
  w: number
  d: number
  h: number
}

export interface FurnitureItem {
  id: string
  catalogId: string
  level: LevelId
  x: number
  z: number
  /** Rotation en degrés, dans le plan. */
  rotation: number
  variantId: string
  elevation?: number
  /** Cotes personnalisées ; absentes = cotes du catalogue. */
  size?: FurnitureSize
  /** Verrouille l'emplacement : plus de déplacement, rotation ni redimensionnement. */
  locked?: boolean
}

export type Tool = "move" | "rotate" | "measure" | "grid" | "doors"
export type ViewMode = "3d" | "plan" | "walk"

export interface HouseConfig {
  meta: {
    name: string
    version: string
    updatedAt: string
    unit: "m"
    origin: string
    axes: string
  }
  envelope: {
    width: number
    depth: number
    wallThickness: number
    ceilingHeight: number
    floorThickness: number
    roofPitch: number
    ridgeAxis: "x" | "z"
  }
  materials: Record<string, MaterialConfig>
  levels: LevelConfig[]
  rooms: RoomConfig[]
  walls: WallConfig[]
  stairs: StairConfig
  roof: RoofConfig
  site: SiteConfig
  ambience: AmbienceConfig
  camera: CameraConfig
}
