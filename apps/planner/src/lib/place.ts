import { getCatalogItem, getItemSize } from "@/catalog/catalog"
import { getWalls, levelFloorBounds, siteBounds, getLevel } from "@/config/house"
import type { FurnitureItem, LevelId, Point2 } from "@/types"
import {
  canPlace,
  footprintCorners,
  freeSpot,
  GRID,
  resolvePlacement,
  snap,
  type Footprint,
  type PlacementContext,
} from "@/lib/placement"
import { usePlanner } from "@/store/planner"

export function footprintOf(item: FurnitureItem): Footprint {
  const size = getItemSize(item)
  return {
    x: item.x,
    z: item.z,
    w: size.w,
    d: size.d,
    rotation: item.rotation,
  }
}

export function placementContext(
  level: LevelId,
  excludeId?: string,
  outdoor = false,
): PlacementContext {
  const all = usePlanner.getState().furniture
  return {
    walls: getWalls(level),
    bounds: outdoor ? siteBounds() : levelFloorBounds(level),
    others: all
      .filter((item) => item.level === level && item.id !== excludeId)
      .map((item) => {
        const catalog = getCatalogItem(item.catalogId)
        const size = getItemSize(item)
        return {
          item,
          footprint: { x: item.x, z: item.z, w: size.w, d: size.d, rotation: item.rotation },
          allowOverlap: Boolean(catalog.allowOverlap),
          elevation: item.elevation ?? catalog.elevation ?? 0,
        }
      }),
  }
}

export function addCatalogAt(catalogId: string, point: Point2): string | null {
  let catalog
  try {
    catalog = getCatalogItem(catalogId)
  } catch {
    return null
  }
  const level = usePlanner.getState().level
  const context = placementContext(level, undefined, Boolean(catalog.outdoor))
  context.candidateAllowsOverlap = Boolean(catalog.allowOverlap)
  const footprint: Footprint = {
    x: snap(point[0]),
    z: snap(point[1]),
    w: catalog.w,
    d: catalog.d,
    rotation: 0,
  }
  const spot = canPlace(footprint, context)
    ? { x: footprint.x, z: footprint.z }
    : freeSpot(footprint, context, point)
  return usePlanner.getState().addItem(catalogId, spot.x, spot.z, 0)
}

export function moveFootprint(
  item: FurnitureItem,
  target: Point2,
  gridSnap = true,
): { x: number; z: number; valid: boolean } {
  const catalog = getCatalogItem(item.catalogId)
  const size = getItemSize(item)
  const context = placementContext(item.level, item.id)
  context.candidateAllowsOverlap = Boolean(catalog.allowOverlap)
  const footprint: Footprint = {
    x: gridSnap ? snap(target[0], GRID) : target[0],
    z: gridSnap ? snap(target[1], GRID) : target[1],
    w: size.w,
    d: size.d,
    rotation: item.rotation,
  }
  const resolved = resolvePlacement(footprint, context)
  if (resolved.valid) return resolved
  return { x: item.x, z: item.z, valid: false }
}

export function applyRotation(
  item: FurnitureItem,
  rotation: number,
  live = false,
): boolean {
  const catalog = getCatalogItem(item.catalogId)
  const size = getItemSize(item)
  const context = placementContext(item.level, item.id)
  context.candidateAllowsOverlap = Boolean(catalog.allowOverlap)
  const footprint: Footprint = { x: item.x, z: item.z, w: size.w, d: size.d, rotation }
  let resolved = resolvePlacement(footprint, context)
  if (!resolved.valid) {
    // Une rotation pr?s d'un mur peut n?cessiter un petit recentrage.
    search: for (const radius of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) {
      for (let step = 0; step < 8; step += 1) {
        const angle = (step * Math.PI) / 4
        const candidate: Footprint = {
          ...footprint,
          x: snap(item.x + Math.cos(angle) * radius),
          z: snap(item.z + Math.sin(angle) * radius),
        }
        if (canPlace(candidate, context)) {
          resolved = { x: candidate.x, z: candidate.z, valid: true }
          break search
        }
      }
    }
  }
  if (!resolved.valid) return false
  const patch = { rotation, x: resolved.x, z: resolved.z }
  if (live) usePlanner.getState().updateLive(item.id, patch)
  else usePlanner.getState().updateItem(item.id, patch, true)
  return true
}

export function isFootprintValid(item: FurnitureItem): boolean {
  const catalog = getCatalogItem(item.catalogId)
  const context = placementContext(item.level, item.id, Boolean(catalog.outdoor))
  context.candidateAllowsOverlap = Boolean(catalog.allowOverlap)
  return canPlace(footprintOf(item), context)
}

export function roomOfItem(item: FurnitureItem): string | null {
  const level = getLevel(item.level)
  void level
  const catalog = getCatalogItem(item.catalogId)
  return catalog.category
}

export function itemCorners(item: FurnitureItem): Point2[] {
  return footprintCorners(footprintOf(item))
}
