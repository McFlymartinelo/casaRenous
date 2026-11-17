import { Component, Suspense, useMemo, useRef, type ReactNode } from "react"
import { RoundedBox, useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { CatalogItem, FurnitureVariant, MaterialConfig } from "@/types"
import { usePlanner } from "@/store/planner"
import { SurfaceMaterial } from "../SurfaceMaterial"
import { variantPalette, type Palette } from "./palette"

type Vec3 = [number, number, number]

function safeRadius(radius: number, size: Vec3): number {
  return Math.max(0.001, Math.min(radius, Math.min(size[0], size[1], size[2]) / 2 - 0.001))
}

function RBox({
  size,
  position = [0, 0, 0],
  radius = 0.02,
  rotation,
  material,
  castShadow = true,
  receiveShadow = true,
}: {
  size: Vec3
  position?: Vec3
  radius?: number
  rotation?: Vec3
  material: MaterialConfig
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  return (
    <RoundedBox
      args={size}
      radius={safeRadius(radius, size)}
      smoothness={3}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <SurfaceMaterial material={material} />
    </RoundedBox>
  )
}

function Box({
  size,
  position = [0, 0, 0],
  rotation,
  material,
  castShadow = true,
  receiveShadow = true,
}: {
  size: Vec3
  position?: Vec3
  rotation?: Vec3
  material: MaterialConfig
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={size} />
      <SurfaceMaterial material={material} />
    </mesh>
  )
}

function Cyl({
  radiusTop,
  radiusBottom,
  height,
  position = [0, 0, 0],
  rotation,
  material,
  segments = 24,
  open = false,
  castShadow = true,
}: {
  radiusTop: number
  radiusBottom: number
  height: number
  position?: Vec3
  rotation?: Vec3
  material: MaterialConfig
  segments?: number
  open?: boolean
  castShadow?: boolean
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, segments, 1, open]} />
      <SurfaceMaterial material={material} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Portes, tiroirs et intérieurs de meubles
// ---------------------------------------------------------------------------

const DOOR_ANGLE = Math.PI * 0.6
const DOOR_GROOVE: MaterialConfig = { color: "#8f897e", roughness: 0.62, metalness: 0.04 }

function useDoorState(doorId: string) {
  const open = usePlanner((state) => Boolean(state.openDoors[doorId]))
  const tool = usePlanner((state) => state.tool)
  const toggleDoor = usePlanner((state) => state.toggleDoor)
  return { open, tool, toggleDoor }
}

interface HingedDoorProps {
  doorId: string
  side: 1 | -1
  direction?: 1 | -1
  width: number
  height: number
  thickness?: number
  position: Vec3
  material: MaterialConfig
  handle?: MaterialConfig | null
  groove?: "top" | "bottom" | null
  seams?: number[]
  openAngle?: number
}

/** Porte battante : l'origine du groupe est la charnière, en bas. */
function HingedDoor({
  doorId,
  side,
  direction = -1,
  width,
  height,
  thickness = 0.018,
  position,
  material,
  handle = null,
  groove = null,
  seams = [],
  openAngle = DOOR_ANGLE,
}: HingedDoorProps) {
  const { open, tool, toggleDoor } = useDoorState(doorId)
  const ref = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!ref.current) return
    const target = open ? side * -direction * openAngle : 0
    ref.current.rotation.y = THREE.MathUtils.damp(
      ref.current.rotation.y,
      target,
      9,
      Math.min(delta, 0.05),
    )
  })

  return (
    <group name={`door-${doorId}`} position={position}>
      <group ref={ref}>
        <group
          onPointerDown={(event) => {
            if (tool !== "doors") return
            event.stopPropagation()
            toggleDoor(doorId)
          }}
          onPointerOver={(event) => {
            if (tool !== "doors") return
            event.stopPropagation()
            document.body.style.cursor = "pointer"
          }}
          onPointerOut={() => {
            if (tool === "doors") document.body.style.cursor = "auto"
          }}
        >
          <RBox
            size={[width, height, thickness]}
            position={[side * width / 2, height / 2, 0]}
            radius={0.004}
            material={material}
          />
          {handle ? (
            <Cyl
              radiusTop={0.007}
              radiusBottom={0.007}
              height={Math.min(0.22, height * 0.3)}
              position={[
                side * (width - 0.065),
                height * 0.52,
                direction * (thickness / 2 + 0.018),
              ]}
              material={handle}
              segments={10}
            />
          ) : null}
          {groove ? (
            <Box
              size={[width - 0.018, 0.012, 0.004]}
              position={[
                side * width / 2,
                groove === "top" ? height - 0.035 : 0.035,
                direction * (thickness / 2 + 0.002),
              ]}
              material={DOOR_GROOVE}
              castShadow={false}
            />
          ) : null}
          {seams.map((seam, index) => (
            <Box
              key={`seam-${index}`}
              size={[width - 0.018, 0.008, 0.004]}
              position={[
                side * width / 2,
                seam,
                direction * (thickness / 2 + 0.002),
              ]}
              material={DOOR_GROOVE}
              castShadow={false}
            />
          ))}
        </group>
      </group>
    </group>
  )
}

interface SlidingDrawerProps {
  doorId: string
  width: number
  height: number
  depth: number
  position: Vec3
  direction?: 1 | -1
  material: MaterialConfig
  boxMaterial?: MaterialConfig
  handle?: MaterialConfig | null
  travel?: number
}

/** Tiroir coulissant ; `position` est le centre bas de la façade fermée. */
function SlidingDrawer({
  doorId,
  width,
  height,
  depth,
  position,
  direction = -1,
  material,
  boxMaterial,
  handle = null,
  travel = 0.26,
}: SlidingDrawerProps) {
  const { open, tool, toggleDoor } = useDoorState(doorId)
  const ref = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!ref.current) return
    const target = open ? direction * travel : 0
    ref.current.position.z = THREE.MathUtils.damp(
      ref.current.position.z,
      target,
      9,
      Math.min(delta, 0.05),
    )
  })

  return (
    <group position={position}>
      <group ref={ref}>
        <group
          onPointerDown={(event) => {
            if (tool !== "doors") return
            event.stopPropagation()
            toggleDoor(doorId)
          }}
          onPointerOver={(event) => {
            if (tool !== "doors") return
            event.stopPropagation()
            document.body.style.cursor = "pointer"
          }}
          onPointerOut={() => {
            if (tool === "doors") document.body.style.cursor = "auto"
          }}
        >
          <RBox
            size={[width, height, 0.016]}
            position={[0, height / 2, 0]}
            radius={0.003}
            material={material}
          />
          <Box
            size={[width - 0.025, 0.012, depth]}
            position={[0, 0.02, -direction * depth / 2]}
            material={boxMaterial ?? material}
          />
          <Box
            size={[0.012, height - 0.025, depth]}
            position={[-width / 2 + 0.01, height / 2, -direction * depth / 2]}
            material={boxMaterial ?? material}
          />
          <Box
            size={[0.012, height - 0.025, depth]}
            position={[width / 2 - 0.01, height / 2, -direction * depth / 2]}
            material={boxMaterial ?? material}
          />
          <Box
            size={[width - 0.025, height - 0.025, 0.012]}
            position={[0, height / 2, -direction * (depth - 0.006)]}
            material={boxMaterial ?? material}
          />
          {handle ? (
            <Box
              size={[Math.min(0.16, width * 0.35), 0.012, 0.012]}
              position={[0, height * 0.55, direction * 0.028]}
              material={handle}
            />
          ) : null}
        </group>
      </group>
    </group>
  )
}

interface CabinetShellProps {
  width: number
  height: number
  depth: number
  position?: Vec3
  material: MaterialConfig
  direction?: 1 | -1
  thickness?: number
}

/** Coffre ouvert côté façade : côtés, fond, dessus et dessous. */
function CabinetShell({
  width,
  height,
  depth,
  position = [0, 0, 0],
  material,
  direction = -1,
  thickness = 0.02,
}: CabinetShellProps) {
  return (
    <group position={position}>
      <Box
        size={[thickness, height, depth]}
        position={[-width / 2 + thickness / 2, height / 2, 0]}
        material={material}
      />
      <Box
        size={[thickness, height, depth]}
        position={[width / 2 - thickness / 2, height / 2, 0]}
        material={material}
      />
      <Box
        size={[width, thickness, depth]}
        position={[0, thickness / 2, 0]}
        material={material}
      />
      <Box
        size={[width, thickness, depth]}
        position={[0, height - thickness / 2, 0]}
        material={material}
      />
      <Box
        size={[width, height, thickness]}
        position={[0, height / 2, -direction * (depth / 2 - thickness / 2)]}
        material={material}
      />
    </group>
  )
}

function CabinetShelves({
  width,
  depth,
  heights,
  position = [0, 0, 0],
  material,
}: {
  width: number
  depth: number
  heights: number[]
  position?: Vec3
  material: MaterialConfig
}) {
  return (
    <group position={position}>
      {heights.map((height, index) => (
        <Box
          key={index}
          size={[width - 0.05, 0.018, depth - 0.06]}
          position={[0, height, 0]}
          material={material}
        />
      ))}
    </group>
  )
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function seeded(seed: number): () => number {
  let value = seed
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Salon
// ---------------------------------------------------------------------------

function Sofa({
  item,
  palette,
  corner = false,
}: {
  item: CatalogItem
  palette: Palette
  corner?: boolean
}) {
  const { w, d, h } = item
  const backHeight = h - 0.24
  const seatY = 0.4
  const legs: Vec3[] = [
    [-w / 2 + 0.09, 0.08, d / 2 - 0.09],
    [w / 2 - 0.09, 0.08, d / 2 - 0.09],
    [-w / 2 + 0.09, 0.08, -d / 2 + 0.09],
    [w / 2 - 0.09, 0.08, -d / 2 + 0.09],
  ]

  if (corner) {
    const chaiseW = Math.min(0.95, w * 0.38)
    const backDepth = d * 0.56
    const backZ = d / 2 - backDepth / 2
    const chaiseZ = -d / 2 + (d - backDepth) / 2
    const chaiseX = -w / 2 + chaiseW / 2
    return (
      <group>
        {legs.map((position, index) => (
          <Cyl
            key={index}
            radiusTop={0.021}
            radiusBottom={0.026}
            height={0.13}
            position={[position[0], 0.065, position[2]]}
            material={palette.woodDark}
          />
        ))}
        <RBox size={[w, 0.2, backDepth]} position={[0, 0.2, backZ]} radius={0.05} material={palette.fabric} />
        <RBox
          size={[chaiseW, 0.2, d - backDepth - 0.02]}
          position={[chaiseX, 0.2, chaiseZ]}
          radius={0.05}
          material={palette.fabric}
        />
        <RBox size={[w, backHeight, 0.18]} position={[0, backHeight / 2 + 0.09, d / 2 - 0.09]} radius={0.05} material={palette.fabric} />
        <RBox
          size={[0.18, backHeight, d - backDepth * 0.4]}
          position={[-w / 2 + 0.09, backHeight / 2 + 0.09, -d / 2 + (d - backDepth * 0.4) / 2]}
          radius={0.05}
          material={palette.fabric}
        />
        <RBox size={[0.17, 0.34, backDepth]} position={[w / 2 - 0.085, 0.39, backZ]} radius={0.07} material={palette.fabric} />
        {[0, 1].map((index) => (
          <RBox
            key={`seat-${index}`}
            size={[(w - 0.34) / 2 - 0.02, 0.15, backDepth - 0.18]}
            position={[-w / 2 + 0.17 + ((w - 0.34) / 2) * (index + 0.5), seatY, backZ - 0.03]}
            radius={0.06}
            material={palette.fabricSecondary}
          />
        ))}
        <RBox
          size={[chaiseW - 0.1, 0.15, d - backDepth - 0.1]}
          position={[chaiseX, seatY, chaiseZ - 0.02]}
          radius={0.06}
          material={palette.fabricSecondary}
        />
        {[0, 1].map((index) => (
          <RBox
            key={`back-${index}`}
            size={[(w - 0.4) / 2 - 0.03, backHeight - 0.25, 0.13]}
            position={[-w / 2 + 0.2 + ((w - 0.4) / 2) * (index + 0.5), seatY + (backHeight - 0.2) / 2, d / 2 - 0.25]}
            radius={0.06}
            material={palette.fabricSecondary}
            rotation={[-0.08, 0, 0]}
          />
        ))}
        <RBox
          size={[0.4, 0.38, 0.13]}
          position={[-w / 2 + 0.48, seatY + 0.22, d / 2 - 0.4]}
          radius={0.09}
          material={palette.fabricLight}
          rotation={[-0.22, 0.22, 0.18]}
        />
        <RBox
          size={[0.38, 0.34, 0.12]}
          position={[-w / 2 + 0.2, seatY + 0.2, -d / 2 + 0.48]}
          radius={0.08}
          material={palette.fabric}
          rotation={[-0.1, -0.3, -0.2]}
        />
      </group>
    )
  }

  const cushions = w >= 2 ? 3 : w >= 1.2 ? 2 : 1
  const cushionWidth = (w - 0.28) / cushions

  return (
    <group>
      {legs.map((position, index) => (
        <Cyl
          key={index}
          radiusTop={0.021}
          radiusBottom={0.026}
          height={0.13}
          position={[position[0], 0.065, position[2]]}
          material={palette.woodDark}
        />
      ))}
      <RBox size={[w, 0.22, d]} position={[0, 0.2, 0]} radius={0.05} material={palette.fabric} />
      <RBox size={[w, backHeight, 0.18]} position={[0, backHeight / 2 + 0.09, d / 2 - 0.09]} radius={0.055} material={palette.fabric} />
      <RBox size={[0.15, 0.34, d]} position={[-w / 2 + 0.075, 0.4, 0]} radius={0.06} material={palette.fabric} />
      <RBox size={[0.15, 0.34, d]} position={[w / 2 - 0.075, 0.4, 0]} radius={0.06} material={palette.fabric} />
      {Array.from({ length: cushions }).map((_, index) => (
        <RBox
          key={`seat-${index}`}
          size={[cushionWidth - 0.025, 0.15, d - 0.22]}
          position={[-w / 2 + 0.14 + cushionWidth * (index + 0.5), seatY, -0.035]}
          radius={0.06}
          material={palette.fabricSecondary}
        />
      ))}
      {Array.from({ length: cushions }).map((_, index) => (
        <RBox
          key={`back-${index}`}
          size={[cushionWidth - 0.04, backHeight - 0.26, 0.13]}
          position={[-w / 2 + 0.14 + cushionWidth * (index + 0.5), seatY + (backHeight - 0.2) / 2, d / 2 - 0.24]}
          radius={0.06}
          material={palette.fabricSecondary}
          rotation={[-0.08, 0, 0]}
        />
      ))}
      <RBox
        size={[0.4, 0.38, 0.13]}
        position={[-w / 2 + 0.43, seatY + 0.22, d / 2 - 0.38]}
        radius={0.09}
        material={palette.fabricLight}
        rotation={[-0.22, 0.22, 0.16]}
      />
      <RBox
        size={[0.36, 0.34, 0.12]}
        position={[w / 2 - 0.42, seatY + 0.2, d / 2 - 0.4]}
        radius={0.08}
        material={palette.fabric}
        rotation={[-0.18, -0.18, -0.14]}
      />
    </group>
  )
}

function Pouf({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const radius = item.w / 2
  return (
    <group>
      <Cyl radiusTop={radius * 0.92} radiusBottom={radius} height={item.h - 0.06} position={[0, (item.h - 0.06) / 2 + 0.03, 0]} material={palette.fabric} segments={36} />
      <Cyl radiusTop={radius * 0.94} radiusBottom={radius * 0.94} height={0.07} position={[0, item.h - 0.035, 0]} material={palette.fabricSecondary} segments={36} />
      <mesh position={[0, item.h - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.93, 0.008, 8, 40]} />
        <SurfaceMaterial material={palette.fabric} />
      </mesh>
      {[0, 1, 2, 3].map((index) => (
        <Cyl
          key={index}
          radiusTop={0.018}
          radiusBottom={0.022}
          height={0.05}
          position={[Math.cos((index * Math.PI) / 2 + Math.PI / 4) * radius * 0.7, 0.025, Math.sin((index * Math.PI) / 2 + Math.PI / 4) * radius * 0.7]}
          material={palette.woodDark}
        />
      ))}
    </group>
  )
}

function CoffeeTable({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, 0.055, d]} position={[0, h - 0.03, 0]} radius={0.025} material={palette.wood} />
      <RBox size={[w - 0.16, 0.03, d - 0.16]} position={[0, 0.14, 0]} radius={0.012} material={palette.woodDark} />
      {[
        [-w / 2 + 0.09, -d / 2 + 0.09],
        [w / 2 - 0.09, -d / 2 + 0.09],
        [-w / 2 + 0.09, d / 2 - 0.09],
        [w / 2 - 0.09, d / 2 - 0.09],
      ].map(([x, z], index) => (
        <Cyl key={index} radiusTop={0.024} radiusBottom={0.018} height={h - 0.06} position={[x!, (h - 0.06) / 2, z!]} material={palette.woodDark} />
      ))}
      <RBox size={[0.3, 0.035, 0.22]} position={[0.18, h + 0.015, 0.02]} radius={0.008} material={palette.fabricLight} rotation={[0, 0.2, 0]} />
      <Cyl radiusTop={0.05} radiusBottom={0.07} height={0.14} position={[-0.26, h + 0.09, -0.03]} material={palette.ceramic} />
    </group>
  )
}

function RoundTable({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const radius = item.w / 2
  return (
    <group>
      <Cyl radiusTop={radius} radiusBottom={radius} height={0.045} position={[0, item.h - 0.025, 0]} material={palette.wood} segments={40} />
      <Cyl radiusTop={radius * 0.14} radiusBottom={radius * 0.22} height={item.h - 0.05} position={[0, (item.h - 0.05) / 2, 0]} material={palette.woodDark} />
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[radius * 0.45, radius * 0.52, 0.05, 32]} />
        <SurfaceMaterial material={palette.metal} />
      </mesh>
      <RBox size={[0.28, 0.04, 0.2]} position={[0.04, item.h + 0.02, 0]} radius={0.008} material={palette.fabricLight} rotation={[0, 0.25, 0]} />
    </group>
  )
}

function TvUnit({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const doors = w > 1.5 ? 3 : 2
  const doorWidth = (w - 0.06) / doors
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.1}
        depth={d}
        position={[0, 0.08, 0]}
        material={palette.wood}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[(h - 0.1) * 0.52]}
        position={[0, 0.08, 0]}
        material={palette.woodDark}
      />
      <RBox size={[w + 0.02, 0.03, d + 0.01]} position={[0, h - 0.015, 0]} radius={0.01} material={palette.woodDark} />
      {Array.from({ length: doors }).map((_, index) => (
        <HingedDoor
          key={index}
          doorId={`${seed}:tv${index}`}
          side={1}
          width={doorWidth - 0.018}
          height={h - 0.1}
          position={[-w / 2 + 0.03 + doorWidth * index, 0.08, -d / 2 - 0.012]}
          material={palette.wood}
          handle={palette.metal}
        />
      ))}
      {[
        [-w / 2 + 0.07, -d / 2 + 0.06],
        [w / 2 - 0.07, -d / 2 + 0.06],
        [-w / 2 + 0.07, d / 2 - 0.06],
        [w / 2 - 0.07, d / 2 - 0.06],
      ].map(([x, z], index) => (
        <Cyl key={index} radiusTop={0.018} radiusBottom={0.014} height={0.08} position={[x!, 0.04, z!]} material={palette.metal} />
      ))}
    </group>
  )
}

function Tv({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  return (
    <group>
      <RBox size={[w, h, 0.045]} position={[0, h / 2, 0]} radius={0.008} material={palette.black} />
      <Box size={[w - 0.035, h - 0.035, 0.006]} position={[0, h / 2, -0.027]} material={palette.screen} />
      <Box size={[w - 0.08, h - 0.08, 0.004]} position={[0, h / 2 + 0.01, -0.031]} material={{ color: "#1c2a31", roughness: 0.18, metalness: 0.15 }} />
      <Cyl radiusTop={0.028} radiusBottom={0.036} height={0.11} position={[0, -0.055, 0]} material={palette.metal} />
      <RBox size={[0.34, 0.02, 0.2]} position={[0, -0.115, 0.02]} radius={0.008} material={palette.metal} />
    </group>
  )
}

function Rug({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d } = item
  return (
    <group>
      <RBox size={[w, 0.014, d]} position={[0, 0.007, 0]} radius={0.005} material={palette.fabric} castShadow={false} />
      <Box size={[w - 0.12, 0.002, 0.03]} position={[0, 0.016, d / 2 - 0.1]} material={palette.fabricSecondary} castShadow={false} />
      <Box size={[w - 0.12, 0.002, 0.03]} position={[0, 0.016, -d / 2 + 0.1]} material={palette.fabricSecondary} castShadow={false} />
      <Box size={[0.03, 0.002, d - 0.12]} position={[w / 2 - 0.1, 0.016, 0]} material={palette.fabricSecondary} castShadow={false} />
      <Box size={[0.03, 0.002, d - 0.12]} position={[-w / 2 + 0.1, 0.016, 0]} material={palette.fabricSecondary} castShadow={false} />
      {Array.from({ length: 18 }).map((_, index) => (
        <Box
          key={index}
          size={[0.008, 0.002, 0.06]}
          position={[-w / 2 + 0.08 + index * ((w - 0.16) / 17), 0.016, d / 2 + 0.025]}
          material={palette.fabricSecondary}
          castShadow={false}
        />
      ))}
      {[0.24, 0, -0.24].map((ratio) => (
        <Box
          key={ratio}
          size={[w - 0.3, 0.002, 0.028]}
          position={[0, 0.017, d * ratio]}
          material={palette.fabricSecondary}
          castShadow={false}
        />
      ))}
    </group>
  )
}

function Plant({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const potHeight = item.h * 0.2
  const potRadius = Math.min(item.w * 0.22, 0.2)
  const leaves = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, index) => {
        const angle = index * 2.399
        const height = potHeight + 0.15 + (index / 26) * item.h * 0.62
        const radius = 0.14 + ((index * 37) % 10) / 100
        return {
          position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius] as Vec3,
          rotation: [0.8 + (index % 3) * 0.18, -angle, 0.4] as Vec3,
          scale: [0.13 + (index % 4) * 0.012, 0.012, 0.055 + (index % 3) * 0.008] as Vec3,
        }
      }),
    [item.h, potHeight],
  )
  return (
    <group>
      <Cyl radiusTop={potRadius} radiusBottom={potRadius * 0.72} height={potHeight} position={[0, potHeight / 2, 0]} material={palette.ceramic} segments={32} />
      <Cyl radiusTop={potRadius * 1.04} radiusBottom={potRadius * 1.04} height={0.035} position={[0, potHeight - 0.018, 0]} material={palette.ceramicSecondary} segments={32} />
      <Cyl radiusTop={potRadius * 0.9} radiusBottom={potRadius * 0.9} height={0.012} position={[0, potHeight - 0.035, 0]} material={{ color: "#3a2d22", roughness: 1, metalness: 0 }} segments={24} />
      <Cyl radiusTop={0.022} radiusBottom={0.035} height={item.h * 0.56} position={[0.015, potHeight + item.h * 0.28, 0]} material={palette.woodDark} />
      <Cyl radiusTop={0.009} radiusBottom={0.014} height={item.h * 0.3} position={[-0.06, potHeight + item.h * 0.46, 0.02]} rotation={[0, 0, 0.34]} material={palette.woodDark} />
      <Cyl radiusTop={0.008} radiusBottom={0.012} height={item.h * 0.26} position={[0.07, potHeight + item.h * 0.5, -0.03]} rotation={[0.2, 0, -0.28]} material={palette.woodDark} />
      {leaves.map((leaf, index) => (
        <mesh key={index} position={leaf.position} rotation={leaf.rotation} scale={leaf.scale} castShadow>
          <sphereGeometry args={[1, 8, 6]} />
          <SurfaceMaterial material={index % 3 === 0 ? palette.fabricSecondary : palette.fabric} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((index) => {
        const angle = index * 1.7
        return (
          <mesh
            key={`cluster-${index}`}
            position={[Math.cos(angle) * 0.12, potHeight + item.h * (0.52 + index * 0.1), Math.sin(angle) * 0.12]}
            scale={[0.18, 0.14, 0.18]}
            castShadow
          >
            <icosahedronGeometry args={[1, 1]} />
            <SurfaceMaterial material={index % 2 ? palette.fabric : palette.fabricSecondary} />
          </mesh>
        )
      })}
    </group>
  )
}

function FloorLamp({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const hour = usePlanner((state) => state.ambience.hour)
  const night = hour < 7 || hour > 19
  const shadeMaterial = useMemo<MaterialConfig>(
    () => ({
      ...{ color: "#eee2cb", roughness: 0.9, metalness: 0, texture: "fabric", textureScale: 0.45, sheen: 0.2 },
      emissive: "#ffd39a",
      emissiveIntensity: night ? 0.8 : 0.12,
    }),
    [night],
  )
  return (
    <group>
      <Cyl radiusTop={0.16} radiusBottom={0.18} height={0.025} position={[0, 0.013, 0]} material={palette.metal} segments={32} />
      <Cyl radiusTop={0.014} radiusBottom={0.014} height={item.h - 0.36} position={[0, (item.h - 0.36) / 2 + 0.03, 0]} material={palette.metal} />
      <Cyl radiusTop={0.19} radiusBottom={0.27} height={0.3} position={[0, item.h - 0.16, 0]} material={shadeMaterial} segments={32} open />
      <mesh position={[0, item.h - 0.18, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshBasicMaterial color={night ? "#ffd8a4" : "#f5efe3"} />
      </mesh>
      {night ? <pointLight position={[0, item.h - 0.18, 0]} intensity={3.2} distance={4.5} decay={2} color="#ffc98e" castShadow={false} /> : null}
    </group>
  )
}

function Shelf({ item, palette, seed }: { item: CatalogItem; palette: Palette; seed: string }) {
  const { w, d, h } = item
  const shelves = Math.max(3, Math.round(h / 0.42))
  const random = useMemo(() => seeded(hash(seed)), [seed])
  const books = useMemo(() => {
    const result: { position: Vec3; size: Vec3; color: string; rotation: number }[] = []
    const colors = ["#8c5b46", "#435b52", "#b09a72", "#35424a", "#a46f53", "#6f7f59", "#d0c2a8", "#2f3330"]
    for (let shelf = 1; shelf < shelves; shelf += 1) {
      const y = 0.12 + (shelf * (h - 0.2)) / shelves
      let x = -w / 2 + 0.1
      while (x < w / 2 - 0.12) {
        const width = 0.03 + random() * 0.035
        const height = 0.18 + random() * 0.1
        result.push({
          position: [x + width / 2, y + height / 2, -0.01 + random() * 0.02],
          size: [width, height, 0.17 + random() * 0.05],
          color: colors[Math.floor(random() * colors.length)] ?? "#8c5b46",
          rotation: random() > 0.88 ? 0.08 : 0,
        })
        x += width + 0.006
        if (random() > 0.92) x += 0.08
      }
    }
    return result
  }, [h, random, shelves, w])

  return (
    <group>
      <Box size={[0.03, h, d]} position={[-w / 2 + 0.015, h / 2, 0]} material={palette.wood} />
      <Box size={[0.03, h, d]} position={[w / 2 - 0.015, h / 2, 0]} material={palette.wood} />
      <Box size={[w, 0.03, d]} position={[0, h - 0.015, 0]} material={palette.wood} />
      <Box size={[w, 0.03, d]} position={[0, 0.015, 0]} material={palette.wood} />
      <Box size={[w - 0.06, h - 0.06, 0.018]} position={[0, h / 2, d / 2 - 0.01]} material={palette.woodDark} />
      {Array.from({ length: shelves - 1 }).map((_, index) => (
        <Box
          key={index}
          size={[w - 0.06, 0.026, d - 0.02]}
          position={[0, 0.12 + ((index + 1) * (h - 0.2)) / shelves, 0]}
          material={palette.wood}
        />
      ))}
      {books.map((book, index) => (
        <mesh key={index} position={book.position} rotation={[0, book.rotation, 0]} castShadow>
          <boxGeometry args={book.size} />
          <meshStandardMaterial color={book.color} roughness={0.8} metalness={0} />
        </mesh>
      ))}
      <RBox size={[0.24, 0.2, 0.22]} position={[w / 2 - 0.24, 0.22, 0]} radius={0.03} material={palette.ceramic} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Cuisine
// ---------------------------------------------------------------------------

function KitchenIsland({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const doors = Math.max(2, Math.round(w / 0.6))
  const doorWidth = (w - 0.06) / doors
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.06}
        depth={d}
        position={[0, 0.04, 0]}
        material={palette.paint}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[(h - 0.06) * 0.48]}
        position={[0, 0.04, 0]}
        material={palette.wood}
      />
      <RBox size={[w + 0.06, 0.045, d + 0.06]} position={[0, h - 0.022, 0]} radius={0.015} material={palette.stone} />
      {Array.from({ length: doors }).map((_, index) => (
        <HingedDoor
          key={index}
          doorId={`${seed}:island${index}`}
          side={1}
          width={doorWidth - 0.02}
          height={h - 0.06}
          position={[-w / 2 + 0.03 + doorWidth * index, 0.04, -d / 2 - 0.012]}
          material={palette.paintSecondary}
          handle={palette.metal}
        />
      ))}
      <RBox size={[0.46, 0.018, 0.35]} position={[0.18, h + 0.008, 0.02]} radius={0.006} material={palette.metal} />
      <Cyl radiusTop={0.024} radiusBottom={0.024} height={0.3} position={[0.18, h + 0.16, 0.14]} material={palette.metal} />
      <Cyl radiusTop={0.012} radiusBottom={0.012} height={0.2} position={[0.18, h + 0.3, 0.21]} rotation={[Math.PI / 2, 0, 0]} material={palette.metal} />
      <Cyl radiusTop={0.05} radiusBottom={0.07} height={0.12} position={[-0.38, h + 0.07, 0.02]} material={palette.ceramic} />
    </group>
  )
}

function Counter({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const doors = Math.max(3, Math.round(w / 0.6))
  const doorWidth = (w - 0.04) / doors
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.08}
        depth={d}
        position={[0, 0.04, 0]}
        material={palette.paint}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[(h - 0.08) * 0.46]}
        position={[0, 0.04, 0]}
        material={palette.wood}
      />
      <RBox size={[w + 0.02, 0.04, d + 0.03]} position={[0, h - 0.02, 0]} radius={0.01} material={palette.stone} />
      <Box size={[w, 0.5, 0.025]} position={[0, h + 0.25, d / 2 - 0.012]} material={palette.paintSecondary} />
      {Array.from({ length: doors }).map((_, index) => (
        <HingedDoor
          key={index}
          doorId={`${seed}:counter${index}`}
          side={1}
          width={doorWidth - 0.016}
          height={h - 0.08}
          position={[-w / 2 + 0.02 + doorWidth * index, 0.04, -d / 2 - 0.012]}
          material={palette.paintSecondary}
          handle={palette.metal}
        />
      ))}
      <mesh position={[-w / 2 + 0.38, h + 0.006, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.3]} />
        <meshStandardMaterial color="#222421" roughness={0.25} metalness={0.5} />
      </mesh>
      {[
        [-0.09, -0.004],
        [0.09, -0.004],
        [-0.09, 0.075],
        [0.09, 0.075],
      ].map(([x, z], index) => (
        <Cyl
          key={index}
          radiusTop={0.055}
          radiusBottom={0.055}
          height={0.005}
          position={[-w / 2 + 0.38 + x!, h + 0.009, -0.02 + z!]}
          material={palette.metalDark}
          segments={24}
        />
      ))}
      <RBox size={[0.34, 0.008, 0.28]} position={[w / 2 - 0.42, h + 0.007, -0.02]} radius={0.004} material={palette.metalDark} />
      <Cyl radiusTop={0.02} radiusBottom={0.024} height={0.34} position={[w / 2 - 0.42, h + 0.17, 0.18]} material={palette.metal} />
      <Cyl radiusTop={0.01} radiusBottom={0.01} height={0.2} position={[w / 2 - 0.42, h + 0.33, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={palette.metal} />
    </group>
  )
}

function Fridge({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const doorWidth = w / 2 - 0.008
  const doorHeight = h - 0.06
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.06}
        depth={d}
        position={[0, 0.04, 0]}
        material={palette.metal}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[(h - 0.06) * 0.4, (h - 0.06) * 0.72]}
        position={[0, 0.04, 0]}
        material={palette.white}
      />
      <HingedDoor
        doorId={`${seed}:fridge-left`}
        side={1}
        width={doorWidth}
        height={doorHeight}
        position={[-w / 2, 0.04, -d / 2 - 0.012]}
        material={palette.metal}
        handle={palette.metalDark}
      />
      <HingedDoor
        doorId={`${seed}:fridge-right`}
        side={-1}
        width={doorWidth}
        height={doorHeight}
        position={[w / 2, 0.04, -d / 2 - 0.012]}
        material={palette.metal}
        handle={palette.metalDark}
      />
      {[
        [-w / 2 + 0.08, -d / 2 + 0.08],
        [w / 2 - 0.08, -d / 2 + 0.08],
        [-w / 2 + 0.08, d / 2 - 0.08],
        [w / 2 - 0.08, d / 2 - 0.08],
      ].map(([x, z], index) => (
        <Cyl key={index} radiusTop={0.018} radiusBottom={0.022} height={0.04} position={[x!, 0.02, z!]} material={palette.metalDark} />
      ))}
    </group>
  )
}

function Hood({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, 0.1, d]} position={[0, 0.05, 0]} radius={0.015} material={palette.metal} />
      <RBox size={[w * 0.36, h - 0.1, d * 0.5]} position={[0, 0.1 + (h - 0.1) / 2, d * 0.12]} radius={0.01} material={palette.metal} />
      <Box size={[w * 0.32, 0.01, d * 0.42]} position={[0, 0.006, 0]} material={palette.metalDark} />
    </group>
  )
}

function DiningTable({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, 0.06, d]} position={[0, h - 0.03, 0]} radius={0.018} material={palette.wood} />
      <Box size={[w - 0.16, 0.1, d - 0.16]} position={[0, h - 0.11, 0]} material={palette.woodDark} />
      {[
        [-w / 2 + 0.12, -d / 2 + 0.12],
        [w / 2 - 0.12, -d / 2 + 0.12],
        [-w / 2 + 0.12, d / 2 - 0.12],
        [w / 2 - 0.12, d / 2 - 0.12],
      ].map(([x, z], index) => (
        <mesh key={index} position={[x!, (h - 0.06) / 2, z!]} castShadow receiveShadow>
          <cylinderGeometry args={[0.041, 0.028, h - 0.06, 12]} />
          <SurfaceMaterial material={palette.wood} />
        </mesh>
      ))}
      <RBox size={[0.9, 0.004, 0.32]} position={[0, h + 0.002, 0]} radius={0.002} material={palette.fabricSecondary} castShadow={false} />
      <Cyl radiusTop={0.04} radiusBottom={0.055} height={0.15} position={[0, h + 0.085, 0]} material={palette.ceramic} />
    </group>
  )
}

function DiningChair({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const seatY = h * 0.54
  return (
    <group>
      {[
        [-w / 2 + 0.05, -d / 2 + 0.05],
        [w / 2 - 0.05, -d / 2 + 0.05],
        [-w / 2 + 0.05, d / 2 - 0.05],
        [w / 2 - 0.05, d / 2 - 0.05],
      ].map(([x, z], index) => (
        <mesh key={index} position={[x!, seatY / 2, z!]} castShadow receiveShadow>
          <cylinderGeometry args={[0.021, 0.016, seatY, 10]} />
          <SurfaceMaterial material={palette.wood} />
        </mesh>
      ))}
      <RBox size={[w - 0.04, 0.055, d - 0.04]} position={[0, seatY, 0]} radius={0.012} material={palette.wood} />
      <RBox size={[w - 0.08, 0.035, d - 0.1]} position={[0, seatY + 0.045, -0.01]} radius={0.01} material={palette.fabricSecondary} />
      <RBox
        size={[w - 0.05, h - seatY - 0.12, 0.045]}
        position={[0, seatY + (h - seatY) / 2 - 0.02, d / 2 - 0.035]}
        radius={0.02}
        material={palette.wood}
        rotation={[-0.08, 0, 0]}
      />
      <RBox
        size={[w - 0.12, h - seatY - 0.2, 0.028]}
        position={[0, seatY + (h - seatY) / 2 - 0.01, d / 2 - 0.065]}
        radius={0.012}
        material={palette.fabricSecondary}
        rotation={[-0.08, 0, 0]}
      />
    </group>
  )
}

function Pendant({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const radius = item.w / 2
  return (
    <group>
      <Cyl radiusTop={0.008} radiusBottom={0.008} height={1.05} position={[0, item.h / 2 + 0.5, 0]} material={palette.black} />
      <mesh position={[0, item.h / 2, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[radius, item.h * 0.55, 36, 1, true]} />
        <SurfaceMaterial material={palette.metal} />
      </mesh>
      <mesh position={[0, item.h * 0.24, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshBasicMaterial color="#ffe0ac" />
      </mesh>
      <pointLight position={[0, item.h * 0.2, 0]} intensity={2.4} distance={4} decay={2} color="#ffce90" />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Cuisine — modèle photo (colonnes, îlot, marbre, appareils)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Nouveaux modèles paramétriques (extension du catalogue)
// ---------------------------------------------------------------------------

function ConsoleTable({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const topT = 0.045
  const apron = 0.14
  const legH = h - topT - apron
  const legs: [number, number][] = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ]
  return (
    <group>
      <RBox size={[w, topT, d]} position={[0, h - topT / 2, 0]} radius={0.012} material={palette.wood} />
      <Box size={[w - 0.1, apron, 0.02]} position={[0, h - topT - apron / 2, d / 2 - 0.02]} material={palette.lacquer} />
      <Box size={[0.12, 0.016, 0.022]} position={[0, h - topT - apron / 2, d / 2 - 0.005]} material={palette.brass} />
      {legs.map(([sx, sz], index) => (
        <Box
          key={index}
          size={[0.05, legH, 0.05]}
          position={[sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05)]}
          material={palette.woodDark}
        />
      ))}
    </group>
  )
}

function SideTable({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const r = Math.min(item.w, item.d) / 2
  const topT = 0.035
  return (
    <group>
      <Cyl radiusTop={r} radiusBottom={r} height={topT} position={[0, item.h - topT / 2, 0]} material={palette.wood} segments={32} />
      <Cyl radiusTop={0.025} radiusBottom={0.035} height={item.h - topT} position={[0, (item.h - topT) / 2, 0]} material={palette.metalDark} segments={20} />
      <Cyl radiusTop={r * 0.62} radiusBottom={r * 0.66} height={0.02} position={[0, 0.01, 0]} material={palette.metalDark} segments={24} />
    </group>
  )
}

function Dishwasher({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.01} material={palette.whiteMetal} />
      <Box size={[w - 0.03, h - 0.05, 0.012]} position={[0, h / 2, d / 2 + 0.002]} material={palette.lacquer} />
      <Box size={[w - 0.08, 0.026, 0.03]} position={[0, h - 0.16, d / 2 + 0.02]} material={palette.metal} />
      <Box size={[w - 0.03, 0.03, 0.012]} position={[0, 0.045, d / 2 + 0.004]} material={palette.metalDark} />
      <Box size={[0.05, 0.01, 0.01]} position={[w / 2 - 0.12, 0.045, d / 2 + 0.014]} material={palette.brass} />
    </group>
  )
}

function Microwave({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.012} material={palette.metalDark} />
      <Box size={[w * 0.6, h * 0.62, 0.008]} position={[-w * 0.12, h / 2, d / 2 + 0.003]} material={palette.glassSmoked} />
      <Box size={[w * 0.24, h * 0.52, 0.008]} position={[w * 0.34, h / 2, d / 2 + 0.003]} material={palette.black} />
      {[0.3, 0.5, 0.7].map((ratio) => (
        <Cyl
          key={ratio}
          radiusTop={0.012}
          radiusBottom={0.012}
          height={0.012}
          position={[w * 0.34, h * ratio, d / 2 + 0.012]}
          rotation={[Math.PI / 2, 0, 0]}
          material={palette.metal}
          segments={14}
        />
      ))}
    </group>
  )
}

function KitchenBin({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { d, h } = item
  const radius = Math.min(item.w, d) / 2
  return (
    <group>
      <Cyl radiusTop={radius} radiusBottom={radius * 0.86} height={h - 0.06} position={[0, (h - 0.06) / 2 + 0.04, 0]} material={palette.metal} segments={32} />
      <Cyl radiusTop={radius * 1.05} radiusBottom={radius * 1.05} height={0.05} position={[0, h - 0.03, 0]} material={palette.metalDark} segments={32} />
      <Box size={[0.16, 0.022, 0.04]} position={[0, 0.02, d / 2 - 0.03]} material={palette.metal} />
    </group>
  )
}

function Crib({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const rail = 0.04
  const baseY = 0.26
  const top = h - 0.04
  const posts: [number, number][] = [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ]
  return (
    <group>
      <Box size={[w, 0.05, d]} position={[0, baseY, 0]} material={palette.whiteMatte} />
      <RBox size={[w * 0.88, 0.08, d * 0.86]} position={[0, baseY + 0.07, 0]} radius={0.03} material={palette.fabric} />
      {posts.map(([sx, sz], index) => (
        <Box key={index} size={[rail, top, rail]} position={[sx * (w / 2 - rail / 2), top / 2, sz * (d / 2 - rail / 2)]} material={palette.wood} />
      ))}
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[rail, 0.5, d]} position={[sx * (w / 2 - rail / 2), top - 0.25, 0]} material={palette.wood} />
      ))}
      {Array.from({ length: 9 }, (_, index) => (
        <Box
          key={index}
          size={[0.018, 0.5, 0.018]}
          position={[-w / 2 + 0.07 + (index * (w - 0.14)) / 8, top - 0.25, d / 2 - rail / 2]}
          material={palette.whiteMetal}
        />
      ))}
    </group>
  )
}

function ChestOfDrawers({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const rows = 4
  const gap = 0.012
  const drawerH = (h - 0.1 - (rows - 1) * gap) / rows
  return (
    <group>
      <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.012} material={palette.wood} />
      {Array.from({ length: rows }, (_, index) => {
        const y = 0.06 + drawerH / 2 + index * (drawerH + gap)
        return (
          <group key={index}>
            <Box size={[w - 0.04, drawerH - 0.012, 0.018]} position={[0, y, d / 2 + 0.004]} material={palette.lacquer} />
            <Box size={[0.14, 0.016, 0.024]} position={[0, y, d / 2 + 0.022]} material={palette.brass} />
          </group>
        )
      })}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}-${sz}`} size={[0.04, 0.06, 0.04]} position={[sx * (w / 2 - 0.06), 0.03, sz * (d / 2 - 0.06)]} material={palette.woodDark} />
        )),
      )}
    </group>
  )
}

function ChangingTable({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const topT = 0.055
  const legH = h - topT
  return (
    <group>
      <RBox size={[w, topT, d]} position={[0, h - topT / 2, 0]} radius={0.022} material={palette.fabric} />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}-${sz}`} size={[0.045, legH, 0.045]} position={[sx * (w / 2 - 0.045), legH / 2, sz * (d / 2 - 0.045)]} material={palette.wood} />
        )),
      )}
      <Box size={[w - 0.12, 0.14, 0.02]} position={[0, legH - 0.13, d / 2 - 0.02]} material={palette.lacquer} />
      <Box size={[0.1, 0.016, 0.022]} position={[0, legH - 0.13, d / 2 - 0.005]} material={palette.brass} />
      <Box size={[w - 0.18, 0.18, d - 0.18]} position={[0, 0.18, 0]} material={palette.fabricSecondary} />
    </group>
  )
}

function FilingCabinet({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const rows = 3
  const drawerH = h / rows
  return (
    <group>
      <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.01} material={palette.metalDark} />
      {Array.from({ length: rows }, (_, index) => {
        const y = drawerH / 2 + index * drawerH
        return (
          <group key={index}>
            <Box size={[w - 0.03, drawerH - 0.014, 0.015]} position={[0, y, d / 2 + 0.003]} material={palette.metal} />
            <Box size={[w * 0.36, 0.05, 0.006]} position={[0, y + drawerH * 0.2, d / 2 + 0.013]} material={palette.whiteMatte} />
            <Box size={[0.12, 0.018, 0.02]} position={[0, y - drawerH * 0.2, d / 2 + 0.014]} material={palette.brass} />
          </group>
        )
      })}
    </group>
  )
}

function DeskLamp({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const h = item.h
  return (
    <group>
      <Cyl radiusTop={0.085} radiusBottom={0.095} height={0.025} position={[0, 0.013, 0]} material={palette.metalDark} segments={28} />
      <Cyl radiusTop={0.014} radiusBottom={0.018} height={h * 0.7} position={[0, h * 0.35, 0]} material={palette.metal} />
      <Cyl radiusTop={0.018} radiusBottom={0.018} height={h * 0.26} position={[h * 0.085, h * 0.85, 0]} rotation={[0, 0, -0.9]} material={palette.metal} />
      <mesh position={[h * 0.2, h * 0.97, 0]} castShadow>
        <coneGeometry args={[0.11, 0.15, 24, 1, true]} />
        <SurfaceMaterial material={palette.lacquer} />
      </mesh>
      <Cyl radiusTop={0.055} radiusBottom={0.055} height={0.008} position={[h * 0.2, h * 0.9, 0]} material={palette.whiteMatte} />
    </group>
  )
}

function RoundRug({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const radius = Math.min(item.w, item.d) / 2
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, item.h / 2, 0]} receiveShadow>
        <circleGeometry args={[radius, 48]} />
        <SurfaceMaterial material={palette.fabric} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, item.h + 0.001, 0]} receiveShadow>
        <ringGeometry args={[radius * 0.82, radius * 0.9, 48]} />
        <SurfaceMaterial material={palette.fabricSecondary} />
      </mesh>
    </group>
  )
}

function Candle({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const h = item.h
  return (
    <group>
      <Cyl radiusTop={0.042} radiusBottom={0.05} height={h * 0.72} position={[0, h * 0.36, 0]} material={palette.white} segments={28} />
      <Cyl radiusTop={0.003} radiusBottom={0.004} height={h * 0.08} position={[0, h * 0.76, 0]} material={palette.black} segments={10} />
      <mesh position={[0, h * 0.84, 0]}>
        <sphereGeometry args={[0.018, 12, 10]} />
        <meshStandardMaterial color="#ffcc70" emissive="#ff9800" emissiveIntensity={2} />
      </mesh>
    </group>
  )
}

function Parasol({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { d, h } = item
  const radius = Math.min(item.w, d) / 2
  return (
    <group>
      <Cyl radiusTop={0.035} radiusBottom={0.045} height={h * 0.78} position={[0, h * 0.39, 0]} material={palette.metalDark} />
      <mesh position={[0, h * 0.84, 0]} castShadow>
        <coneGeometry args={[radius, h * 0.26, 8]} />
        <SurfaceMaterial material={palette.fabric} />
      </mesh>
      <Cyl radiusTop={0.012} radiusBottom={0.012} height={h * 0.08} position={[0, h * 0.97, 0]} material={palette.metal} />
      <Cyl radiusTop={radius * 0.24} radiusBottom={radius * 0.28} height={0.18} position={[0, 0.09, 0]} material={palette.stone} segments={24} />
    </group>
  )
}

function Bbq({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const bodyH = h * 0.4
  const wheels: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  return (
    <group>
      <Box size={[w, bodyH, d]} position={[0, 0.42 + bodyH / 2, 0]} material={palette.metalDark} />
      <Box size={[w + 0.02, 0.07, d + 0.02]} position={[0, 0.42 + bodyH + 0.035, 0]} material={palette.metal} />
      <Box size={[0.18, 0.03, 0.03]} position={[w / 2 + 0.06, 0.42 + bodyH + 0.07, 0]} material={palette.black} />
      <Box size={[w * 0.82, 0.022, d * 0.72]} position={[0, 0.3, 0]} material={palette.metal} />
      {wheels.map(([sx, sz], index) => (
        <Cyl
          key={index}
          radiusTop={0.07}
          radiusBottom={0.07}
          height={0.05}
          position={[sx * (w / 2 - 0.11), 0.045, sz * (d / 2 - 0.12)]}
          rotation={[Math.PI / 2, 0, 0]}
          material={palette.black}
          segments={16}
        />
      ))}
    </group>
  )
}

function Planter({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const soilY = h * 0.78
  const green: MaterialConfig = { color: "#6f8560", roughness: 0.92, metalness: 0 }
  return (
    <group>
      <RBox size={[w, h * 0.8, d]} position={[0, h * 0.4, 0]} radius={0.02} material={palette.stone} />
      <Box size={[w - 0.06, 0.02, d - 0.06]} position={[0, soilY, 0]} material={{ color: "#3a2d22", roughness: 1, metalness: 0 }} />
      {[-1, 0, 1].map((index) => (
        <group key={index} position={[index * (w * 0.26), soilY, (index % 2) * d * 0.08]}>
          <Cyl radiusTop={0.012} radiusBottom={0.016} height={h * 0.3} position={[0, h * 0.15, 0]} material={green} segments={10} />
          <mesh position={[0, h * 0.32, 0]}>
            <sphereGeometry args={[h * 0.15, 12, 10]} />
            <SurfaceMaterial material={green} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function GardenLight({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const h = item.h
  return (
    <group>
      <Cyl radiusTop={0.07} radiusBottom={0.09} height={0.06} position={[0, 0.03, 0]} material={palette.stone} segments={20} />
      <Cyl radiusTop={0.035} radiusBottom={0.045} height={h * 0.78} position={[0, h * 0.43, 0]} material={palette.metalDark} />
      <RBox size={[0.18, h * 0.18, 0.18]} position={[0, h * 0.88, 0]} radius={0.02} material={palette.whiteMatte} />
      <mesh position={[0, h * 0.88, 0]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial color="#fff3d0" emissive="#ffd28a" emissiveIntensity={2} />
      </mesh>
    </group>
  )
}

function Bike({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  const wheelR = h * 0.3
  const axleY = wheelR + 0.02
  const rearX = -w * 0.32
  const frontX = w * 0.32
  return (
    <group>
      {[rearX, frontX].map((x) => (
        <mesh key={x} position={[x, axleY, 0]} castShadow>
          <torusGeometry args={[wheelR, 0.022, 10, 28]} />
          <SurfaceMaterial material={palette.black} />
        </mesh>
      ))}
      <Cyl radiusTop={0.018} radiusBottom={0.018} height={w * 0.64} position={[0, axleY + h * 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={palette.metal} />
      <Cyl radiusTop={0.016} radiusBottom={0.016} height={h * 0.36} position={[rearX + w * 0.09, axleY + h * 0.1, 0]} rotation={[0, 0, -0.55]} material={palette.metal} />
      <Cyl radiusTop={0.016} radiusBottom={0.016} height={h * 0.34} position={[frontX - w * 0.05, axleY + h * 0.12, 0]} rotation={[0, 0, 0.5]} material={palette.metal} />
      <Box size={[0.26, 0.028, 0.02]} position={[rearX + w * 0.09, axleY + h * 0.38, 0]} material={palette.black} />
      <Box size={[0.02, h * 0.2, 0.02]} position={[frontX - w * 0.04, axleY + h * 0.26, 0]} material={palette.metal} />
      <Box size={[0.2, 0.024, 0.02]} position={[frontX - w * 0.04, axleY + h * 0.36, 0]} material={palette.black} />
    </group>
  )
}

function GarageShelf({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const corners: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  return (
    <group>
      {corners.map(([sx, sz], index) => (
        <Box key={index} size={[0.05, h, 0.05]} position={[sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)]} material={palette.metalDark} />
      ))}
      {Array.from({ length: 4 }, (_, index) => (
        <Box key={index} size={[w - 0.04, 0.025, d - 0.04]} position={[0, 0.12 + index * ((h - 0.16) / 3), 0]} material={palette.metal} />
      ))}
    </group>
  )
}

function EvCharger({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const h = item.h
  return (
    <group>
      <RBox size={[0.26, h, 0.14]} position={[0, h / 2, 0]} radius={0.02} material={palette.whiteMatte} />
      <Box size={[0.2, 0.1, 0.008]} position={[0, h * 0.72, 0.075]} material={palette.screen} />
      <Box size={[0.08, 0.02, 0.02]} position={[0, h * 0.54, 0.08]} material={palette.black} />
      <Cyl radiusTop={0.018} radiusBottom={0.018} height={0.45} position={[0.07, h * 0.2, 0.07]} rotation={[0, 0, -0.22]} material={palette.black} />
    </group>
  )
}

/** Kinds dont la géométrie est reconstruite à partir des cotes de l'instance. */
export const PARAMETRIC_KINDS = new Set<string>([
  "kitchenOvenBank",
  "kitchenBase",
  "wineFridge",
  "marbleTop",
  "blackSink",
  "blackTap",
  "inductionHob",
  "angledHood",
  "marbleIsland",
  "wireStool",
  "smokedGlobePendant",
  "floatingShelf",
  "bookStack",
  "trailingPlant",
  "botanicalArt",
  "cuttingBoard",
  "coffeeMachine",
  "marbleBacksplash",
  "kitchenUpper",
  "stoneFloor",
  "porsche996",
  "consoleTable",
  "sideTable",
  "dishwasher",
  "microwave",
  "kitchenBin",
  "crib",
  "chestOfDrawers",
  "changingTable",
  "filingCabinet",
  "deskLamp",
  "roundRug",
  "candle",
  "parasol",
  "bbq",
  "planter",
  "gardenLight",
  "bike",
  "garageShelf",
  "evCharger",
])

function Wedge({
  size,
  position = [0, 0, 0],
  material,
}: {
  size: Vec3
  position?: Vec3
  material: MaterialConfig
}) {
  const [w, h, d] = size
  const geometry = useMemo(() => {
    const inset = Math.min(0.14, d * 0.5)
    const zf = -d / 2
    const zb = d / 2
    const zt = zb - inset
    const positions = [
      -w / 2, 0, zf,
      w / 2, 0, zf,
      w / 2, 0, zb,
      -w / 2, 0, zb,
      -w / 2, h, zb,
      w / 2, h, zb,
      w / 2, h, zt,
      -w / 2, h, zt,
    ]
    const indices = [
      0, 1, 2, 0, 2, 3,
      3, 2, 5, 3, 5, 4,
      4, 5, 6, 4, 6, 7,
      0, 7, 6, 0, 6, 1,
      0, 3, 4, 0, 4, 7,
      1, 6, 5, 1, 5, 2,
    ]
    const result = new THREE.BufferGeometry()
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    result.setIndex(indices)
    result.computeVertexNormals()
    return result
  }, [d, h, w])

  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <SurfaceMaterial material={material} />
    </mesh>
  )
}

function Segment({
  from,
  to,
  radius,
  material,
}: {
  from: Vec3
  to: Vec3
  radius: number
  material: MaterialConfig
}) {
  const start = new THREE.Vector3(...from)
  const end = new THREE.Vector3(...to)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const midpoint = start.clone().add(end).multiplyScalar(0.5)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  )
  return (
    <mesh position={midpoint.toArray()} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <SurfaceMaterial material={material} />
    </mesh>
  )
}

function KitchenOvenBank({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const front = -d / 2 - 0.005
  const plinth = 0.1
  const ovenWidth = Math.min(0.6, Math.max(0.45, w * 0.4))
  const remaining = Math.max(0.2, w - ovenWidth)
  // local -x = joue étroite côté crédence ; local +x = joue large côté cellier.
  const westWidth = remaining * 0.4
  const eastWidth = remaining * 0.6
  const westStart = -w / 2
  const ovenStart = westStart + westWidth
  const eastStart = ovenStart + ovenWidth
  const ovenCenter = ovenStart + ovenWidth / 2
  const nicheTop = Math.min(h - 0.2, 1.82)
  const nicheBottom = Math.min(0.7, nicheTop - 0.7)
  const lowerBottom = nicheBottom + 0.02
  const lowerTop = nicheBottom + 0.5
  const upperBottom = lowerTop + 0.05
  const upperTop = Math.min(nicheTop - 0.02, upperBottom + 0.46)
  const doorTop = h - 0.02
  const doorHeight = doorTop - plinth
  const doorY = plinth + doorHeight / 2
  const eastDoors = Math.max(1, Math.round(eastWidth / 0.42))
  const westDoors = Math.max(1, Math.round(westWidth / 0.6))
  const width = (sectionWidth: number, count: number) => sectionWidth / count
  const steel: MaterialConfig = { color: "#b9bab4", roughness: 0.32, metalness: 0.9 }

  return (
    <group>
      <Box size={[w - 0.04, plinth, d - 0.03]} position={[0, plinth / 2, 0.015]} material={palette.plinth} />
      <CabinetShell
        width={w}
        height={doorHeight}
        depth={d - 0.02}
        position={[0, plinth, 0]}
        material={palette.lacquerSecondary}
      />
      <Box size={[0.02, doorHeight, d - 0.04]} position={[ovenStart, doorY, 0]} material={palette.lacquerSecondary} />
      <Box size={[0.02, doorHeight, d - 0.04]} position={[eastStart, doorY, 0]} material={palette.lacquerSecondary} />
      <Box size={[ovenWidth, doorHeight, d - 0.02]} position={[ovenCenter, doorY, 0]} material={palette.lacquerSecondary} />
      <CabinetShelves
        width={westWidth - 0.04}
        depth={d - 0.08}
        heights={[0.75, 1.45]}
        position={[westStart + westWidth / 2, plinth, 0]}
        material={palette.wood}
      />
      <CabinetShelves
        width={eastWidth - 0.04}
        depth={d - 0.08}
        heights={[0.75, 1.45]}
        position={[eastStart + eastWidth / 2, plinth, 0]}
        material={palette.wood}
      />

      {Array.from({ length: eastDoors }).map((_, index) => {
        const panelWidth = width(eastWidth, eastDoors)
        return (
          <HingedDoor
            key={`east-${index}`}
            doorId={`${seed}:east${index}`}
            side={1}
            width={panelWidth - 0.005}
            height={doorHeight - 0.004}
            position={[eastStart + panelWidth * index, plinth, -d / 2 - 0.011]}
            material={palette.lacquer}
            seams={[1.05 - plinth]}
          />
        )
      })}
      {Array.from({ length: westDoors }).map((_, index) => {
        const panelWidth = width(westWidth, westDoors)
        return (
          <HingedDoor
            key={`west-${index}`}
            doorId={`${seed}:west${index}`}
            side={1}
            width={panelWidth - 0.005}
            height={doorHeight - 0.004}
            position={[westStart + panelWidth * index, plinth, -d / 2 - 0.011]}
            material={palette.lacquer}
            seams={[1.28 - plinth]}
          />
        )
      })}

      <Box size={[ovenWidth - 0.02, doorHeight - 0.01, 0.008]} position={[ovenCenter, doorY, front - 0.001]} material={palette.lacquerSecondary} />
      <Box
        size={[ovenWidth - 0.06, nicheTop - nicheBottom, 0.03]}
        position={[ovenCenter, (nicheTop + nicheBottom) / 2, -d / 2 + 0.015]}
        material={palette.black}
      />

      <RBox
        size={[ovenWidth - 0.075, lowerTop - lowerBottom, 0.018]}
        position={[ovenCenter, (lowerBottom + lowerTop) / 2, front - 0.01]}
        radius={0.004}
        material={palette.screen}
      />
      <Box
        size={[ovenWidth - 0.12, 0.014, 0.012]}
        position={[ovenCenter, lowerTop - 0.045, front - 0.034]}
        material={steel}
      />
      <Box
        size={[ovenWidth - 0.10, 0.004, 0.004]}
        position={[ovenCenter, lowerTop - 0.085, front - 0.024]}
        material={steel}
      />
      <Box
        size={[0.05, 0.014, 0.004]}
        position={[ovenCenter + ovenWidth / 2 - 0.09, lowerTop - 0.075, front - 0.024]}
        material={{ color: "#93aab5", roughness: 0.25, metalness: 0.2, emissive: "#6f95a8", emissiveIntensity: 0.32 }}
      />
      <Box
        size={[ovenWidth - 0.075, 0.012, 0.012]}
        position={[ovenCenter, (lowerTop + upperBottom) / 2, front - 0.012]}
        material={palette.metalDark}
      />
      <RBox
        size={[ovenWidth - 0.075, upperTop - upperBottom, 0.018]}
        position={[ovenCenter, (upperBottom + upperTop) / 2, front - 0.01]}
        radius={0.004}
        material={palette.screen}
      />
      <Box
        size={[0.04, 0.014, 0.004]}
        position={[ovenCenter + ovenWidth / 2 - 0.09, upperTop - 0.055, front - 0.023]}
        material={{ color: "#8ea9b6", roughness: 0.25, metalness: 0.2, emissive: "#6f9ab0", emissiveIntensity: 0.35 }}
      />
      <Box
        size={[ovenWidth - 0.10, 0.004, 0.004]}
        position={[ovenCenter, upperBottom + 0.035, front - 0.024]}
        material={steel}
      />

      <Box size={[w, 0.02, d]} position={[0, h - 0.01, 0]} material={palette.lacquer} />
    </group>
  )
}

function KitchenBase({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const plinth = 0.1
  const doors = Math.max(1, Math.round(w / 0.6))
  const doorWidth = w / doors
  const panelHeight = h - plinth - 0.02
  const shellHeight = h - plinth
  return (
    <group>
      <Box size={[w - 0.06, plinth, d - 0.06]} position={[0, plinth / 2, 0.03]} material={palette.plinth} />
      <CabinetShell
        width={w}
        height={shellHeight}
        depth={d}
        position={[0, plinth, 0]}
        material={palette.lacquerSecondary}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[shellHeight * 0.42, shellHeight * 0.74]}
        position={[0, plinth, 0]}
        material={palette.wood}
      />
      {Array.from({ length: doors }).map((_, index) => (
        <HingedDoor
          key={index}
          doorId={`${seed}:base${index}`}
          side={1}
          width={doorWidth - 0.005}
          height={panelHeight}
          position={[-w / 2 + doorWidth * index, plinth, -d / 2 - 0.011]}
          material={palette.lacquer}
          groove="top"
        />
      ))}
    </group>
  )
}

function WineFridge({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const plinth = 0.1
  const glassWidth = Math.max(0.24, w - 0.1)
  const glassHeight = Math.max(0.3, h - 0.24)
  const glassY = plinth + glassHeight / 2 + 0.02
  const shelfCount = 4
  const bottleRows = [0.2, 0.34, 0.48, 0.62]
  const bottlesPerRow = 5
  return (
    <group>
      <Box size={[w - 0.06, plinth, d - 0.06]} position={[0, plinth / 2, 0.03]} material={palette.plinth} />
      <CabinetShell
        width={w}
        height={h - plinth}
        depth={d}
        position={[0, plinth, 0]}
        material={palette.lacquer}
      />
      <Box
        size={[w - 0.04, h - plinth - 0.04, 0.02]}
        position={[0, plinth + (h - plinth) / 2, d / 2 - 0.02]}
        material={{ color: "#0d0f0e", roughness: 0.35, metalness: 0.15 }}
      />
      <Box
        size={[glassWidth - 0.01, 0.006, 0.006]}
        position={[0, glassY + glassHeight / 2 - 0.035, -d / 2 + 0.04]}
        material={{ color: "#ffd9a3", roughness: 0.4, metalness: 0, emissive: "#ffc078", emissiveIntensity: 1.1 }}
      />
      {Array.from({ length: shelfCount }).map((_, index) => (
        <Box
          key={`shelf-${index}`}
          size={[glassWidth - 0.02, 0.012, d - 0.12]}
          position={[0, bottleRows[index]! - 0.035, -d / 2 + 0.12]}
          material={palette.wood}
        />
      ))}
      {bottleRows.map((rowY, rowIndex) =>
        Array.from({ length: bottlesPerRow }).map((_, bottleIndex) => {
          const x = -glassWidth / 2 + 0.08 + (bottleIndex * (glassWidth - 0.16)) / (bottlesPerRow - 1)
          return (
            <group key={`bottle-${rowIndex}-${bottleIndex}`} position={[x, rowY, -d / 2 + 0.16]}>
              <Cyl
                radiusTop={0.031}
                radiusBottom={0.031}
                height={0.2}
                position={[0, 0, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                material={{ color: "#24382a", roughness: 0.18, metalness: 0.15 }}
                segments={16}
              />
              <Cyl
                radiusTop={0.032}
                radiusBottom={0.032}
                height={0.045}
                position={[0, 0, 0.055]}
                rotation={[Math.PI / 2, 0, 0]}
                material={{ color: "#e8dfcb", roughness: 0.75, metalness: 0 }}
                segments={16}
              />
            </group>
          )
        }),
      )}
      <HingedDoor
        doorId={`${seed}:glass`}
        side={1}
        width={glassWidth}
        height={glassHeight}
        thickness={0.008}
        position={[-glassWidth / 2, glassY - glassHeight / 2, -d / 2 - 0.011]}
        material={palette.glassSmoked}
        handle={palette.metal}
        openAngle={1.55}
      />
      <Box
        size={[0.09, 0.018, 0.004]}
        position={[0, h - 0.075, -d / 2 - 0.02]}
        material={{ color: "#94b6c4", roughness: 0.2, metalness: 0.1, emissive: "#6f9fb5", emissiveIntensity: 0.5 }}
      />
    </group>
  )
}

function MarbleTop({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.003} material={palette.marble} />
  )
}

function BlackSink({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d } = item
  const rim = 0.025
  const innerW = w - rim * 2
  const innerD = d - rim * 2
  return (
    <group>
      <Box size={[w, 0.012, rim]} position={[0, -0.006, d / 2 - rim / 2]} material={palette.black} />
      <Box size={[w, 0.012, rim]} position={[0, -0.006, -d / 2 + rim / 2]} material={palette.black} />
      <Box size={[rim, 0.012, innerD]} position={[w / 2 - rim / 2, -0.006, 0]} material={palette.black} />
      <Box size={[rim, 0.012, innerD]} position={[-w / 2 + rim / 2, -0.006, 0]} material={palette.black} />
      <Box size={[innerW, 0.01, innerD]} position={[0, -0.155, 0]} material={{ color: "#111312", roughness: 0.26, metalness: 0.3 }} />
      <Box size={[innerW, 0.15, 0.01]} position={[0, -0.078, innerD / 2 - 0.005]} material={{ color: "#161817", roughness: 0.28, metalness: 0.24 }} />
      <Box size={[innerW, 0.15, 0.01]} position={[0, -0.078, -innerD / 2 + 0.005]} material={{ color: "#161817", roughness: 0.28, metalness: 0.24 }} />
      <Box size={[0.01, 0.15, innerD]} position={[innerW / 2 - 0.005, -0.078, 0]} material={{ color: "#161817", roughness: 0.28, metalness: 0.24 }} />
      <Box size={[0.01, 0.15, innerD]} position={[-innerW / 2 + 0.005, -0.078, 0]} material={{ color: "#161817", roughness: 0.28, metalness: 0.24 }} />
      <Cyl radiusTop={0.028} radiusBottom={0.028} height={0.006} position={[0, -0.145, 0]} material={palette.metalDark} segments={24} />
    </group>
  )
}

function BlackTap({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { h } = item
  const bodyHeight = Math.max(0.18, h - 0.12)
  return (
    <group>
      <Cyl radiusTop={0.028} radiusBottom={0.032} height={0.018} position={[0, 0.009, 0]} material={palette.metalDark} segments={20} />
      <Cyl radiusTop={0.012} radiusBottom={0.014} height={bodyHeight} position={[0, 0.018 + bodyHeight / 2, 0]} material={palette.metalDark} segments={16} />
      <Box size={[0.022, 0.022, 0.14]} position={[0, 0.018 + bodyHeight, -0.07]} material={palette.metalDark} />
      <Box size={[0.02, 0.05, 0.02]} position={[0, 0.018 + bodyHeight - 0.02, -0.14]} material={palette.metalDark} />
      <Box size={[0.075, 0.012, 0.012]} position={[0.045, 0.018 + bodyHeight * 0.7, 0]} material={palette.metalDark} />
    </group>
  )
}

function InductionHob({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d } = item
  const zones: [number, number][] = [
    [-w * 0.22, -d * 0.17],
    [w * 0.22, -d * 0.17],
    [-w * 0.22, d * 0.18],
    [w * 0.22, d * 0.18],
  ]
  return (
    <group>
      <RBox size={[w, 0.008, d]} position={[0, 0.004, 0]} radius={0.005} material={palette.screen} />
      {zones.map(([x, z], index) => (
        <mesh key={index} position={[x, 0.0095, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.062, 0.069, 32]} />
          <meshStandardMaterial color="#6f706b" roughness={0.45} metalness={0.2} transparent opacity={0.42} />
        </mesh>
      ))}
      <Box
        size={[0.18, 0.002, 0.012]}
        position={[0, 0.0095, -d / 2 + 0.055]}
        material={{ color: "#5d5e5a", roughness: 0.4, metalness: 0.15 }}
      />
    </group>
  )
}

function AngledHood({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h, d } = item
  return (
    <group>
      <Wedge size={[w, h, d]} material={palette.black} />
      <Box
        size={[w * 0.78, 0.012, 0.014]}
        position={[0, 0.018, -d / 2 + 0.012]}
        material={palette.metalDark}
      />
      <Box
        size={[0.035, 0.006, 0.006]}
        position={[w * 0.3, h * 0.42, -d / 2 + Math.min(0.14, d * 0.5) * (1 - h * 0.42 / h) + 0.008]}
        material={{ color: "#c7a46a", roughness: 0.35, metalness: 0.5 }}
      />
    </group>
  )
}

function MarbleIsland({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const topHeight = 0.06
  const baseHeight = h - topHeight
  const baseWidth = Math.max(0.4, w - 0.1)
  const baseDepth = Math.min(0.62, Math.max(0.42, d * 0.55))
  // Base côté ouest (local -z), débord côté tabourets (local +z).
  const baseZ = -d / 2 + baseDepth / 2
  const plinth = 0.1
  const doors = Math.max(2, Math.round(baseWidth / 0.65))
  const doorWidth = baseWidth / doors
  const doorHeight = baseHeight - plinth - 0.02
  const frontZ = baseZ + baseDepth / 2
  return (
    <group>
      <RBox size={[w, topHeight, d]} position={[0, h - topHeight / 2, 0]} radius={0.004} material={palette.marble} />
      <Box
        size={[baseWidth - 0.06, plinth, baseDepth - 0.06]}
        position={[0, plinth / 2, baseZ - 0.03]}
        material={palette.plinth}
      />
      <CabinetShell
        width={baseWidth}
        height={baseHeight - plinth}
        depth={baseDepth}
        position={[0, plinth, baseZ]}
        direction={1}
        material={palette.lacquerSecondary}
      />
      <CabinetShelves
        width={baseWidth}
        depth={baseDepth}
        heights={[(baseHeight - plinth) * 0.5]}
        position={[0, plinth, baseZ]}
        material={palette.wood}
      />
      {Array.from({ length: doors }).map((_, index) => (
        <HingedDoor
          key={index}
          doorId={`${seed}:island${index}`}
          side={1}
          direction={1}
          width={doorWidth - 0.005}
          height={doorHeight}
          position={[-baseWidth / 2 + doorWidth * index, plinth, frontZ + 0.011]}
          material={palette.lacquer}
        />
      ))}
      <Box
        size={[0.03, baseHeight - 0.22, baseDepth - 0.1]}
        position={[baseWidth / 2 + 0.012, baseHeight / 2 + 0.04, baseZ]}
        material={palette.wood}
      />
    </group>
  )
}

function WireStool({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  const seatY = Math.min(0.66, h * 0.68)
  const shellWidth = Math.min(w * 0.96, 0.46)
  const shellDepth = Math.min(w * 0.88, 0.4)
  const legX = shellWidth / 2 - 0.05
  const legZ = shellDepth / 2 - 0.045
  return (
    <group>
      <RBox
        size={[shellWidth, 0.055, shellDepth]}
        position={[0, seatY, 0]}
        radius={0.028}
        material={palette.whiteMatte}
      />
      <RBox
        size={[shellWidth, Math.max(0.16, h - seatY - 0.02), 0.045]}
        position={[0, seatY + (h - seatY) / 2 - 0.01, shellDepth / 2 - 0.025]}
        rotation={[-0.14, 0, 0]}
        radius={0.035}
        material={palette.whiteMatte}
      />
      <RBox
        size={[0.045, 0.14, shellDepth * 0.55]}
        position={[-shellWidth / 2 + 0.022, seatY + 0.06, 0.03]}
        radius={0.02}
        material={palette.whiteMatte}
      />
      <RBox
        size={[0.045, 0.14, shellDepth * 0.55]}
        position={[shellWidth / 2 - 0.022, seatY + 0.06, 0.03]}
        radius={0.02}
        material={palette.whiteMatte}
      />
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z], index) => (
        <Cyl
          key={`leg-${index}`}
          radiusTop={0.008}
          radiusBottom={0.008}
          height={seatY}
          position={[x!, seatY / 2, z!]}
          material={palette.whiteMetal}
          segments={10}
        />
      ))}
      {[-legZ, legZ].map((z, index) => (
        <Cyl
          key={`runner-${index}`}
          radiusTop={0.008}
          radiusBottom={0.008}
          height={shellWidth - 0.02}
          position={[0, 0.012, z]}
          rotation={[0, 0, Math.PI / 2]}
          material={palette.whiteMetal}
          segments={10}
        />
      ))}
      <Cyl
        radiusTop={0.008}
        radiusBottom={0.008}
        height={shellDepth}
        position={[-legX, 0.012, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        material={palette.whiteMetal}
        segments={10}
      />
      <Cyl
        radiusTop={0.008}
        radiusBottom={0.008}
        height={shellDepth}
        position={[legX, 0.012, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        material={palette.whiteMetal}
        segments={10}
      />
      <Cyl
        radiusTop={0.007}
        radiusBottom={0.007}
        height={shellWidth - 0.03}
        position={[0, seatY * 0.36, -legZ]}
        rotation={[0, 0, Math.PI / 2]}
        material={palette.whiteMetal}
        segments={10}
      />
    </group>
  )
}

function SmokedGlobePendant({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const radius = Math.min(w, d) / 2
  const ceiling = 0.94
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <sphereGeometry args={[radius, 32, 26, 0, Math.PI * 2, 0, Math.PI * 0.88]} />
        <SurfaceMaterial material={palette.glassSmoked} envMapIntensity={0.8} />
      </mesh>
      <Cyl radiusTop={0.018} radiusBottom={0.024} height={0.035} position={[0, h - 0.01, 0]} material={palette.brass} segments={20} />
      <Cyl radiusTop={0.0035} radiusBottom={0.0035} height={ceiling - h} position={[0, (h + ceiling) / 2, 0]} material={palette.black} segments={8} />
      <Cyl radiusTop={0.048} radiusBottom={0.048} height={0.018} position={[0, ceiling, 0]} material={palette.brass} segments={24} />
      <mesh position={[0, h / 2 - 0.015, 0]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshBasicMaterial color="#ffe2b0" />
      </mesh>
      <pointLight position={[0, h / 2 - 0.02, 0]} intensity={1.4} distance={3.4} decay={2} color="#ffc98d" />
    </group>
  )
}

function FloatingShelf({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.004} material={palette.wood} />
      <Box size={[w - 0.02, 0.004, d - 0.02]} position={[0, 0.002, 0]} material={palette.woodDark} />
    </group>
  )
}

function BookStack({ item }: { item: CatalogItem }) {
  const { w, d, h } = item
  const covers = ["#f0ece3", "#dcd6c9", "#c9c4b8", "#e7e2d7", "#b9b5aa"]
  const books = 5
  return (
    <group>
      {Array.from({ length: books }).map((_, index) => {
        const height = h / books
        const width = w * (0.94 - index * 0.025)
        const depth = d * (0.9 + (index % 2) * 0.04)
        return (
          <group key={index} position={[0, height * (index + 0.5), 0]} rotation={[0, (index - 2) * 0.045, 0]}>
            <Box size={[width, height - 0.003, depth]} position={[0, 0, 0]} material={{ color: covers[index]!, roughness: 0.82, metalness: 0 }} />
            <Box size={[width - 0.012, height - 0.009, depth + 0.001]} position={[0, 0, 0]} material={{ color: "#f5f1e8", roughness: 0.86, metalness: 0 }} />
          </group>
        )
      })}
    </group>
  )
}

function TrailingPlant({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  const potHeight = Math.min(0.15, h * 0.36)
  const potRadius = Math.min(0.075, w * 0.26)
  const stems = [
    { angle: -0.4, reach: 0.16, drop: 0.24 },
    { angle: 0.35, reach: 0.14, drop: 0.18 },
    { angle: 1.4, reach: 0.18, drop: 0.3 },
    { angle: 2.5, reach: 0.12, drop: 0.14 },
    { angle: 3.6, reach: 0.15, drop: 0.22 },
    { angle: 4.7, reach: 0.17, drop: 0.27 },
    { angle: 5.5, reach: 0.13, drop: 0.19 },
  ]
  return (
    <group>
      <Cyl radiusTop={potRadius} radiusBottom={potRadius * 0.8} height={potHeight} position={[0, potHeight / 2, 0]} material={{ color: "#969990", roughness: 0.88, metalness: 0 }} segments={28} />
      <Cyl radiusTop={potRadius * 1.06} radiusBottom={potRadius * 1.06} height={0.016} position={[0, potHeight - 0.008, 0]} material={{ color: "#7f837b", roughness: 0.9, metalness: 0 }} segments={28} />
      <Cyl radiusTop={potRadius * 0.92} radiusBottom={potRadius * 0.92} height={0.006} position={[0, potHeight - 0.02, 0]} material={{ color: "#403429", roughness: 1, metalness: 0 }} segments={20} />
      {stems.map((stem, index) => {
        const start: Vec3 = [Math.cos(stem.angle) * potRadius * 0.55, potHeight - 0.01, Math.sin(stem.angle) * potRadius * 0.55]
        const mid: Vec3 = [Math.cos(stem.angle) * (potRadius + stem.reach * 0.55), potHeight - stem.drop * 0.35, Math.sin(stem.angle) * (potRadius + stem.reach * 0.55)]
        const end: Vec3 = [Math.cos(stem.angle) * (potRadius + stem.reach), potHeight - stem.drop, Math.sin(stem.angle) * (potRadius + stem.reach)]
        return (
          <group key={index}>
            <Segment from={start} to={mid} radius={0.004} material={palette.woodDark} />
            <Segment from={mid} to={end} radius={0.003} material={palette.woodDark} />
            {[0.35, 0.65, 0.9].map((ratio, leafIndex) => {
              const leafPosition: Vec3 = [
                start[0] + (end[0] - start[0]) * ratio,
                start[1] + (end[1] - start[1]) * ratio,
                start[2] + (end[2] - start[2]) * ratio,
              ]
              return (
                <mesh
                  key={leafIndex}
                  position={leafPosition}
                  rotation={[0.5, stem.angle + leafIndex, 0.4]}
                  scale={[0.032, 0.004, 0.05]}
                  castShadow
                >
                  <sphereGeometry args={[1, 8, 6]} />
                  <SurfaceMaterial material={leafIndex % 2 ? palette.fabric : palette.fabricSecondary} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}

function BotanicalArt({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const frame = 0.018
  const ink: MaterialConfig = { color: "#38423a", roughness: 0.75, metalness: 0 }
  const branches = [
    { x: -w * 0.06, tilt: 0.1, length: h * 0.56 },
    { x: w * 0.08, tilt: -0.2, length: h * 0.46 },
    { x: -w * 0.16, tilt: 0.28, length: h * 0.38 },
  ]
  return (
    <group>
      <Box size={[w, frame, d]} position={[0, h - frame / 2, 0]} material={palette.wood} />
      <Box size={[w, frame, d]} position={[0, frame / 2, 0]} material={palette.wood} />
      <Box size={[frame, h - frame * 2, d]} position={[-w / 2 + frame / 2, h / 2, 0]} material={palette.wood} />
      <Box size={[frame, h - frame * 2, d]} position={[w / 2 - frame / 2, h / 2, 0]} material={palette.wood} />
      <Box size={[w - frame * 2, h - frame * 2, 0.006]} position={[0, h / 2, -d / 2 + 0.004]} material={{ color: "#f1eee6", roughness: 0.9, metalness: 0 }} />
      {branches.map((branch, index) => (
        <group key={index} position={[branch.x, h * 0.34, -d / 2 - 0.001]} rotation={[0, 0, branch.tilt]}>
          <Segment from={[0, 0, 0]} to={[0, branch.length, 0]} radius={0.0018} material={ink} />
          {[0.3, 0.5, 0.68, 0.84].map((ratio, leafIndex) => {
            const side = leafIndex % 2 === 0 ? -1 : 1
            const leaf: Vec3 = [side * w * 0.055, branch.length * ratio, 0]
            return (
              <group key={leafIndex}>
                <Segment from={[0, branch.length * ratio, 0]} to={leaf} radius={0.0013} material={ink} />
                <mesh position={[leaf[0] + side * 0.012, leaf[1], 0]} rotation={[0, 0, side * 0.5]} scale={[0.009, 0.032, 0.002]}>
                  <sphereGeometry args={[1, 8, 6]} />
                  <SurfaceMaterial material={ink} />
                </mesh>
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}

function CuttingBoard({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const boardHeight = Math.max(0.18, h - 0.06)
  return (
    <group rotation={[-0.14, 0, 0]}>
      <RBox size={[w, boardHeight, d]} position={[0, boardHeight / 2, d]} radius={0.012} material={palette.wood} />
      <RBox size={[w * 0.24, 0.075, d]} position={[0, boardHeight + 0.035, d]} radius={0.02} material={palette.wood} />
      <mesh position={[0, boardHeight + 0.042, d - 0.004]}>
        <circleGeometry args={[0.009, 18]} />
        <meshStandardMaterial color="#7f633f" roughness={0.8} metalness={0} />
      </mesh>
      <Box size={[w * 0.9, 0.004, d + 0.002]} position={[0, boardHeight * 0.58, d]} material={palette.woodDark} />
    </group>
  )
}

function CoffeeMachine({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w + 0.02, 0.018, d + 0.02]} position={[0, 0.009, 0]} radius={0.006} material={palette.metalDark} />
      <RBox size={[w, h * 0.78, d]} position={[0, h * 0.39 + 0.012, 0]} radius={0.025} material={palette.black} />
      <Box size={[w + 0.002, 0.012, d + 0.002]} position={[0, h * 0.48, 0]} material={palette.metal} />
      <RBox size={[w * 0.86, 0.03, d * 0.86]} position={[0, h * 0.78 + 0.02, 0]} radius={0.012} material={palette.metalDark} />
      <Cyl radiusTop={0.012} radiusBottom={0.014} height={0.04} position={[0, h * 0.3, -d / 2 - 0.014]} rotation={[Math.PI / 2, 0, 0]} material={palette.metalDark} segments={14} />
      <Box size={[0.05, 0.008, 0.004]} position={[0, h * 0.68, -d / 2 - 0.003]} material={{ color: "#d9d8ce", roughness: 0.35, metalness: 0.2 }} />
    </group>
  )
}

function MarbleBacksplash({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.002} material={palette.marble} />
}

function StoneFloor({ item }: { item: CatalogItem }) {
  const { w, d, h } = item
  const material: MaterialConfig = {
    color: "#e8e2d7",
    roughness: 0.32,
    metalness: 0.02,
    texture: "tile",
    textureScale: 3.6,
    bump: 0.004,
    clearcoat: 0.12,
    clearcoatRoughness: 0.3,
  }
  return (
    <mesh position={[0, h / 2, 0]} receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <SurfaceMaterial material={material} uv={[w, d]} />
    </mesh>
  )
}

function KitchenUpper({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const doors = Math.max(1, Math.round(w / 0.6))
  const doorWidth = w / doors
  return (
    <group>
      <CabinetShell width={w} height={h} depth={d} material={palette.lacquerSecondary} />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[h * 0.48]}
        material={palette.wood}
      />
      {Array.from({ length: doors }).map((_, index) => (
        <HingedDoor
          key={index}
          doorId={`${seed}:upper${index}`}
          side={1}
          width={doorWidth - 0.005}
          height={h - 0.01}
          position={[-w / 2 + doorWidth * index, 0, -d / 2 - 0.011]}
          material={palette.lacquer}
          groove="bottom"
        />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Chambre
// ---------------------------------------------------------------------------

function Bed({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const pillowCount = w > 1.2 ? 2 : 1
  return (
    <group>
      <RBox size={[w, 0.2, d]} position={[0, 0.18, 0]} radius={0.03} material={palette.wood} />
      <RBox size={[w - 0.06, 0.24, d - 0.08]} position={[0, 0.38, 0]} radius={0.06} material={palette.white} />
      <RBox
        size={[w + 0.04, h - 0.3, 0.09]}
        position={[0, 0.15 + (h - 0.3) / 2, d / 2 - 0.045]}
        radius={0.04}
        material={palette.fabricSecondary}
      />
      <RBox
        size={[w - 0.04, 0.12, d * 0.72]}
        position={[0, 0.55, -d * 0.08]}
        radius={0.05}
        material={palette.fabric}
      />
      <RBox
        size={[w - 0.08, 0.07, 0.22]}
        position={[0, 0.59, d * 0.21]}
        radius={0.03}
        material={palette.fabricLight}
      />
      {Array.from({ length: pillowCount }).map((_, index) => (
        <RBox
          key={`pillow-${index}`}
          size={[(w - 0.16) / pillowCount - 0.02, 0.13, 0.34]}
          position={[
            -w / 2 + 0.08 + ((w - 0.16) / pillowCount) * (index + 0.5),
            0.67,
            d / 2 - 0.3,
          ]}
          radius={0.06}
          material={palette.fabricLight}
          rotation={[-0.22, 0, 0]}
        />
      ))}
      <RBox
        size={[w * 0.45, 0.04, d * 0.45]}
        position={[w * 0.12, 0.625, -d * 0.32]}
        radius={0.015}
        material={palette.fabricSecondary}
        rotation={[0, 0.04, 0]}
      />
      {[
        [-w / 2 + 0.08, -d / 2 + 0.08],
        [w / 2 - 0.08, -d / 2 + 0.08],
        [-w / 2 + 0.08, d / 2 - 0.08],
        [w / 2 - 0.08, d / 2 - 0.08],
      ].map(([x, z], index) => (
        <Cyl key={index} radiusTop={0.024} radiusBottom={0.02} height={0.1} position={[x!, 0.05, z!]} material={palette.woodDark} />
      ))}
    </group>
  )
}

function Nightstand({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const drawerBottom = 0.1
  const drawerTop = h * 0.48
  const upperHeight = h - 0.02 - drawerTop
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.12}
        depth={d}
        position={[0, 0.1, 0]}
        material={palette.wood}
      />
      <SlidingDrawer
        doorId={`${seed}:nightstand-drawer`}
        width={w - 0.06}
        height={drawerTop - drawerBottom}
        depth={Math.min(0.32, d - 0.08)}
        position={[0, drawerBottom, -d / 2 - 0.011]}
        material={palette.wood}
        boxMaterial={palette.woodDark}
        handle={palette.metal}
        travel={0.24}
      />
      <Box
        size={[w - 0.02, upperHeight, 0.018]}
        position={[0, (drawerTop + h - 0.02) / 2, -d / 2 - 0.005]}
        material={palette.wood}
      />
      <Box
        size={[w - 0.06, 0.008, 0.008]}
        position={[0, drawerTop, -d / 2 - 0.012]}
        material={palette.woodDark}
      />
      {[
        [-w / 2 + 0.04, -d / 2 + 0.04],
        [w / 2 - 0.04, -d / 2 + 0.04],
        [-w / 2 + 0.04, d / 2 - 0.04],
        [w / 2 - 0.04, d / 2 - 0.04],
      ].map(([x, z], index) => (
        <Cyl key={index} radiusTop={0.014} radiusBottom={0.012} height={0.1} position={[x!, 0.05, z!]} material={palette.metalDark} />
      ))}
      <RBox size={[0.18, 0.08, 0.13]} position={[0.05, h + 0.04, 0]} radius={0.012} material={palette.ceramic} />
    </group>
  )
}

function Wardrobe({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const doorWidth = w / 2 - 0.008
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.06}
        depth={d}
        position={[0, 0.05, 0]}
        material={palette.wood}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[(h - 0.06) * 0.3, (h - 0.06) * 0.56, (h - 0.06) * 0.8]}
        position={[0, 0.05, 0]}
        material={palette.woodDark}
      />
      <HingedDoor
        doorId={`${seed}:wardrobe-left`}
        side={1}
        width={doorWidth}
        height={h - 0.06}
        position={[-w / 2, 0.05, -d / 2 - 0.012]}
        material={palette.wood}
        handle={palette.metal}
        openAngle={1.75}
      />
      <HingedDoor
        doorId={`${seed}:wardrobe-right`}
        side={-1}
        width={doorWidth}
        height={h - 0.06}
        position={[w / 2, 0.05, -d / 2 - 0.012]}
        material={palette.wood}
        handle={palette.metal}
        openAngle={1.75}
      />
      <Box size={[w - 0.1, 0.04, d - 0.05]} position={[0, h - 0.06, 0]} material={palette.woodDark} />
    </group>
  )
}

function Desk({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, 0.05, d]} position={[0, h - 0.025, 0]} radius={0.012} material={palette.wood} />
      <Box size={[w - 0.12, 0.02, d - 0.12]} position={[0, h - 0.07, 0]} material={palette.woodDark} />
      {[
        [-w / 2 + 0.08, -d / 2 + 0.08],
        [w / 2 - 0.08, -d / 2 + 0.08],
        [-w / 2 + 0.08, d / 2 - 0.08],
        [w / 2 - 0.08, d / 2 - 0.08],
      ].map(([x, z], index) => (
        <Cyl key={index} radiusTop={0.025} radiusBottom={0.018} height={h - 0.06} position={[x!, (h - 0.06) / 2, z!]} material={palette.woodDark} />
      ))}
      <RBox size={[0.4, 0.32, 0.24]} position={[-w / 2 + 0.3, h + 0.16, 0.03]} radius={0.01} material={palette.paint} />
      <Box size={[0.36, 0.23, 0.008]} position={[-w / 2 + 0.3, h + 0.2, -0.092]} material={palette.screen} rotation={[-0.28, 0, 0]} />
      <Box size={[0.36, 0.008, 0.22]} position={[-w / 2 + 0.3, h + 0.006, 0.03]} material={palette.metalDark} />
      <RBox size={[0.24, 0.03, 0.18]} position={[w / 2 - 0.3, h + 0.015, -0.02]} radius={0.004} material={palette.fabricSecondary} />
      <RBox size={[0.16, 0.02, 0.22]} position={[w / 2 - 0.5, h + 0.01, 0.04]} radius={0.004} material={palette.ceramic} />
      <RBox size={[0.14, 0.14, 0.3]} position={[-w / 2 + 0.12, h * 0.5, 0]} radius={0.008} material={palette.wood} />
    </group>
  )
}

function OfficeChair({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const seatY = item.h * 0.48
  return (
    <group>
      {Array.from({ length: 5 }).map((_, index) => {
        const angle = (index * Math.PI * 2) / 5
        return (
          <group key={index} rotation={[0, angle, 0]}>
            <Box size={[0.28, 0.025, 0.04]} position={[0.14, 0.055, 0]} material={palette.metalDark} />
            <Cyl radiusTop={0.025} radiusBottom={0.025} height={0.035} position={[0.28, 0.02, 0]} material={palette.black} />
          </group>
        )
      })}
      <Cyl radiusTop={0.03} radiusBottom={0.03} height={seatY - 0.08} position={[0, (seatY - 0.08) / 2 + 0.07, 0]} material={palette.metal} />
      <RBox size={[item.w, 0.09, item.d]} position={[0, seatY, 0]} radius={0.03} material={palette.fabric} />
      <RBox
        size={[item.w - 0.08, item.h * 0.48, 0.08]}
        position={[0, seatY + item.h * 0.24, item.d / 2 - 0.08]}
        radius={0.03}
        material={palette.fabricSecondary}
        rotation={[-0.12, 0, 0]}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Cyl radiusTop={0.012} radiusBottom={0.012} height={0.2} position={[side * (item.w / 2 - 0.04), seatY + 0.06, 0]} material={palette.metalDark} />
          <Box size={[0.04, 0.03, 0.24]} position={[side * (item.w / 2 - 0.04), seatY + 0.17, 0]} material={palette.metalDark} />
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Salle d'eau
// ---------------------------------------------------------------------------

function Shower({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, 0.07, d]} position={[0, 0.035, 0]} radius={0.015} material={palette.white} />
      <Box size={[w - 0.12, 0.004, d - 0.12]} position={[0, 0.073, 0]} material={{ color: "#bfc3c0", roughness: 0.35, metalness: 0.2 }} />
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.035, 16]} />
        <meshStandardMaterial color="#8f9490" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[w / 2 - 0.005, h / 2, 0]} castShadow>
        <boxGeometry args={[0.012, h, d]} />
        <SurfaceMaterial material={palette.glass} />
      </mesh>
      <mesh position={[0, h / 2, -d / 2 + 0.005]} castShadow>
        <boxGeometry args={[w, h, 0.012]} />
        <SurfaceMaterial material={palette.glass} />
      </mesh>
      <Box size={[0.035, h, 0.035]} position={[w / 2 - 0.005, h / 2, -d / 2 + 0.02]} material={palette.metal} />
      <Box size={[0.035, h, 0.035]} position={[w / 2 - 0.005, h / 2, d / 2 - 0.02]} material={palette.metal} />
      {/* Barre horizontale haute reliant les deux montants verticaux : elle doit
          rester dans l'épaisseur de la paroi de la douche, sinon elle traverse
          le plafond et apparaît dans la pièce du niveau supérieur. */}
      <Box size={[0.035, 0.035, d - 0.04]} position={[w / 2 - 0.005, h - 0.02, 0]} material={palette.metal} />
      <Cyl radiusTop={0.02} radiusBottom={0.02} height={0.32} position={[-w / 2 + 0.08, h - 0.16, d / 2 - 0.08]} material={palette.metal} />
      <Cyl radiusTop={0.11} radiusBottom={0.11} height={0.02} position={[-w / 2 + 0.16, h - 0.32, d / 2 - 0.08]} material={palette.metal} rotation={[0, 0, -0.55]} />
    </group>
  )
}

function Vanity({
  item,
  palette,
  seed,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
}) {
  const { w, d, h } = item
  const lowerBottom = 0.12
  const lowerTop = h * 0.62
  const lowerHeight = lowerTop - lowerBottom
  const upperHeight = h - 0.02 - lowerTop
  return (
    <group>
      <CabinetShell
        width={w}
        height={h - 0.14}
        depth={d}
        position={[0, 0.12, 0]}
        material={palette.wood}
      />
      <CabinetShelves
        width={w}
        depth={d}
        heights={[0.38, 0.56]}
        position={[0, 0.12, 0]}
        material={palette.woodDark}
      />
      <RBox size={[w + 0.02, 0.035, d + 0.02]} position={[0, h - 0.018, 0]} radius={0.008} material={palette.stone} />
      <Box
        size={[w - 0.02, upperHeight, 0.018]}
        position={[0, (lowerTop + h - 0.02) / 2, -d / 2 - 0.005]}
        material={palette.wood}
      />
      <Box
        size={[w - 0.06, 0.008, 0.008]}
        position={[0, lowerTop, -d / 2 - 0.012]}
        material={palette.woodDark}
      />
      <HingedDoor
        doorId={`${seed}:vanity-left`}
        side={1}
        width={w / 2 - 0.008}
        height={lowerHeight}
        position={[-w / 2, lowerBottom, -d / 2 - 0.012]}
        material={palette.wood}
        handle={palette.metal}
      />
      <HingedDoor
        doorId={`${seed}:vanity-right`}
        side={-1}
        width={w / 2 - 0.008}
        height={lowerHeight}
        position={[w / 2, lowerBottom, -d / 2 - 0.012]}
        material={palette.wood}
        handle={palette.metal}
      />
      <Cyl radiusTop={0.18} radiusBottom={0.14} height={0.09} position={[0, h + 0.035, 0]} material={palette.white} segments={32} />
      <Cyl radiusTop={0.15} radiusBottom={0.15} height={0.015} position={[0, h + 0.085, 0]} material={{ color: "#aeb2ae", roughness: 0.3, metalness: 0.45 }} segments={32} />
      <Cyl radiusTop={0.018} radiusBottom={0.022} height={0.24} position={[0, h + 0.14, d / 2 - 0.1]} material={palette.metal} />
      <Cyl radiusTop={0.01} radiusBottom={0.01} height={0.18} position={[0, h + 0.25, d / 2 - 0.19]} rotation={[Math.PI / 2, 0, 0]} material={palette.metal} />
      <RBox size={[0.3, 0.02, 0.21]} position={[0.22, h + 0.01, 0.02]} radius={0.003} material={palette.fabricSecondary} />
      <RBox size={[0.12, 0.16, 0.07]} position={[-0.18, h + 0.08, 0.02]} radius={0.01} material={palette.ceramic} />
    </group>
  )
}

function Toilet({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w * 0.62, 0.36, d * 0.6]} position={[0, 0.18, -d * 0.08]} radius={0.05} material={palette.white} />
      <mesh position={[0, 0.39, -d * 0.05]} scale={[w * 0.48, 0.14, d * 0.38]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <SurfaceMaterial material={palette.white} />
      </mesh>
      <mesh position={[0, 0.46, -d * 0.05]} scale={[w * 0.5, 0.035, d * 0.4]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 32]} />
        <SurfaceMaterial material={palette.white} />
      </mesh>
      <RBox size={[w, 0.45, 0.17]} position={[0, h - 0.25, d / 2 - 0.085]} radius={0.025} material={palette.white} />
      <Box size={[0.12, 0.015, 0.03]} position={[0, h - 0.08, d / 2 - 0.005]} material={palette.metal} />
      <Box size={[0.04, 0.015, 0.012]} position={[0, h - 0.08, d / 2 + 0.007]} material={palette.metalDark} />
    </group>
  )
}

function Bathtub({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  return (
    <group>
      <RBox size={[w, h, d]} position={[0, h / 2, 0]} radius={0.08} material={palette.white} />
      <RBox size={[w - 0.14, h * 0.55, d - 0.14]} position={[0, h * 0.56, 0]} radius={0.06} material={palette.ceramicSecondary} />
      <mesh position={[0, h * 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.2, d - 0.2]} />
        <meshStandardMaterial color="#b8d4d6" roughness={0.06} metalness={0.2} transparent opacity={0.55} />
      </mesh>
      <Cyl radiusTop={0.022} radiusBottom={0.026} height={0.22} position={[w / 2 - 0.16, h + 0.1, d / 2 - 0.08]} material={palette.metal} />
      <Cyl radiusTop={0.011} radiusBottom={0.011} height={0.18} position={[w / 2 - 0.24, h + 0.2, d / 2 - 0.08]} rotation={[0, 0, Math.PI / 2]} material={palette.metal} />
      <RBox size={[0.22, 0.03, 0.14]} position={[-w / 2 + 0.25, h + 0.015, -d / 2 + 0.16]} radius={0.01} material={palette.ceramic} />
    </group>
  )
}

function Radiator({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  return (
    <group>
      <Cyl radiusTop={0.018} radiusBottom={0.018} height={w} position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2]} material={palette.metal} />
      <Cyl radiusTop={0.018} radiusBottom={0.018} height={w} position={[0, h - 0.1, 0]} rotation={[0, 0, Math.PI / 2]} material={palette.metal} />
      {Array.from({ length: 9 }).map((_, index) => (
        <Cyl
          key={index}
          radiusTop={0.012}
          radiusBottom={0.012}
          height={h - 0.16}
          position={[-w / 2 + 0.05 + index * ((w - 0.1) / 8), h / 2, 0]}
          material={palette.metal}
          segments={12}
        />
      ))}
      <Box size={[0.03, 0.03, 0.06]} position={[-w / 2 + 0.08, h * 0.72, 0.05]} material={palette.metalDark} />
      <Box size={[0.03, 0.03, 0.06]} position={[w / 2 - 0.08, h * 0.72, 0.05]} material={palette.metalDark} />
    </group>
  )
}

function Mirror({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  return (
    <group>
      <RBox size={[w + 0.06, h + 0.06, 0.035]} position={[0, h / 2, 0]} radius={0.01} material={palette.wood} />
      <mesh position={[0, h / 2, -0.025]}>
        <planeGeometry args={[w - 0.02, h - 0.02]} />
        <meshStandardMaterial color="#c7d2d3" roughness={0.04} metalness={1} envMapIntensity={1.6} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Déco
// ---------------------------------------------------------------------------

function Art({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  return (
    <group>
      <RBox size={[w + 0.05, h + 0.05, 0.04]} position={[0, h / 2, 0]} radius={0.006} material={palette.woodDark} />
      <mesh position={[0, h / 2, -0.025]}>
        <planeGeometry args={[w - 0.02, h - 0.02]} />
        <SurfaceMaterial material={palette.fabricLight} />
      </mesh>
      <mesh position={[-w * 0.12, h * 0.58, -0.03]}>
        <circleGeometry args={[h * 0.22, 32]} />
        <meshStandardMaterial color="#b86f50" roughness={0.85} />
      </mesh>
      <mesh position={[w * 0.16, h * 0.4, -0.03]}>
        <planeGeometry args={[w * 0.28, h * 0.34]} />
        <meshStandardMaterial color="#71816c" roughness={0.9} />
      </mesh>
      <mesh position={[w * 0.02, h * 0.76, -0.03]}>
        <planeGeometry args={[w * 0.5, 0.012]} />
        <meshStandardMaterial color="#2f3330" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Curtain({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, h } = item
  const folds = 9
  return (
    <group>
      <Cyl radiusTop={0.016} radiusBottom={0.016} height={w + 0.2} position={[0, h + 0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={palette.metal} />
      {Array.from({ length: folds }).map((_, index) => (
        <mesh
          key={index}
          position={[-w / 2 + 0.08 + index * ((w - 0.16) / (folds - 1)), h / 2, Math.sin(index * 1.8) * 0.045]}
          rotation={[0, Math.sin(index * 1.8) * 0.22, 0]}
          castShadow
        >
          <boxGeometry args={[(w - 0.1) / folds, h, 0.035]} />
          <SurfaceMaterial material={index % 2 ? palette.fabric : palette.fabricSecondary} />
        </mesh>
      ))}
    </group>
  )
}

function Vase({ palette }: { palette: Palette }) {
  const points = useMemo(
    () => [
      new THREE.Vector2(0.05, 0),
      new THREE.Vector2(0.1, 0.03),
      new THREE.Vector2(0.11, 0.16),
      new THREE.Vector2(0.065, 0.3),
      new THREE.Vector2(0.075, 0.42),
      new THREE.Vector2(0.085, 0.46),
    ],
    [],
  )
  return (
    <group>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[points, 32]} />
        <SurfaceMaterial material={palette.ceramic} />
      </mesh>
      <Cyl radiusTop={0.006} radiusBottom={0.008} height={0.34} position={[0.01, 0.58, 0]} rotation={[0, 0, 0.16]} material={palette.woodDark} />
      <Cyl radiusTop={0.005} radiusBottom={0.007} height={0.28} position={[-0.03, 0.54, 0.02]} rotation={[0.1, 0, -0.2]} material={palette.woodDark} />
      <mesh position={[0.02, 0.7, 0]} scale={[0.06, 0.09, 0.02]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <SurfaceMaterial material={palette.fabricSecondary} />
      </mesh>
      <mesh position={[-0.06, 0.64, 0.02]} scale={[0.05, 0.08, 0.018]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <SurfaceMaterial material={palette.fabric} />
      </mesh>
    </group>
  )
}

function TableLamp({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const hour = usePlanner((state) => state.ambience.hour)
  const night = hour < 7 || hour > 19
  return (
    <group>
      <Cyl radiusTop={0.08} radiusBottom={0.11} height={0.03} position={[0, 0.015, 0]} material={palette.ceramic} />
      <Cyl radiusTop={0.055} radiusBottom={0.075} height={0.22} position={[0, 0.13, 0]} material={palette.ceramic} />
      <Cyl radiusTop={0.008} radiusBottom={0.008} height={0.12} position={[0, 0.3, 0]} material={palette.metal} />
      <Cyl radiusTop={0.11} radiusBottom={0.16} height={0.2} position={[0, item.h - 0.1, 0]} material={{ color: "#efe4cf", roughness: 0.9, metalness: 0, texture: "fabric", textureScale: 0.4, sheen: 0.2, emissive: "#ffd5a0", emissiveIntensity: night ? 0.9 : 0.1 }} segments={32} open />
      <mesh position={[0, item.h - 0.12, 0]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshBasicMaterial color={night ? "#ffd9a8" : "#f3ecdf"} />
      </mesh>
      {night ? <pointLight position={[0, item.h - 0.12, 0]} intensity={2} distance={3} decay={2} color="#ffc98e" /> : null}
    </group>
  )
}

function Cushion({ item, palette }: { item: CatalogItem; palette: Palette }) {
  return (
    <RBox size={[item.w, item.h, item.d]} position={[0, item.h / 2, 0]} radius={0.08} material={palette.fabricSecondary} rotation={[-0.2, 0.2, 0.08]} />
  )
}

// ---------------------------------------------------------------------------
// Garage — Porsche 911 (996)
// ---------------------------------------------------------------------------

interface Section {
  z: number
  pts: Array<[number, number]> // (x, hauteur) dans le plan transverse
}

/** Volume lissé à partir de sections transversales (profil de caisse). */
function Loft({ sections, material }: { sections: Section[]; material: MaterialConfig }) {
  const geometry = useMemo(() => {
    const n = sections[0]!.pts.length
    const vertices: number[] = []
    const indices: number[] = []
    for (const section of sections) {
      for (const [x, y] of section.pts) vertices.push(x, y, section.z)
    }
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n
        const a = i * n + j
        const b = i * n + k
        const c = (i + 1) * n + k
        const d = (i + 1) * n + j
        indices.push(a, b, c, a, c, d)
      }
    }
    // bouchons : avant (-z, sens horaire) et arrière (+z, sens antihoraire)
    const avant = Array.from({ length: n }, (_, j) => n - 1 - j)
    const arriere = Array.from({ length: n }, (_, j) => (sections.length - 1) * n + j)
    for (let j = 1; j < n - 1; j++) {
      indices.push(avant[0]!, avant[j]!, avant[j + 1]!)
      indices.push(arriere[0]!, arriere[j]!, arriere[j + 1]!)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [sections])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <SurfaceMaterial material={material} />
    </mesh>
  )
}

/** Cotes de la 996 : caisse basse (s, demi-largeur basse, demi-largeur haut,
 *  z bord extérieur, z centre du soubassement, z ceinture) — s = 0 à l'arrière. */
const CAISSE_996: Array<[number, number, number, number, number, number]> = [
  [0.00, 0.620, 0.660, 0.26, 0.20, 0.70],
  [0.30, 0.780, 0.820, 0.18, 0.15, 0.78],
  [0.70, 0.860, 0.850, 0.30, 0.15, 0.83],
  [0.82, 0.885, 0.860, 0.44, 0.15, 0.84],
  [0.95, 0.885, 0.860, 0.52, 0.15, 0.84],
  [1.08, 0.885, 0.860, 0.44, 0.15, 0.84],
  [1.20, 0.885, 0.860, 0.30, 0.15, 0.84],
  [1.50, 0.885, 0.860, 0.17, 0.15, 0.84],
  [2.20, 0.885, 0.850, 0.16, 0.15, 0.83],
  [3.05, 0.885, 0.845, 0.28, 0.15, 0.81],
  [3.17, 0.885, 0.840, 0.44, 0.15, 0.80],
  [3.30, 0.885, 0.840, 0.52, 0.15, 0.80],
  [3.43, 0.885, 0.840, 0.44, 0.15, 0.80],
  [3.55, 0.870, 0.830, 0.28, 0.15, 0.79],
  [3.75, 0.840, 0.800, 0.19, 0.16, 0.76],
  [4.10, 0.740, 0.720, 0.24, 0.20, 0.70],
  [4.43, 0.480, 0.500, 0.30, 0.26, 0.58],
]

/** Habitacle : (s, demi-largeur base, demi-largeur haut, z base, z haut). */
const HABITACLE_996: Array<[number, number, number, number, number]> = [
  [1.05, 0.72, 0.70, 0.80, 0.82],
  [1.25, 0.74, 0.72, 0.82, 1.00],
  [1.60, 0.72, 0.68, 0.83, 1.20],
  [2.05, 0.70, 0.66, 0.83, 1.30],
  [2.45, 0.70, 0.66, 0.83, 1.30],
  [2.72, 0.76, 0.74, 0.82, 1.12],
  [3.00, 0.82, 0.80, 0.80, 0.84],
]

const demiLongueur = 4.43 / 2
const zDepuisS = (s: number) => demiLongueur - s // avant (-z) → arrière (+z)

const SECTIONS_CAISSE: Section[] = CAISSE_996.map(([s, hb, ht, ze, zc, zt]) => ({
  z: zDepuisS(s),
  pts: [
    [-hb, ze], [-hb * 0.55, zc], [hb * 0.55, zc], [hb, ze],
    [ht, zt - 0.08], [ht * 0.95, zt], [-ht * 0.95, zt], [-ht, zt - 0.08],
  ] as Array<[number, number]>,
})).reverse()

const SECTIONS_HABITACLE: Section[] = HABITACLE_996.map(([s, hb, ht, zb, zh]) => ({
  z: zDepuisS(s),
  pts: [
    [-hb, zb], [hb, zb], [ht, zh], [-ht, zh],
  ] as Array<[number, number]>,
})).reverse()

/** Silhouette stylisée mais reconnaissable d'une 996 (4,43 × 1,77 × 1,31 m).
 *  L'avant de la voiture pointe vers le `-z` local (façade à rotation 0). */
function Porsche996({
  item,
  variant,
}: {
  item: CatalogItem
  variant: FurnitureVariant
}) {
  const paint: MaterialConfig = {
    color: variant.primary,
    roughness: 0.26,
    metalness: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  }
  const paintDark: MaterialConfig = { ...paint, color: variant.secondary }
  const glass: MaterialConfig = {
    color: "#1b2429",
    roughness: 0.06,
    metalness: 0.22,
    opacity: 0.78,
    transparent: true,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    side: "double" as const,
  }
  const rubber: MaterialConfig = { color: "#141516", roughness: 0.95, metalness: 0 }
  const rimInside: MaterialConfig = { color: "#242628", roughness: 0.5, metalness: 0.65 }
  const rim: MaterialConfig = { color: "#b9bdc1", roughness: 0.3, metalness: 0.9 }
  const chrome: MaterialConfig = { color: "#d7dadc", roughness: 0.15, metalness: 0.95 }
  const headlight: MaterialConfig = {
    color: "#eef2ea", roughness: 0.2, metalness: 0.06,
    emissive: "#b9c6b4", emissiveIntensity: 0.28,
  }
  const taillight: MaterialConfig = {
    color: "#8f1616", roughness: 0.25, metalness: 0.05,
    emissive: "#6b0000", emissiveIntensity: 0.5,
  }
  const grille: MaterialConfig = { color: "#101213", roughness: 0.82, metalness: 0.1 }

  // Le modèle de référence mesure 1,77 × 4,43 × 1,31 : on s'adapte aux cotes
  // de l'instance (kind paramétrique) sans déformer les rayons de roue.
  const scale: Vec3 = [item.w / 1.77, item.h / 1.31, item.d / 4.43]
  const wheelZ = [-1.18, 1.18] as const

  return (
    <group scale={scale}>
      {/* caisse profilée (capot plongeant, ailes, arches de roues) */}
      <Loft sections={SECTIONS_CAISSE} material={paint} />

      {/* habitacle vitré fastback + pavillon */}
      <Loft sections={SECTIONS_HABITACLE} material={glass} />
      <RBox size={[1.34, 0.06, 0.92]} position={[0, 1.28, 0.1]} radius={0.028} material={paint} />

      {/* roues : pneu, jante creuse et 5 branches */}
      {([-1, 1] as const).flatMap((side) =>
        wheelZ.map((zAxle, axle) => {
          const x = side * 0.75
          const face = x + side * 0.126
          return (
            <group key={`${side}-${axle}`}>
              <Cyl radiusTop={0.32} radiusBottom={0.32} height={0.24} position={[x, 0.33, zAxle]} rotation={[0, 0, Math.PI / 2]} material={rubber} />
              <Cyl radiusTop={0.225} radiusBottom={0.225} height={0.252} position={[x, 0.33, zAxle]} rotation={[0, 0, Math.PI / 2]} material={rimInside} />
              {Array.from({ length: 5 }, (_, k) => {
                const a = (k * Math.PI * 2) / 5
                return (
                  <Box
                    key={k}
                    size={[0.014, 0.19, 0.032]}
                    position={[face, 0.33 + 0.1 * Math.cos(a), zAxle + 0.1 * Math.sin(a)]}
                    rotation={[a, 0, 0]}
                    material={rim}
                  />
                )
              })}
              <Cyl radiusTop={0.05} radiusBottom={0.05} height={0.022} position={[face + side * 0.003, 0.33, zAxle]} rotation={[0, 0, Math.PI / 2]} material={chrome} />
            </group>
          )
        }),
      )}

      {/* phares ovales signature, feux et échappements */}
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          <mesh position={[side * 0.58, 0.72, -2.06]} scale={[0.18, 0.105, 0.055]}>
            <sphereGeometry args={[1, 18, 12]} />
            <SurfaceMaterial material={grille} />
          </mesh>
          <mesh position={[side * 0.58, 0.72, -2.095]} scale={[0.15, 0.082, 0.04]}>
            <sphereGeometry args={[1, 18, 12]} />
            <SurfaceMaterial material={headlight} />
          </mesh>
          <mesh position={[side * 0.56, 0.74, 2.05]} scale={[0.17, 0.085, 0.04]}>
            <sphereGeometry args={[1, 18, 12]} />
            <SurfaceMaterial material={taillight} />
          </mesh>
          <Cyl radiusTop={0.045} radiusBottom={0.045} height={0.12} position={[side * 0.13, 0.27, 2.11]} rotation={[Math.PI / 2, 0, 0]} material={chrome} />
          <RBox size={[0.13, 0.085, 0.14]} position={[side * 0.82, 0.99, -0.62]} radius={0.03} material={paint} />
          <Box size={[0.02, 0.14, 0.32]} position={[side * 0.865, 0.58, 1.15]} material={grille} />
          <Box size={[0.06, 0.14, 0.1]} position={[side * 0.42, 0.91, 1.92]} material={paintDark} />
        </group>
      ))}

      {/* aileron arrière */}
      <RBox size={[1.36, 0.05, 0.26]} position={[0, 0.99, 1.92]} radius={0.02} material={paint} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Garage / enrobée
// ---------------------------------------------------------------------------

/** Repli procédural du carport si le GLB est absent ou en cours de chargement. */
function Carport({ item, palette }: { item: CatalogItem; palette: Palette }) {
  const { w, d, h } = item
  const postHeight = h * 0.76
  const beamHeight = h * 0.08
  const roofRise = h - postHeight - beamHeight
  const columns = 4
  return (
    <group>
      {Array.from({ length: columns }).map((_, index) => {
        const x = -w / 2 + 0.22 + (index * (w - 0.44)) / (columns - 1)
        return (
          <group key={index}>
            <RBox size={[0.14, postHeight, 0.14]} position={[x, postHeight / 2, -d / 2 + 0.2]} radius={0.01} material={palette.metalDark} />
            <RBox size={[0.14, postHeight, 0.14]} position={[x, postHeight / 2, d / 2 - 0.2]} radius={0.01} material={palette.metalDark} />
          </group>
        )
      })}
      <Box size={[w, beamHeight, d]} position={[0, postHeight + beamHeight / 2, 0]} material={palette.metalDark} />
      <Wedge size={[w, roofRise, d]} position={[0, postHeight + beamHeight, 0]} material={palette.metal} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// GLB
// ---------------------------------------------------------------------------

class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    console.warn("[planner] GLB indisponible, meuble procédural utilisé.", error)
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function GlbModel({
  url,
  item,
  rotation = 0,
}: {
  url: string
  item: CatalogItem
  rotation?: number
}) {
  const { scene } = useGLTF(url)
  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    box.getSize(size)
    const scale = Math.min(
      item.w / Math.max(size.x, 1e-4),
      item.h / Math.max(size.y, 1e-4),
      item.d / Math.max(size.z, 1e-4),
    )
    const center = new THREE.Vector3()
    box.getCenter(center)
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    clone.scale.setScalar(scale)
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return clone
  }, [item.d, item.h, item.w, scene])

  return <primitive object={prepared} rotation={[0, (rotation * Math.PI) / 180, 0]} />
}

function resolveModelUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url
  return `${import.meta.env.BASE_URL}${url.replace(/^\//, "")}`
}

export function FurnitureModel({
  item,
  variant,
  seed,
}: {
  item: CatalogItem
  variant: FurnitureVariant
  seed: string
}) {
  const palette = useMemo(() => variantPalette(variant), [variant])
  const fallback = <ProceduralModel item={item} palette={palette} seed={seed} variant={variant} />
  if (item.model) {
    return (
      <GlbBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <GlbModel url={resolveModelUrl(item.model.url)} item={item} rotation={item.model.rotation ?? 0} />
        </Suspense>
      </GlbBoundary>
    )
  }
  return fallback
}

function ProceduralModel({
  item,
  palette,
  seed,
  variant,
}: {
  item: CatalogItem
  palette: Palette
  seed: string
  variant: FurnitureVariant
}) {
  switch (item.kind) {
    case "sofaCorner":
      return <Sofa item={item} palette={palette} corner />
    case "sofa":
    case "armchair":
      return <Sofa item={item} palette={palette} />
    case "pouf":
      return <Pouf item={item} palette={palette} />
    case "coffeeTable":
      return <CoffeeTable item={item} palette={palette} />
    case "roundTable":
      return <RoundTable item={item} palette={palette} />
    case "tvUnit":
      return <TvUnit item={item} palette={palette} seed={seed} />
    case "tv":
      return <Tv item={item} palette={palette} />
    case "rug":
      return <Rug item={item} palette={palette} />
    case "plant":
      return <Plant item={item} palette={palette} />
    case "floorLamp":
      return <FloorLamp item={item} palette={palette} />
    case "shelf":
      return <Shelf item={item} palette={palette} seed={seed} />
    case "kitchenIsland":
      return <KitchenIsland item={item} palette={palette} seed={seed} />
    case "counter":
      return <Counter item={item} palette={palette} seed={seed} />
    case "fridge":
      return <Fridge item={item} palette={palette} seed={seed} />
    case "hood":
      return <Hood item={item} palette={palette} />
    case "diningTable":
      return <DiningTable item={item} palette={palette} />
    case "diningChair":
      return <DiningChair item={item} palette={palette} />
    case "pendant":
      return <Pendant item={item} palette={palette} />
    case "kitchenOvenBank":
      return <KitchenOvenBank item={item} palette={palette} seed={seed} />
    case "kitchenBase":
      return <KitchenBase item={item} palette={palette} seed={seed} />
    case "wineFridge":
      return <WineFridge item={item} palette={palette} seed={seed} />
    case "marbleTop":
      return <MarbleTop item={item} palette={palette} />
    case "blackSink":
      return <BlackSink item={item} palette={palette} />
    case "blackTap":
      return <BlackTap item={item} palette={palette} />
    case "inductionHob":
      return <InductionHob item={item} palette={palette} />
    case "angledHood":
      return <AngledHood item={item} palette={palette} />
    case "marbleIsland":
      return <MarbleIsland item={item} palette={palette} seed={seed} />
    case "wireStool":
      return <WireStool item={item} palette={palette} />
    case "smokedGlobePendant":
      return <SmokedGlobePendant item={item} palette={palette} />
    case "floatingShelf":
      return <FloatingShelf item={item} palette={palette} />
    case "bookStack":
      return <BookStack item={item} />
    case "trailingPlant":
      return <TrailingPlant item={item} palette={palette} />
    case "botanicalArt":
      return <BotanicalArt item={item} palette={palette} />
    case "cuttingBoard":
      return <CuttingBoard item={item} palette={palette} />
    case "coffeeMachine":
      return <CoffeeMachine item={item} palette={palette} />
    case "marbleBacksplash":
      return <MarbleBacksplash item={item} palette={palette} />
    case "kitchenUpper":
      return <KitchenUpper item={item} palette={palette} seed={seed} />
    case "stoneFloor":
      return <StoneFloor item={item} />
    case "bed":
      return <Bed item={item} palette={palette} />
    case "nightstand":
      return <Nightstand item={item} palette={palette} seed={seed} />
    case "wardrobe":
      return <Wardrobe item={item} palette={palette} seed={seed} />
    case "desk":
      return <Desk item={item} palette={palette} />
    case "officeChair":
      return <OfficeChair item={item} palette={palette} />
    case "shower":
      return <Shower item={item} palette={palette} />
    case "vanity":
      return <Vanity item={item} palette={palette} seed={seed} />
    case "toilet":
      return <Toilet item={item} palette={palette} />
    case "bathtub":
      return <Bathtub item={item} palette={palette} />
    case "radiator":
      return <Radiator item={item} palette={palette} />
    case "mirror":
      return <Mirror item={item} palette={palette} />
    case "art":
      return <Art item={item} palette={palette} />
    case "curtain":
      return <Curtain item={item} palette={palette} />
    case "porsche996":
      return <Porsche996 item={item} variant={variant} />
    case "carport":
      return <Carport item={item} palette={palette} />
    case "vase":
      return <Vase palette={palette} />
    case "tableLamp":
      return <TableLamp item={item} palette={palette} />
    case "cushion":
      return <Cushion item={item} palette={palette} />
    case "consoleTable":
      return <ConsoleTable item={item} palette={palette} />
    case "sideTable":
      return <SideTable item={item} palette={palette} />
    case "dishwasher":
      return <Dishwasher item={item} palette={palette} />
    case "microwave":
      return <Microwave item={item} palette={palette} />
    case "kitchenBin":
      return <KitchenBin item={item} palette={palette} />
    case "crib":
      return <Crib item={item} palette={palette} />
    case "chestOfDrawers":
      return <ChestOfDrawers item={item} palette={palette} />
    case "changingTable":
      return <ChangingTable item={item} palette={palette} />
    case "filingCabinet":
      return <FilingCabinet item={item} palette={palette} />
    case "deskLamp":
      return <DeskLamp item={item} palette={palette} />
    case "roundRug":
      return <RoundRug item={item} palette={palette} />
    case "candle":
      return <Candle item={item} palette={palette} />
    case "parasol":
      return <Parasol item={item} palette={palette} />
    case "bbq":
      return <Bbq item={item} palette={palette} />
    case "planter":
      return <Planter item={item} palette={palette} />
    case "gardenLight":
      return <GardenLight item={item} palette={palette} />
    case "bike":
      return <Bike item={item} palette={palette} />
    case "garageShelf":
      return <GarageShelf item={item} palette={palette} />
    case "evCharger":
      return <EvCharger item={item} palette={palette} />
    default:
      return (
        <RBox
          size={[item.w, item.h, item.d]}
          position={[0, item.h / 2, 0]}
          radius={0.02}
          material={palette.fabric}
        />
      )
  }
}

