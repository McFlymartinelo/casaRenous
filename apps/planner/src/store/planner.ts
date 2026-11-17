import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { getCatalogItem, getItemSize, getVariant } from "@/catalog/catalog"
import { HOUSE, getWalls, levelFloorBounds } from "@/config/house"
import { EXAMPLE_RDC } from "@/config/example"
import { freeSpot } from "@/lib/placement"
import type {
  AmbienceConfig,
  CatalogItem,
  FurnitureItem,
  LevelId,
  Point2,
  Tool,
  ViewMode,
} from "@/types"

const STORAGE_KEY = "casa-planner-v1"
const HISTORY_LIMIT = 60

export interface ProjectFile {
  app: "casa-planner"
  version: 1
  savedAt: string
  house: { name: string; version: string }
  level: LevelId
  furniture: FurnitureItem[]
  ambience: AmbienceConfig
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface PlannerState {
  furniture: FurnitureItem[]
  /** Portes ouvertes, clé = `${item.id}:${doorId}`. État visuel non persistant. */
  openDoors: Record<string, boolean>
  selectedId: string | null
  hoveredId: string | null
  level: LevelId
  view: ViewMode
  tool: Tool
  rotationStep: 15 | 90
  ambience: AmbienceConfig
  past: FurnitureItem[][]
  future: FurnitureItem[][]
  transaction: FurnitureItem[] | null
  savedAt: number | null
  measurePoints: Point2[]
  exporting: boolean
  dragging: boolean
  draggingId: string | null
  rotatingId: string | null

  addItem: (catalogId: string, x: number, z: number, rotation?: number) => string | null
  updateItem: (id: string, patch: Partial<FurnitureItem>, record?: boolean) => void
  beginTransaction: () => void
  updateLive: (id: string, patch: Partial<FurnitureItem>) => void
  commitTransaction: () => void
  cancelTransaction: () => void
  remove: (id: string) => void
  duplicate: (id: string) => string | null
  rotate: (id: string, delta: number) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
  setVariant: (id: string, variantId: string) => void
  setLevel: (level: LevelId) => void
  setView: (view: ViewMode) => void
  setTool: (tool: Tool) => void
  setRotationStep: (step: 15 | 90) => void
  setAmbience: (patch: Partial<AmbienceConfig>) => void
  setRealistic: (enabled: boolean) => void
  undo: () => void
  redo: () => void
  clearMeasure: () => void
  addMeasurePoint: (point: Point2) => void
  setExporting: (value: boolean) => void
  setDragging: (id: string | null) => void
  setRotating: (id: string | null) => void
  toggleDoor: (key: string, defaultOpen?: boolean) => void
  closeAllDoors: () => void
  markSaved: () => void
  resetProject: () => void
  loadExample: () => void
  importProject: (file: ProjectFile) => void
  exportProject: () => ProjectFile
}

/** Aménagement de démonstration, utilisé au premier lancement et par « Charger l'exemple ». */
function buildExampleFurniture(): FurnitureItem[] {
  const items: FurnitureItem[] = []
  for (const placement of EXAMPLE_RDC) {
    let catalog: CatalogItem
    try {
      catalog = getCatalogItem(placement.catalogId)
    } catch {
      continue
    }
    const variantId =
      catalog.variants.find((entry) => entry.id === placement.variant)?.id ??
      catalog.defaultVariant ??
      catalog.variants[0]?.id
    if (!variantId) continue
    items.push({
      id: createId(),
      catalogId: placement.catalogId,
      level: placement.level ?? "rdc",
      x: placement.x,
      z: placement.z,
      rotation: placement.rotation,
      variantId,
      elevation: placement.elevation ?? catalog.elevation ?? 0,
      size: placement.size,
    })
  }
  return items
}

const initialFurniture: FurnitureItem[] = buildExampleFurniture()

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => ({
      furniture: initialFurniture,
      openDoors: {},
      selectedId: null,
      hoveredId: null,
      level: "rdc",
      view: "3d",
      tool: "move",
      rotationStep: 15,
      ambience: { ...HOUSE.ambience },
      past: [],
      future: [],
      transaction: null,
      savedAt: null,
      measurePoints: [],
      exporting: false,
      dragging: false,
      draggingId: null,
      rotatingId: null,

      addItem: (catalogId, x, z, rotation = 0) => {
        let item
        try {
          item = getCatalogItem(catalogId)
        } catch {
          return null
        }
        const variant = item.defaultVariant ?? item.variants[0]?.id
        if (!variant) return null
        const furnitureItem: FurnitureItem = {
          id: createId(),
          catalogId,
          level: get().level,
          x,
          z,
          rotation,
          variantId: variant,
          elevation: item.elevation ?? 0,
        }
        set((state) => ({
          furniture: [...state.furniture, furnitureItem],
          selectedId: furnitureItem.id,
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          savedAt: null,
        }))
        return furnitureItem.id
      },

      updateItem: (id, patch, record = true) => {
        set((state) => {
          const next = state.furniture.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          )
          return {
            furniture: next,
            past: record
              ? [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture]
              : state.past,
            future: record ? [] : state.future,
            savedAt: null,
          }
        })
      },

      beginTransaction: () => {
        if (get().transaction) return
        set({ transaction: get().furniture })
      },

      updateLive: (id, patch) => {
        const state = get()
        if (!state.transaction) {
          set({ transaction: state.furniture })
        }
        set((current) => ({
          furniture: current.furniture.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
          savedAt: null,
        }))
      },

      commitTransaction: () => {
        const state = get()
        if (!state.transaction) return
        if (JSON.stringify(state.transaction) === JSON.stringify(state.furniture)) {
          set({ transaction: null })
          return
        }
        set({
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.transaction],
          future: [],
          transaction: null,
          savedAt: null,
        })
      },

      cancelTransaction: () => {
        const snapshot = get().transaction
        if (snapshot) set({ furniture: snapshot, transaction: null })
      },

      remove: (id) => {
        set((state) => ({
          furniture: state.furniture.filter((item) => item.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          savedAt: null,
        }))
      },

      duplicate: (id) => {
        const source = get().furniture.find((item) => item.id === id)
        if (!source) return null
        const catalog = getCatalogItem(source.catalogId)
        const sourceSize = getItemSize(source)
        const others = get().furniture
          .filter((item) => item.level === source.level && item.id !== source.id)
          .map((item) => {
            const otherCatalog = getCatalogItem(item.catalogId)
            const otherSize = getItemSize(item)
            return {
              item,
              footprint: { x: item.x, z: item.z, w: otherSize.w, d: otherSize.d, rotation: item.rotation },
              allowOverlap: Boolean(otherCatalog.allowOverlap),
              elevation: item.elevation ?? otherCatalog.elevation ?? 0,
            }
          })
        const spot = freeSpot(
          { x: source.x, z: source.z, w: sourceSize.w, d: sourceSize.d, rotation: source.rotation },
          {
            walls: getWalls(source.level),
            bounds: levelFloorBounds(source.level),
            others,
            candidateAllowsOverlap: Boolean(catalog.allowOverlap),
          },
          [source.x + 0.35, source.z + 0.35],
        )
        const copy: FurnitureItem = {
          ...source,
          id: createId(),
          x: spot.x,
          z: spot.z,
        }
        set((state) => ({
          furniture: [...state.furniture, copy],
          selectedId: copy.id,
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          savedAt: null,
        }))
        return copy.id
      },

      rotate: (id, delta) => {
        set((state) => ({
          furniture: state.furniture.map((item) =>
            item.id === id
              ? { ...item, rotation: (((item.rotation + delta) % 360) + 360) % 360 }
              : item,
          ),
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          savedAt: null,
        }))
      },

      select: (id) => set({ selectedId: id }),
      hover: (id) => set({ hoveredId: id }),

      setVariant: (id, variantId) => {
        set((state) => ({
          furniture: state.furniture.map((item) =>
            item.id === id ? { ...item, variantId } : item,
          ),
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          savedAt: null,
        }))
      },

      setLevel: (level) =>
        set({
          level,
          selectedId: null,
          measurePoints: [],
          view: get().view === "walk" ? "walk" : get().view,
        }),
      setView: (view) => set({ view, measurePoints: [] }),
      setTool: (tool) => set({ tool, measurePoints: [] }),
      setRotationStep: (rotationStep) => set({ rotationStep }),

      setAmbience: (patch) =>
        set((state) => ({ ambience: { ...state.ambience, ...patch } })),

      setRealistic: (enabled) =>
        set((state) => ({
          ambience: {
            ...state.ambience,
            softShadows: enabled,
            textures: enabled,
            vegetation: enabled,
            ambientOcclusion: enabled,
          },
        })),

      undo: () => {
        const state = get()
        const previous = state.past[state.past.length - 1]
        if (!previous) return
        set({
          furniture: previous,
          past: state.past.slice(0, -1),
          future: [state.furniture, ...state.future].slice(0, HISTORY_LIMIT),
          selectedId: null,
          savedAt: null,
        })
      },

      redo: () => {
        const state = get()
        const next = state.future[0]
        if (!next) return
        set({
          furniture: next,
          past: [...state.past, state.furniture].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          selectedId: null,
          savedAt: null,
        })
      },

      clearMeasure: () => set({ measurePoints: [] }),
      addMeasurePoint: (point) =>
        set((state) => ({
          measurePoints:
            state.measurePoints.length >= 2 ? [point] : [...state.measurePoints, point],
        })),

      setExporting: (exporting) => set({ exporting }),
      setDragging: (id) => set({ dragging: Boolean(id), draggingId: id }),
      setRotating: (id) => set({ rotatingId: id }),
      toggleDoor: (key, defaultOpen = false) =>
        set((state) => ({
          openDoors: {
            ...state.openDoors,
            [key]: !(state.openDoors[key] ?? defaultOpen),
          },
        })),
      closeAllDoors: () => set({ openDoors: {} }),
      markSaved: () => set({ savedAt: Date.now() }),

      resetProject: () =>
        set((state) => ({
          furniture: [],
          openDoors: {},
          selectedId: null,
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          ambience: { ...HOUSE.ambience },
          savedAt: null,
        })),

      loadExample: () => {
        set((state) => ({
          furniture: buildExampleFurniture(),
          openDoors: {},
          selectedId: null,
          level: "rdc",
          view: "3d",
          tool: "move",
          past: [...state.past.slice(-HISTORY_LIMIT + 1), state.furniture],
          future: [],
          savedAt: null,
        }))
      },

      importProject: (file) => {
        const valid = Array.isArray(file.furniture)
          ? file.furniture.filter((item) => {
              try {
                const catalog = getCatalogItem(item.catalogId)
                return Boolean(getVariant(catalog, item.variantId))
              } catch {
                return false
              }
            })
          : []
        set({
          furniture: valid,
          openDoors: {},
          level: file.level === "etage" ? "etage" : "rdc",
          ambience: { ...HOUSE.ambience, ...file.ambience },
          selectedId: null,
          past: [],
          future: [],
          savedAt: Date.now(),
        })
      },

      exportProject: () => {
        const state = get()
        return {
          app: "casa-planner",
          version: 1,
          savedAt: new Date().toISOString(),
          house: { name: HOUSE.meta.name, version: HOUSE.meta.version },
          level: state.level,
          furniture: state.furniture,
          ambience: state.ambience,
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: 4,
      migrate: (persisted, version) => {
        const incoming = (persisted ?? {}) as Partial<PlannerState>
        if (
          version < 4 &&
          (!Array.isArray(incoming.furniture) || incoming.furniture.length === 0)
        ) {
          return {
            ...incoming,
            furniture: buildExampleFurniture(),
            ambience: { ...HOUSE.ambience },
            level: "rdc",
            view: "3d",
          } as PlannerState
        }
        return persisted as PlannerState
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        furniture: state.furniture,
        level: state.level,
        view: state.view,
        tool: state.tool,
        rotationStep: state.rotationStep,
        ambience: state.ambience,
      }),
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<PlannerState>
        const furniture = Array.isArray(incoming.furniture)
          ? incoming.furniture.filter((item) => {
              try {
                getCatalogItem(item.catalogId)
                return true
              } catch {
                return false
              }
            })
          : current.furniture
        return {
          ...current,
          ...incoming,
          furniture,
          openDoors: {},
          ambience: { ...HOUSE.ambience, ...(incoming.ambience ?? {}) },
          past: [],
          future: [],
          transaction: null,
          selectedId: null,
          hoveredId: null,
          measurePoints: [],
          exporting: false,
          dragging: false,
          draggingId: null,
          rotatingId: null,
          savedAt: null,
        }
      },
    },
  ),
)

export function useSelectedItem(): FurnitureItem | null {
  return usePlanner((state) =>
    state.furniture.find((item) => item.id === state.selectedId) ?? null,
  )
}

export function levelFurniture(level: LevelId): FurnitureItem[] {
  return usePlanner.getState().furniture.filter((item) => item.level === level)
}
