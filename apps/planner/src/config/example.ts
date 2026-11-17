import type { FurnitureSize, LevelId } from "@/types"

export interface ExamplePlacement {
  catalogId: string
  level?: LevelId
  x: number
  z: number
  rotation: number
  variant?: string
  elevation?: number
  size?: FurnitureSize
}

/**
 * Aménagement de démonstration, calé sur les cotes réelles du RdC.
 * Toutes les positions sont dans le repère du plan (x est, y nord).
 */
export const EXAMPLE_RDC: ExamplePlacement[] = [
  { catalogId: "canape-angle", x: 2.0, z: 12.35, rotation: 0, variant: "laine-argile" },
  { catalogId: "tapis", x: 2.0, z: 10.65, rotation: 0, variant: "lin-sable" },
  { catalogId: "table-basse", x: 2.0, z: 10.35, rotation: 0, variant: "noyer" },
  { catalogId: "meuble-tv", x: 2.0, z: 9.45, rotation: 180, variant: "noyer" },
  { catalogId: "tv", x: 2.0, z: 9.43, rotation: 180 },
  { catalogId: "lampadaire", x: 0.72, z: 10.1, rotation: 0, variant: "noir-mat" },
  { catalogId: "plante", x: 6.2, z: 12.9, rotation: 0, variant: "olivier" },
  { catalogId: "vase-sculptural", x: 3.6, z: 12.9, rotation: 0, variant: "gres-sable" },
  { catalogId: "tableau", x: 1.1, z: 13.27, rotation: 180, variant: "sauge-profonde" },

  // Cuisine linéaire ouest + colonne four sur le mur sud + îlot parallèle.
  // Repère : mur ouest fini à x = 0,38 ; mur sud fini à z = 4,85 ; fenêtre z 5,55–6,95.
  { catalogId: "cuisine-sol-pierre", x: 1.635, z: 5.185, rotation: 0, variant: "calacatta", elevation: 0.001, size: { w: 2.47, d: 0.63, h: 0.004 } },
  { catalogId: "cuisine-sol-pierre", x: 2.100, z: 7.110, rotation: 0, variant: "calacatta", elevation: 0.001, size: { w: 3.4, d: 3.22, h: 0.004 } },
  { catalogId: "cuisine-colonne-four", x: 1.9425, z: 5.200, rotation: 0, variant: "calacatta", size: { w: 1.815, d: 0.65, h: 2.36 } },
  { catalogId: "cuisine-meuble-bas", x: 0.710, z: 5.155, rotation: 90, variant: "calacatta", size: { w: 0.57, d: 0.62, h: 0.88 } },
  { catalogId: "cuisine-meuble-bas", x: 0.710, z: 6.040, rotation: 90, variant: "calacatta", size: { w: 1.2, d: 0.62, h: 0.88 } },
  { catalogId: "cuisine-meuble-bas", x: 0.710, z: 7.090, rotation: 90, variant: "calacatta", size: { w: 0.9, d: 0.62, h: 0.88 } },
  { catalogId: "cuisine-meuble-bas", x: 0.710, z: 7.755, rotation: 90, variant: "calacatta", size: { w: 0.43, d: 0.62, h: 0.88 } },
  { catalogId: "cuisine-cave-vin", x: 0.710, z: 8.270, rotation: 90, variant: "calacatta", size: { w: 0.6, d: 0.62, h: 0.88 } },
  { catalogId: "cuisine-plan-marbre", x: 0.720, z: 6.745, rotation: 90, variant: "calacatta", elevation: 0.88, size: { w: 3.75, d: 0.64, h: 0.045 } },
  { catalogId: "cuisine-evier", x: 0.720, z: 6.170, rotation: 90, variant: "calacatta", elevation: 0.925, size: { w: 0.8, d: 0.46, h: 0.02 } },
  { catalogId: "cuisine-robinet", x: 0.520, z: 6.170, rotation: 90, variant: "calacatta", elevation: 0.925, size: { w: 0.07, d: 0.22, h: 0.35 } },
  { catalogId: "cuisine-plaque", x: 0.720, z: 7.270, rotation: 90, variant: "calacatta", elevation: 0.925, size: { w: 0.6, d: 0.52, h: 0.012 } },
  { catalogId: "cuisine-hotte-inclinee", x: 0.580, z: 7.320, rotation: 90, variant: "calacatta", elevation: 1.68, size: { w: 0.7, d: 0.36, h: 0.58 } },
  { catalogId: "cuisine-credence-marbre", x: 0.720, z: 4.880, rotation: 0, variant: "calacatta", elevation: 0.925, size: { w: 0.64, d: 0.02, h: 0.53 } },
  { catalogId: "cuisine-credence-marbre", x: 0.410, z: 6.250, rotation: 90, variant: "calacatta", elevation: 0.925, size: { w: 1.4, d: 0.02, h: 0.18 } },
  { catalogId: "cuisine-meuble-haut-angle", x: 0.720, z: 5.050, rotation: 0, variant: "calacatta", elevation: 1.45, size: { w: 0.64, d: 0.35, h: 0.91 } },
  { catalogId: "cuisine-machine-cafe", x: 0.620, z: 5.170, rotation: 0, variant: "calacatta", elevation: 0.925, size: { w: 0.16, d: 0.28, h: 0.32 } },
  { catalogId: "cuisine-planche", x: 0.570, z: 7.640, rotation: 90, variant: "calacatta", elevation: 0.925, size: { w: 0.3, d: 0.03, h: 0.44 } },
  { catalogId: "cuisine-planche", x: 0.540, z: 7.800, rotation: 90, variant: "calacatta", elevation: 0.925, size: { w: 0.24, d: 0.03, h: 0.38 } },

  { catalogId: "cuisine-ilot-marbre", x: 2.775, z: 7.07, rotation: 270, variant: "calacatta", size: { w: 2.3, d: 1.15, h: 0.94 } },
  { catalogId: "cuisine-tabouret", x: 3.45, z: 6.55, rotation: 270, variant: "calacatta", size: { w: 0.46, d: 0.46, h: 0.95 } },
  { catalogId: "cuisine-tabouret", x: 3.45, z: 7.15, rotation: 270, variant: "calacatta", size: { w: 0.46, d: 0.46, h: 0.95 } },
  { catalogId: "cuisine-tabouret", x: 3.45, z: 7.75, rotation: 270, variant: "calacatta", size: { w: 0.46, d: 0.46, h: 0.95 } },
  { catalogId: "cuisine-suspension-globe", x: 2.82, z: 6.55, rotation: 0, variant: "calacatta", elevation: 1.55, size: { w: 0.34, d: 0.34, h: 0.34 } },
  { catalogId: "cuisine-suspension-globe", x: 2.82, z: 7.15, rotation: 0, variant: "calacatta", elevation: 1.55, size: { w: 0.34, d: 0.34, h: 0.34 } },
  { catalogId: "cuisine-suspension-globe", x: 2.82, z: 7.75, rotation: 0, variant: "calacatta", elevation: 1.55, size: { w: 0.34, d: 0.34, h: 0.34 } },

  { catalogId: "cuisine-etagere-chene", x: 0.520, z: 8.300, rotation: 90, variant: "calacatta", elevation: 1.45, size: { w: 0.52, d: 0.24, h: 0.045 } },
  { catalogId: "cuisine-livres", x: 0.520, z: 8.300, rotation: 90, variant: "calacatta", elevation: 1.495, size: { w: 0.3, d: 0.22, h: 0.13 } },
  { catalogId: "cuisine-etagere-chene", x: 0.520, z: 8.300, rotation: 90, variant: "calacatta", elevation: 1.82, size: { w: 0.52, d: 0.24, h: 0.045 } },
  { catalogId: "cuisine-plante-retombante", x: 0.550, z: 8.260, rotation: 0, variant: "panache", elevation: 1.865, size: { w: 0.3, d: 0.3, h: 0.42 } },
  { catalogId: "cuisine-cadre-botanique", x: 0.425, z: 9.160, rotation: 90, variant: "calacatta", elevation: 1.42, size: { w: 0.62, d: 0.035, h: 0.82 } },

  { catalogId: "table-manger", x: 5.25, z: 11.6, rotation: 90, variant: "chene-clair" },
  { catalogId: "chaise", x: 4.48, z: 10.9, rotation: 90, variant: "chene-clair" },
  { catalogId: "chaise", x: 4.48, z: 12.25, rotation: 90, variant: "chene-clair" },
  { catalogId: "chaise", x: 6.02, z: 10.9, rotation: 270, variant: "chene-clair" },
  { catalogId: "chaise", x: 6.02, z: 12.25, rotation: 270, variant: "chene-clair" },
  { catalogId: "suspension", x: 5.25, z: 11.6, rotation: 0, variant: "noir-mat" },

  { catalogId: "lit-double", x: 1.9, z: 2.26, rotation: 0, variant: "lin-blanc" },
  { catalogId: "table-nuit", x: 0.85, z: 2.95, rotation: 0, variant: "chene-clair" },
  { catalogId: "table-nuit", x: 2.95, z: 2.95, rotation: 0, variant: "chene-clair" },
  { catalogId: "armoire", x: 0.72, z: 1.35, rotation: 90, variant: "frene-blanc" },
  { catalogId: "bureau", x: 2.7, z: 0.8, rotation: 0, variant: "chene-clair" },

  { catalogId: "douche", x: 1.5, z: 4.28, rotation: 0, variant: "gres-sable" },
  { catalogId: "vasque", x: 0.66, z: 3.95, rotation: 90, variant: "chene-clair" },
  { catalogId: "wc", x: 2.48, z: 4.3, rotation: 0, variant: "blanc-mat" },

  { catalogId: "etagere", x: 5.2, z: 6.75, rotation: 0, variant: "chene-clair" },
  { catalogId: "plante", x: 6.2, z: 8.86, rotation: 0, variant: "sauge" },

  // Garage — 996 garée au centre, nez vers la porte sud (rotation 180).
  { catalogId: "porsche-996", x: 5.3, z: 2.88, rotation: 180, variant: "noir" },

  // Enrobée — les deux places 2,50 × 5,00 m du plan de masse, orientées est-ouest.
  { catalogId: "vw-amarok", x: -1.15, z: -2.88, rotation: 90, variant: "noir" },
  { catalogId: "peugeot-3008", x: -1.15, z: -5.36, rotation: 90, variant: "noir" },

  // Carport centré au-dessus des deux véhicules : longueur ramenée à 6,00 m
  // (18,08 m dans le catalogue) et hauteur à 2,80 m (3,44 m au catalogue).
  // Pivoté de 90° : le bord bas du toit (local +Z) passe à l'ouest, au niveau
  // de l'arrière des voitures ; la pente suit ainsi leur longueur.
  {
    catalogId: "carport",
    x: -1.15,
    z: -4.12,
    rotation: 90,
    variant: "chene-clair",
    size: { w: 6.00, d: 6.04, h: 2.80 },
  },
]
