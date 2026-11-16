import type { Point2 } from "@/types"

export interface SceneApi {
  screenToFloor: (clientX: number, clientY: number) => Point2 | null
  capture: () => string | null
  resetCamera: () => void
  /** Cadre la caméra 3D (coordonnées Three.js : y vers le haut, z négatif vers le nord). */
  setCamera: (position: [number, number, number], target: [number, number, number]) => void
}

export const sceneApi: { current: Partial<SceneApi> } = { current: {} }
