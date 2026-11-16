import houseJson from "@/config/house.json"
import type {
  HouseConfig,
  LevelConfig,
  LevelId,
  MaterialConfig,
  OpeningConfig,
  Point2,
  Rect2,
  RoomConfig,
  WallConfig,
} from "@/types"

export const HOUSE = houseJson as unknown as HouseConfig
export const LEVELS = HOUSE.levels
export const MATERIALS = HOUSE.materials

export const HOUSE_CENTER: Point2 = [
  HOUSE.envelope.width / 2,
  HOUSE.envelope.depth / 2,
]

/** Le plan stocke y vers le nord ; three.js utilise z vers le sud. */
export function worldZ(planZ: number): number {
  return -planZ
}

export function worldPoint(point: Point2): Point2 {
  return [point[0], -point[1]]
}

export function wallRenderTransform(wall: WallConfig): {
  position: [number, number]
  rotation: number
} {
  const geom = wallGeometry(wall)
  // Le groupe est placé au début du mur : toutes les cotes locales
  // (segments, ouvertures, plinthes) sont mesurées depuis wall.from.
  return {
    position: [wall.from[0], -wall.from[1]],
    rotation: -geom.angle,
  }
}

export function getLevel(id: LevelId): LevelConfig {
  const level = LEVELS.find((item) => item.id === id)
  if (!level) throw new Error(`Niveau inconnu : ${id}`)
  return level
}

export function getWalls(level: LevelId): WallConfig[] {
  return HOUSE.walls.filter((wall) => wall.level === level)
}

export function getRooms(level: LevelId): RoomConfig[] {
  return HOUSE.rooms.filter((room) => room.level === level)
}

export function getMaterial(id: string): MaterialConfig {
  const material = MATERIALS[id]
  if (!material) throw new Error(`Matériau inconnu : ${id}`)
  return material
}

export function wallHeight(wall: WallConfig): number {
  return wall.height ?? getLevel(wall.level).ceilingHeight
}

export function wallBase(wall: WallConfig): number {
  return getLevel(wall.level).elevation
}

export interface WallGeom {
  length: number
  angle: number
  center: Point2
  direction: Point2
  normal: Point2
}

/** Géométrie locale d'un mur : il court selon +X après rotation autour de Y. */
export function wallGeometry(wall: WallConfig): WallGeom {
  const dx = wall.to[0] - wall.from[0]
  const dz = wall.to[1] - wall.from[1]
  const length = Math.hypot(dx, dz)
  const direction: Point2 = [dx / length, dz / length]
  return {
    length,
    angle: Math.atan2(-dz, dx),
    center: [wall.from[0] + dx / 2, wall.from[1] + dz / 2],
    direction,
    normal: [-direction[1], direction[0]],
  }
}

/** Position d'une ouverture le long du mur, mesurée depuis wall.from. */
export function openingSpan(wall: WallConfig, opening: OpeningConfig): [number, number] {
  const horizontal =
    Math.abs(wall.to[0] - wall.from[0]) >= Math.abs(wall.to[1] - wall.from[1])
  const start = horizontal ? wall.from[0] : wall.from[1]
  const end = horizontal ? wall.to[0] : wall.to[1]
  const sign = end >= start ? 1 : -1
  const a = (opening.from - start) * sign
  const b = (opening.to - start) * sign
  return a <= b ? [a, b] : [b, a]
}

export function isHorizontal(wall: WallConfig): boolean {
  return Math.abs(wall.to[0] - wall.from[0]) >= Math.abs(wall.to[1] - wall.from[1])
}

/** Emprise rectangulaire d'un mur (collisions meubles / marche). */
export function wallRect(wall: WallConfig): Rect2 {
  const t = wall.thickness / 2
  if (isHorizontal(wall)) {
    const x0 = Math.min(wall.from[0], wall.to[0])
    const x1 = Math.max(wall.from[0], wall.to[0])
    return [x0, wall.from[1] - t, x1, wall.from[1] + t]
  }
  const z0 = Math.min(wall.from[1], wall.to[1])
  const z1 = Math.max(wall.from[1], wall.to[1])
  return [wall.from[0] - t, z0, wall.from[0] + t, z1]
}

/** Rectangles pleins pour la marche, en laissant passer les portes et baies. */
export function wallWalkRects(wall: WallConfig): Rect2[] {
  const geom = wallGeometry(wall)
  const horizontal = isHorizontal(wall)
  const t = wall.thickness / 2
  const passages = (wall.openings ?? []).filter(
    (opening) => opening.sill <= 0.2 && opening.top >= 1.3,
  )
  const spans = passages
    .map((opening) => openingSpan(wall, opening))
    .sort((a, b) => a[0] - b[0])
  const solids: [number, number][] = []
  let cursor = 0
  for (const [a, b] of spans) {
    if (a > cursor) solids.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < geom.length) solids.push([cursor, geom.length])

  return solids.map(([a, b]) => {
    const p0: Point2 = [
      wall.from[0] + geom.direction[0] * a,
      wall.from[1] + geom.direction[1] * a,
    ]
    const p1: Point2 = [
      wall.from[0] + geom.direction[0] * b,
      wall.from[1] + geom.direction[1] * b,
    ]
    if (horizontal) {
      const z = -wall.from[1]
      return [Math.min(p0[0], p1[0]), z - t, Math.max(p0[0], p1[0]), z + t]
    }
    return [
      wall.from[0] - t,
      -Math.max(p0[1], p1[1]),
      wall.from[0] + t,
      -Math.min(p0[1], p1[1]),
    ]
  })
}

export function levelFloorBounds(_level: LevelId): Rect2 {
  const t = HOUSE.envelope.wallThickness
  return [t, t, HOUSE.envelope.width - t, HOUSE.envelope.depth - t]
}

export function rectArea(rect: Rect2): number {
  return Math.max(0, rect[2] - rect[0]) * Math.max(0, rect[3] - rect[1])
}

export function rectCenter(rect: Rect2): Point2 {
  return [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]
}

export function pointInRect(point: Point2, rect: Rect2): boolean {
  return (
    point[0] >= rect[0] &&
    point[0] <= rect[2] &&
    point[1] >= rect[1] &&
    point[1] <= rect[3]
  )
}

export function roomAt(level: LevelId, point: Point2): RoomConfig | null {
  const rooms = getRooms(level)
  const exact = rooms.find((room) => pointInRect(point, room.rect))
  if (exact) return exact
  let nearest: RoomConfig | null = null
  let best = Number.POSITIVE_INFINITY
  for (const room of rooms) {
    const center = rectCenter(room.rect)
    const distance = Math.hypot(center[0] - point[0], center[1] - point[1])
    if (distance < best) {
      best = distance
      nearest = room
    }
  }
  return best < 2.5 ? nearest : null
}
