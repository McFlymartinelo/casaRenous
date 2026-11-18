/**
 * Repère du modèle `casarenous.glb` (export Blender, Y vers le haut) :
 *
 *   X : largeur de la maison, 0 → 7,00 m
 *   Y : hauteur, sol du RDC = 0, sol de l'étage = 2,82, faîtage ≈ 8,1
 *   Z : profondeur, 0 = façade rue (garage), -13,80 = façade jardin (terrasse)
 *
 * Les points de visite sont donnés en mètres dans ce repère, avec la hauteur
 * du sol du niveau concerné et la direction du regard. Ils ont été calés sur
 * les zones dégagées du modèle (pas de mur ni de meuble à moins d'un mètre).
 */

export type ViewerMode = "orbit" | "walk"

export interface ViewerSpot {
  id: string
  label: string
  /** Position des pieds : [x, altitude du sol, z] */
  position: [number, number, number]
  /** Point regardé (à hauteur d'œil) : [x, y, z] */
  lookAt: [number, number, number]
}

export const RDC_FLOOR = 0
export const ETAGE_FLOOR = 2.82
export const EYE_HEIGHT = 1.65

export const VIEWER_SPOTS: ViewerSpot[] = [
  {
    id: "entree",
    label: "Entrée & escalier",
    position: [3, RDC_FLOOR, -9.4],
    lookAt: [5.9, RDC_FLOOR + 1.5, -8.2],
  },
  {
    id: "cuisine",
    label: "Cuisine",
    position: [3, RDC_FLOOR, -6.4],
    lookAt: [0.9, RDC_FLOOR + 1.2, -6.4],
  },
  {
    id: "salon",
    label: "Salon",
    position: [3.6, RDC_FLOOR, -10.4],
    lookAt: [3, RDC_FLOOR + 1.35, -13.8],
  },
  {
    id: "etage-jardin",
    label: "Étage — côté jardin",
    position: [2.4, ETAGE_FLOOR, -11.2],
    lookAt: [2.7, ETAGE_FLOOR + 1.2, -13.4],
  },
  {
    id: "etage-rue",
    label: "Étage — côté rue",
    position: [2.1, ETAGE_FLOOR, -2.4],
    lookAt: [2.1, ETAGE_FLOOR + 1.2, -5.2],
  },
  {
    id: "terrasse",
    label: "Terrasse",
    position: [3.5, RDC_FLOOR, -16.5],
    lookAt: [3.5, RDC_FLOOR + 1.4, -12],
  },
  {
    id: "facade",
    label: "Façade",
    position: [3.5, RDC_FLOOR, 12],
    lookAt: [3.5, RDC_FLOOR + 2.8, 0],
  },
]

export const DEFAULT_SPOT_ID = "salon"

export function findSpot(id: string): ViewerSpot {
  return VIEWER_SPOTS.find((spot) => spot.id === id) ?? VIEWER_SPOTS[0]!
}
