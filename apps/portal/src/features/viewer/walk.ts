import { EYE_HEIGHT } from "./spots"

/** Réglages de la marche (unités du modèle : 1 = 1 mètre). */
export const WALK_SPEED = 1.8
export const RUN_SPEED = 4
export const GRAVITY = 18
export const PLAYER_RADIUS = 0.22
export const MAX_STEP = 0.45
export const LOOK_SENSITIVITY = 0.0024
export const MAX_PITCH = 1.45
export const MIN_FLOOR = -6

export { EYE_HEIGHT }

/** État mutable partagé entre le canvas (3D) et les contrôles tactiles (DOM). */
export interface WalkInput {
  forward: number
  strafe: number
  run: boolean
  lookX: number
  lookY: number
}

export function createWalkInput(): WalkInput {
  return { forward: 0, strafe: 0, run: false, lookX: 0, lookY: 0 }
}

export function resetWalkInput(input: WalkInput): void {
  input.forward = 0
  input.strafe = 0
  input.run = false
}

export interface Angles {
  yaw: number
  pitch: number
}

/**
 * Angles de caméra (ordre YXZ) pour regarder de `from` vers `to`.
 * La caméra three.js regarde vers -Z quand yaw = pitch = 0.
 */
export function anglesTowards(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): Angles {
  const dx = to[0] - from[0]
  const dy = to[1] - (from[1] + EYE_HEIGHT)
  const dz = to[2] - from[2]
  const horizontal = Math.hypot(dx, dz)
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: horizontal < 1e-6 ? 0 : Math.atan2(dy, horizontal),
  }
}

export function clampPitch(pitch: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch))
}

/** Déplacement horizontal (mètres) pour une orientation et une intention de marche. */
export function horizontalMove(
  yaw: number,
  forward: number,
  strafe: number,
  distance: number,
): { dx: number; dz: number } {
  const length = Math.hypot(forward, strafe)
  if (length < 1e-6) return { dx: 0, dz: 0 }
  const f = forward / length
  const s = strafe / length
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  const rx = Math.cos(yaw)
  const rz = -Math.sin(yaw)
  return {
    dx: (fx * f + rx * s) * distance,
    dz: (fz * f + rz * s) * distance,
  }
}

/** Direction testée par le raycast de collision (3 rayons en éventail). */
export const COLLISION_FAN = [-0.6, 0, 0.6]

/** Hauteurs de test des obstacles : tibias et buste. */
export const COLLISION_HEIGHTS = [0.5, 1.3]
