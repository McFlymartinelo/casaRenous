import type { FurnitureItem, Rect2 } from "@/types"
import type { WallConfig } from "@/types"

export interface Footprint {
  x: number
  z: number
  w: number
  d: number
  rotation: number
}

type Vec2 = [number, number]

export const GRID = 0.05
const WALL_SNAP_DISTANCE = 0.14
const WALL_GAP = 0.02

export function snap(value: number, step = GRID): number {
  return Math.round(value / step) * step
}

export function snapRotation(degrees: number, step = 15): number {
  const normalized = ((degrees % 360) + 360) % 360
  const snapped = Math.round(normalized / step) * step
  return snapped % 360
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function footprintCorners(footprint: Footprint): Vec2[] {
  const rad = degToRad(-footprint.rotation)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = footprint.w / 2
  const hd = footprint.d / 2
  const local: Vec2[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  return local.map(([x, z]) => [
    footprint.x + x * cos - z * sin,
    footprint.z + x * sin + z * cos,
  ])
}

function project(points: Vec2[], axis: Vec2): [number, number] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const value = point[0] * axis[0] + point[1] * axis[1]
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return [min, max]
}

function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  const polygons = [a, b]
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]!
      const next = polygon[(index + 1) % polygon.length]!
      const edge: Vec2 = [next[0] - current[0], next[1] - current[1]]
      const axis: Vec2 = [-edge[1], edge[0]]
      const length = Math.hypot(axis[0], axis[1])
      if (length < 1e-9) continue
      axis[0] /= length
      axis[1] /= length
      const [minA, maxA] = project(a, axis)
      const [minB, maxB] = project(b, axis)
      if (maxA <= minB + 1e-6 || maxB <= minA + 1e-6) return false
    }
  }
  return true
}

export function rectCorners(rect: Rect2): Vec2[] {
  return [
    [rect[0], rect[1]],
    [rect[2], rect[1]],
    [rect[2], rect[3]],
    [rect[0], rect[3]],
  ]
}

export function footprintIntersectsRect(footprint: Footprint, rect: Rect2): boolean {
  return polygonsOverlap(footprintCorners(footprint), rectCorners(rect))
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return polygonsOverlap(footprintCorners(a), footprintCorners(b))
}

export function aabbOf(footprint: Footprint): Rect2 {
  const corners = footprintCorners(footprint)
  const xs = corners.map((point) => point[0])
  const zs = corners.map((point) => point[1])
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
}

export function isAxisAligned(rotation: number): boolean {
  return Math.abs(rotation % 90) < 0.001
}

/** Aimante un meuble contre le mur le plus proche (rotations 0/90/180/270). */
export function snapToWalls(
  footprint: Footprint,
  walls: WallConfig[],
): { x: number; z: number } {
  if (!isAxisAligned(footprint.rotation)) return { x: footprint.x, z: footprint.z }
  let best: { x: number; z: number; distance: number } | null = null
  const box = aabbOf(footprint)
  for (const wall of walls) {
    const rect = wallRect(wall)
    const overlapX = Math.min(box[2], rect[2]) - Math.max(box[0], rect[0])
    const overlapZ = Math.min(box[3], rect[3]) - Math.max(box[1], rect[1])
    if (overlapZ > 0.02 && overlapX < -0.001) {
      const gapEast = box[0] - rect[2]
      const gapWest = rect[0] - box[2]
      if (gapEast >= 0 && gapEast <= WALL_SNAP_DISTANCE) {
        const shift = WALL_GAP - gapEast
        if (!best || gapEast < best.distance) best = { x: footprint.x + shift, z: footprint.z, distance: gapEast }
      }
      if (gapWest >= 0 && gapWest <= WALL_SNAP_DISTANCE) {
        const shift = -WALL_GAP - gapWest
        if (!best || gapWest < best.distance) best = { x: footprint.x + shift, z: footprint.z, distance: gapWest }
      }
    }
    if (overlapX > 0.02 && overlapZ < -0.001) {
      const gapNorth = box[1] - rect[3]
      const gapSouth = rect[1] - box[3]
      if (gapNorth >= 0 && gapNorth <= WALL_SNAP_DISTANCE) {
        const shift = WALL_GAP - gapNorth
        if (!best || gapNorth < best.distance) best = { x: footprint.x, z: footprint.z + shift, distance: gapNorth }
      }
      if (gapSouth >= 0 && gapSouth <= WALL_SNAP_DISTANCE) {
        const shift = -WALL_GAP - gapSouth
        if (!best || gapSouth < best.distance) best = { x: footprint.x, z: footprint.z + shift, distance: gapSouth }
      }
    }
  }
  return best ? { x: best.x, z: best.z } : { x: footprint.x, z: footprint.z }
}

export function wallRect(wall: WallConfig): Rect2 {
  const t = wall.thickness / 2
  const horizontal =
    Math.abs(wall.to[0] - wall.from[0]) >= Math.abs(wall.to[1] - wall.from[1])
  if (horizontal) {
    return [
      Math.min(wall.from[0], wall.to[0]),
      wall.from[1] - t,
      Math.max(wall.from[0], wall.to[0]),
      wall.from[1] + t,
    ]
  }
  return [
    wall.from[0] - t,
    Math.min(wall.from[1], wall.to[1]),
    wall.from[0] + t,
    Math.max(wall.from[1], wall.to[1]),
  ]
}

export function insideBounds(footprint: Footprint, bounds: Rect2): boolean {
  const box = aabbOf(footprint)
  return (
    box[0] >= bounds[0] &&
    box[1] >= bounds[1] &&
    box[2] <= bounds[2] &&
    box[3] <= bounds[3]
  )
}

export interface PlacementContext {
  walls: WallConfig[]
  others: { item: FurnitureItem; footprint: Footprint; allowOverlap: boolean; elevation: number }[]
  bounds: Rect2
  /** Le meuble déplacé peut chevaucher les autres (tapis, déco murale…). */
  candidateAllowsOverlap?: boolean
}

export function canPlace(footprint: Footprint, context: PlacementContext): boolean {
  if (!insideBounds(footprint, context.bounds)) return false
  for (const wall of context.walls) {
    if (footprintIntersectsRect(footprint, wallRect(wall))) return false
  }
  if (context.candidateAllowsOverlap) return true
  for (const other of context.others) {
    if (other.allowOverlap) continue
    if ((other.elevation ?? 0) > 0.9) continue
    if (footprintsOverlap(footprint, other.footprint)) return false
  }
  return true
}

export function resolvePlacement(
  footprint: Footprint,
  context: PlacementContext,
): { x: number; z: number; valid: boolean } {
  const wallSnapped = snapToWalls(footprint, context.walls)
  const candidates: Footprint[] = [
    { ...footprint, x: wallSnapped.x, z: wallSnapped.z },
    footprint,
    { ...footprint, z: footprint.z },
    { ...footprint, x: footprint.x },
  ]
  for (const candidate of candidates) {
    if (canPlace(candidate, context)) return { x: candidate.x, z: candidate.z, valid: true }
  }
  return { x: footprint.x, z: footprint.z, valid: false }
}

export function freeSpot(
  footprint: Footprint,
  context: PlacementContext,
  preferred: Vec2,
): { x: number; z: number } {
  const direct: Footprint = { ...footprint, x: snap(preferred[0]), z: snap(preferred[1]) }
  if (canPlace(direct, context)) return { x: direct.x, z: direct.z }
  for (let radius = 0.25; radius <= 3; radius += 0.25) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const candidate: Footprint = {
        ...footprint,
        x: snap(preferred[0] + Math.cos(angle) * radius),
        z: snap(preferred[1] + Math.sin(angle) * radius),
      }
      if (canPlace(candidate, context)) return { x: candidate.x, z: candidate.z }
    }
  }
  return { x: direct.x, z: direct.z }
}

export function distanceLabel(meters: number): string {
  if (meters < 1) return `${Math.round(meters * 100)} cm`
  return `${meters.toFixed(2).replace(".", ",")} m`
}
