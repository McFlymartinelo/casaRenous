import { useEffect, useMemo } from "react"
import { Html, Line } from "@react-three/drei"
import { useThree, type ThreeEvent } from "@react-three/fiber"
import { getCatalogItem, getItemSize, getVariant } from "@/catalog/catalog"
import { getLevel, roomAt } from "@/config/house"
import { degToRad, snapRotation } from "@/lib/placement"
import { applyRotation, moveFootprint } from "@/lib/place"
import { usePlanner } from "@/store/planner"
import type { FurnitureItem, Point2 } from "@/types"
import { LockIcon } from "@/components/Icons"
import { sceneApi } from "./scene-api"
import { FurnitureModel, PARAMETRIC_KINDS } from "./furniture/models"

interface DragState {
  id: string
  mode: "move" | "rotate"
  offset: Point2
  startAngle: number
  startRotation: number
}

let dragState: DragState | null = null

function pointerAngle(point: Point2, center: Point2): number {
  return (Math.atan2(point[0] - center[0], point[1] - center[1]) * 180) / Math.PI
}

export function FurnitureLayer({ showUpper }: { showUpper: boolean }) {
  const furniture = usePlanner((state) => state.furniture)
  return (
    <group>
      {furniture
        .filter((item) => item.level === "rdc" || (showUpper && item.level === "etage"))
        .map((item) => (
          <FurniturePiece key={item.id} item={item} />
        ))}
    </group>
  )
}

function FurniturePiece({ item }: { item: FurnitureItem }) {
  const selected = usePlanner((state) => state.selectedId === item.id)
  const hovered = usePlanner((state) => state.hoveredId === item.id)
  const tool = usePlanner((state) => state.tool)
  const view = usePlanner((state) => state.view)
  const activeLevel = usePlanner((state) => state.level)
  const exporting = usePlanner((state) => state.exporting)
  const select = usePlanner((state) => state.select)
  const hover = usePlanner((state) => state.hover)
  const setDragging = usePlanner((state) => state.setDragging)
  const setRotating = usePlanner((state) => state.setRotating)
  const beginTransaction = usePlanner((state) => state.beginTransaction)
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null
  const level = getLevel(item.level)
  const catalog = getCatalogItem(item.catalogId)
  const size = getItemSize(item)
  const variant = getVariant(catalog, item.variantId)
  const baseY = level.elevation + (item.elevation ?? catalog.elevation ?? 0)
  // Les meubles de l'autre niveau restent visibles comme contexte, mais ne
  // doivent pas être éditables : screenToFloor projette sur le niveau actif.
  const enabled = !exporting && view !== "walk" && item.level === activeLevel
  const parametric = PARAMETRIC_KINDS.has(catalog.kind)
  const modelItem = parametric
    ? { ...catalog, w: size.w, d: size.d, h: size.h }
    : catalog

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!enabled) return
    event.stopPropagation()
    select(item.id)
    // Un meuble verrouillé reste sélectionnable (et déverrouillable) mais ne
    // démarre aucun glisser ni rotation.
    if (item.locked || (tool !== "move" && tool !== "rotate")) return
    const point = sceneApi.current.screenToFloor?.(event.nativeEvent.clientX, event.nativeEvent.clientY)
    if (!point) return
    beginTransaction()
    if (controls) controls.enabled = false
    if (tool === "move") {
      dragState = {
        id: item.id,
        mode: "move",
        offset: [item.x - point[0], item.z - point[1]],
        startAngle: 0,
        startRotation: item.rotation,
      }
      setDragging(item.id)
    } else {
      dragState = {
        id: item.id,
        mode: "rotate",
        offset: [0, 0],
        startAngle: pointerAngle(point, [item.x, item.z]),
        startRotation: item.rotation,
      }
      setRotating(item.id)
    }
    document.body.style.cursor = tool === "move" ? "grabbing" : "ew-resize"
  }

  return (
    <group
      name={`furniture-${item.id}`}
      position={[item.x, baseY, -item.z]}
      rotation={[0, -degToRad(item.rotation), 0]}
      onPointerDown={handlePointerDown}
      onPointerOver={(event) => {
        if (!enabled) return
        event.stopPropagation()
        hover(item.id)
        if (item.locked) document.body.style.cursor = "not-allowed"
        else if (tool === "move") document.body.style.cursor = "grab"
        else if (tool === "rotate") document.body.style.cursor = "ew-resize"
      }}
      onPointerOut={() => {
        hover(null)
        document.body.style.cursor = "auto"
      }}
      onDoubleClick={(event) => {
        if (!enabled || item.locked) return
        event.stopPropagation()
        applyRotation(item, item.rotation + 90)
      }}
    >
      <group
        scale={
          parametric
            ? [1, 1, 1]
            : [
                size.w / Math.max(catalog.w, 0.001),
                size.h / Math.max(catalog.h, 0.001),
                size.d / Math.max(catalog.d, 0.001),
              ]
        }
      >
        <FurnitureModel item={modelItem} variant={variant} seed={item.id} />
      </group>
      {selected || hovered ? (
        <SelectionEdges
          width={size.w}
          depth={size.d}
          selected={selected}
          locked={Boolean(item.locked)}
        />
      ) : null}
    </group>
  )
}

function SelectionEdges({
  width,
  depth,
  selected,
  locked,
}: {
  width: number
  depth: number
  selected: boolean
  locked: boolean
}) {
  const y = 0.012
  const hw = width / 2
  const hd = depth / 2
  const points: [number, number, number][] = [
    [-hw, y, -hd],
    [hw, y, -hd],
    [hw, y, hd],
    [-hw, y, hd],
    [-hw, y, -hd],
  ]
  const color = locked ? "#d9a441" : selected ? "#67a879" : "#a9c2ad"
  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={selected ? 1.7 : 1}
        dashed={selected}
        dashSize={0.09}
        gapSize={0.06}
        transparent
        opacity={selected ? 0.95 : 0.5}
      />
      {selected
        ? [
            [-hw, -hd],
            [hw, -hd],
            [hw, hd],
            [-hw, hd],
          ].map(([x, z], index) => (
            <mesh key={index} position={[x!, y + 0.006, z!]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.09, 0.09]} />
              <meshBasicMaterial color={locked ? "#f6e3b8" : "#d9f2dd"} />
            </mesh>
          ))
        : null}
      {selected ? (
        <mesh position={[0, y + 0.008, -hd - 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.055, 0.085, 24]} />
          <meshBasicMaterial color={locked ? "#d9a441" : "#67a879"} />
        </mesh>
      ) : null}
    </group>
  )
}

export function SelectionOverlay() {
  const selectedId = usePlanner((state) => state.selectedId)
  const item = usePlanner((state) =>
    state.furniture.find((entry) => entry.id === state.selectedId),
  )
  const view = usePlanner((state) => state.view)
  const exporting = usePlanner((state) => state.exporting)
  const level = usePlanner((state) => state.level)
  const elevation = getLevel(level).elevation

  const catalog = item ? getCatalogItem(item.catalogId) : null
  const size = item ? getItemSize(item) : null
  const box = useMemo(() => {
    if (!item || !catalog || !size) return null
    const hw = size.w / 2
    const hd = size.d / 2
    const rad = degToRad(item.rotation)
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const corners: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ]
    return corners.map(([x, z]) => [item.x + x * cos - z * sin, item.z + x * sin + z * cos] as [number, number])
  }, [catalog, item, size])

  if (!item || !catalog || !size || !box || view === "walk" || exporting || !selectedId) return null
  const room = roomAt(item.level, [item.x, item.z])
  const base = elevation + (item.elevation ?? catalog.elevation ?? 0)
  const frontX = item.x + Math.sin(degToRad(item.rotation)) * (size.d / 2 + 0.12)
  const frontZ = item.z - Math.cos(degToRad(item.rotation)) * (size.d / 2 + 0.12)
  const labelY = base + 0.04
  const bottomY = base + 0.015
  const topY = base + size.h + 0.015

  return (
    <group>
      <Line
        points={box.map(([x, z]) => [x, bottomY, -z] as [number, number, number]).concat([[box[0]![0], bottomY, -box[0]![1]]])}
        color="#5f9c70"
        lineWidth={1.8}
        dashed
        dashSize={0.08}
        gapSize={0.055}
      />
      <Line
        points={box.map(([x, z]) => [x, topY, -z] as [number, number, number]).concat([[box[0]![0], topY, -box[0]![1]]])}
        color="#7fb68f"
        lineWidth={1.4}
        dashed
        dashSize={0.07}
        gapSize={0.06}
      />
      {box.map(([x, z], index) => (
        <Line
          key={`edge-${index}`}
          points={[
            [x, bottomY, -z],
            [x, topY, -z],
          ]}
          color="#7fb68f"
          lineWidth={1}
          transparent
          opacity={0.7}
        />
      ))}
      {box.map(([x, z], index) => (
        <mesh key={`corner-${index}`} position={[x, bottomY + 0.008, -z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.09, 0.09]} />
          <meshBasicMaterial color="#d9f2dd" />
        </mesh>
      ))}
      <Line
        points={[
          [item.x, base + 0.02, -item.z],
          [item.x, base + size.h + 0.15, -item.z],
        ]}
        color="#d18b5a"
        lineWidth={1.4}
        dashed
        dashSize={0.05}
        gapSize={0.035}
      />
      <mesh position={[item.x, base + size.h + 0.15, -item.z]}>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshBasicMaterial color="#e4a06b" />
      </mesh>
      <Html
        position={[frontX, labelY + 0.07, -frontZ]}
        center
        zIndexRange={[20, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div className={`selection-label${item.locked ? " selection-label--locked" : ""}`}>
          {item.locked ? (
            <span className="selection-label__lock" title="Emplacement verrouillé">
              <LockIcon size={11} />
            </span>
          ) : null}
          <span className="selection-label__name">{catalog.name}</span>
          <span className="selection-label__dims">
            {size.w.toFixed(2).replace(".", ",")} × {size.d.toFixed(2).replace(".", ",")} m
          </span>
          {room ? <span className="selection-label__room">{room.name}</span> : null}
        </div>
      </Html>
    </group>
  )
}

export function DragController() {
  const draggingId = usePlanner((state) => state.draggingId)
  const rotatingId = usePlanner((state) => state.rotatingId)
  const rotationStep = usePlanner((state) => state.rotationStep)
  const commitTransaction = usePlanner((state) => state.commitTransaction)
  const cancelTransaction = usePlanner((state) => state.cancelTransaction)
  const updateLive = usePlanner((state) => state.updateLive)
  const setDragging = usePlanner((state) => state.setDragging)
  const setRotating = usePlanner((state) => state.setRotating)
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null
  const active = draggingId ?? rotatingId

  useEffect(() => {
    if (!active) return
    const state = () => usePlanner.getState()

    function end() {
      state().commitTransaction()
      state().setDragging(null)
      state().setRotating(null)
      dragState = null
      if (controls) controls.enabled = true
      document.body.style.cursor = "auto"
    }

    function onMove(event: PointerEvent) {
      if (!dragState) return
      const item = state().furniture.find((entry) => entry.id === dragState?.id)
      if (!item || item.locked) return
      const point = sceneApi.current.screenToFloor?.(event.clientX, event.clientY)
      if (!point) return
      if (dragState.mode === "move") {
        const target: Point2 = [
          point[0] + dragState.offset[0],
          point[1] + dragState.offset[1],
        ]
        const result = moveFootprint(item, target)
        if (result.valid && (result.x !== item.x || result.z !== item.z)) {
          updateLive(item.id, { x: result.x, z: result.z })
        }
      } else {
        const angle = pointerAngle(point, [item.x, item.z])
        const next = snapRotation(
          dragState.startRotation + angle - dragState.startAngle,
          rotationStep,
        )
        if (next !== item.rotation) applyRotation(item, next, true)
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      state().cancelTransaction()
      state().setDragging(null)
      state().setRotating(null)
      dragState = null
      if (controls) controls.enabled = true
      document.body.style.cursor = "auto"
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("keydown", onKey)
      if (controls) controls.enabled = true
    }
  }, [active, commitTransaction, rotationStep, setDragging, setRotating, updateLive, cancelTransaction, controls])

  return null
}

export function FloorInteractions() {
  const level = usePlanner((state) => state.level)
  const tool = usePlanner((state) => state.tool)
  const select = usePlanner((state) => state.select)
  const addMeasurePoint = usePlanner((state) => state.addMeasurePoint)
  const exporting = usePlanner((state) => state.exporting)
  const elevation = getLevel(level).elevation
  const view = usePlanner((state) => state.view)

  if (exporting || view === "walk") return null
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[3.5, elevation + 0.004, 6.9]}
      renderOrder={-1}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (tool === "measure") {
          addMeasurePoint([event.point.x, -event.point.z])
        } else {
          select(null)
        }
      }}
    >
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

export function MeasureOverlay() {
  const points = usePlanner((state) => state.measurePoints)
  const tool = usePlanner((state) => state.tool)
  const exporting = usePlanner((state) => state.exporting)
  const level = usePlanner((state) => state.level)
  const elevation = getLevel(level).elevation
  if (tool !== "measure" || exporting || points.length === 0) return null
  const [a, b] = points
  const distance = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0
  const mid: [number, number, number] | null = a && b ? [(a[0] + b[0]) / 2, elevation + 0.05, -(a[1] + b[1]) / 2] : null
  return (
    <group>
      {a ? (
        <mesh position={[a[0], elevation + 0.02, -a[1]]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshBasicMaterial color="#d18b5a" />
        </mesh>
      ) : null}
      {b ? (
        <mesh position={[b[0], elevation + 0.02, -b[1]]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshBasicMaterial color="#d18b5a" />
        </mesh>
      ) : null}
      {a && b ? (
        <>
          <Line
            points={[
              [a[0], elevation + 0.03, -a[1]],
              [b[0], elevation + 0.03, -b[1]],
            ]}
            color="#d18b5a"
            lineWidth={2}
          />
          <Html position={mid ?? [0, 0, 0]} center style={{ pointerEvents: "none" }}>
            <div className="measure-label">{distance.toFixed(2).replace(".", ",")} m</div>
          </Html>
        </>
      ) : null}
    </group>
  )
}
