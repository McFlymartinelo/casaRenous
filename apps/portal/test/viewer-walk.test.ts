import { describe, expect, it } from "vitest"
import {
  anglesTowards,
  clampPitch,
  horizontalMove,
  MAX_PITCH,
  EYE_HEIGHT,
} from "../src/features/viewer/walk"
import { VIEWER_SPOTS, findSpot, DEFAULT_SPOT_ID } from "../src/features/viewer/spots"

/** Reconstruit la direction de visée de la caméra (ordre YXZ, -Z à l'origine). */
function forward(yaw: number, pitch: number): [number, number, number] {
  return [
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ]
}

describe("anglesTowards", () => {
  it("vise le point demandé depuis la hauteur d'œil", () => {
    const from: [number, number, number] = [6.2, 0, -8.7]
    const to: [number, number, number] = [3, 1.5, -8.7]
    const { yaw, pitch } = anglesTowards(from, to)

    const direction = forward(yaw, pitch)
    const dx = to[0] - from[0]
    const dy = to[1] - (from[1] + EYE_HEIGHT)
    const dz = to[2] - from[2]
    const norm = Math.hypot(dx, dy, dz)

    expect(direction[0]).toBeCloseTo(dx / norm, 6)
    expect(direction[1]).toBeCloseTo(dy / norm, 6)
    expect(direction[2]).toBeCloseTo(dz / norm, 6)
  })

  it("regarde vers -Z à l'horizontale quand la cible est devant", () => {
    const { yaw, pitch } = anglesTowards([0, 0, 0], [0, EYE_HEIGHT, -5])
    expect(yaw).toBeCloseTo(0, 6)
    expect(pitch).toBeCloseTo(0, 6)
  })
})

describe("horizontalMove", () => {
  it("avance vers -Z quand yaw = 0", () => {
    const { dx, dz } = horizontalMove(0, 1, 0, 2)
    expect(dx).toBeCloseTo(0, 6)
    expect(dz).toBeCloseTo(-2, 6)
  })

  it("avance vers -X quand yaw = π/2", () => {
    const { dx, dz } = horizontalMove(Math.PI / 2, 1, 0, 2)
    expect(dx).toBeCloseTo(-2, 6)
    expect(dz).toBeCloseTo(0, 6)
  })

  it("normalise la diagonale pour ne pas courir plus vite", () => {
    const { dx, dz } = horizontalMove(0, 1, 1, 2)
    expect(Math.hypot(dx, dz)).toBeCloseTo(2, 6)
  })

  it("ne bouge pas sans intention", () => {
    expect(horizontalMove(0.3, 0, 0, 2)).toEqual({ dx: 0, dz: 0 })
  })
})

describe("clampPitch", () => {
  it("borne la vue vers le haut et le bas", () => {
    expect(clampPitch(10)).toBeCloseTo(MAX_PITCH, 6)
    expect(clampPitch(-10)).toBeCloseTo(-MAX_PITCH, 6)
    expect(clampPitch(0.3)).toBe(0.3)
  })
})

describe("points de visite", () => {
  it("a des identifiants uniques et un point par défaut valide", () => {
    const ids = VIEWER_SPOTS.map((spot) => spot.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findSpot(DEFAULT_SPOT_ID).id).toBe(DEFAULT_SPOT_ID)
  })

  it("reste dans l'emprise du terrain du modèle", () => {
    for (const spot of VIEWER_SPOTS) {
      expect(spot.position[0]).toBeGreaterThan(-25)
      expect(spot.position[0]).toBeLessThan(32)
      expect(spot.position[2]).toBeGreaterThan(-40)
      expect(spot.position[2]).toBeLessThan(25)
    }
  })

  it("place les yeux au-dessus du sol du niveau", () => {
    for (const spot of VIEWER_SPOTS) {
      expect(spot.lookAt[1]).toBeGreaterThan(spot.position[1])
    }
  })
})
