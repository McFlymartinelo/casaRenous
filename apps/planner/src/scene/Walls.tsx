import { useRef, type ReactNode } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { HOUSE_CENTER, getMaterial, getWalls, wallGeometry, wallHeight, wallBase, openingSpan, wallRenderTransform } from "@/config/house"
import { usePlanner } from "@/store/planner"
import type { OpeningConfig, WallConfig } from "@/types"
import { MergedBoxes, pushBox, type BoxSpec } from "./MergedBoxes"
import { SurfaceMaterial } from "./SurfaceMaterial"

function wallOutwardSign(wall: WallConfig): number {
  const geom = wallGeometry(wall)
  const toCenter: [number, number] = [
    HOUSE_CENTER[0] - geom.center[0],
    HOUSE_CENTER[1] - geom.center[1],
  ]
  // +Z local correspond à l'opposé de la normale de plan après le passage en z négatif.
  return geom.normal[0] * toCenter[0] + geom.normal[1] * toCenter[1] >= 0 ? -1 : 1
}

function FadeGroup({
  wall,
  children,
}: {
  wall: WallConfig
  children: ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)
  const cutaway = usePlanner((state) => state.ambience.cutaway)
  const view = usePlanner((state) => state.view)
  const roof = usePlanner((state) => state.ambience.roof)
  const factor = useRef(1)
  const applied = useRef(-1)
  const lastCut = useRef(false)
  const geom = wallGeometry(wall)
  const base = wallBase(wall)
  const height = wallHeight(wall)

  useFrame((_, delta) => {
    if (!group.current) return
    let target = 1
    if (cutaway && view === "3d" && wall.exterior) {
      const center = new THREE.Vector3(geom.center[0], base + height * 0.5, -geom.center[1])
      const toCamera = camera.position.clone().sub(center)
      const toHouse = new THREE.Vector3(HOUSE_CENTER[0] - geom.center[0], 0, -(HOUSE_CENTER[1] - geom.center[1]))
      if (toCamera.x * toHouse.x + toCamera.z * toHouse.z < -0.02) target = roof ? 0.1 : 0.05
    }
    const next = THREE.MathUtils.damp(factor.current, target, 9, delta)
    const cut = cutaway && view === "3d"
    const force = lastCut.current !== cut
    lastCut.current = cut
    factor.current = next
    if (!force && Math.abs(next - applied.current) < 0.002) return
    applied.current = next
    const transparent = next < 0.985
    group.current.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      if (mesh.userData.baseCastShadow === undefined) {
        mesh.userData.baseCastShadow = mesh.castShadow
      }
      mesh.castShadow =
        Boolean(mesh.userData.baseCastShadow) &&
        (!wall.exterior || !cut || next > 0.55) &&
        next > 0.55
      mesh.renderOrder = transparent ? 20 : 0
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial
        if (standard.userData.baseOpacity === undefined) {
          standard.userData.baseOpacity = standard.opacity
          standard.userData.baseTransparent = standard.transparent
        }
        const baseOpacity = standard.userData.baseOpacity as number
        const shouldBeTransparent = transparent || baseOpacity < 0.999
        if (standard.transparent !== shouldBeTransparent) {
          standard.transparent = shouldBeTransparent
          standard.needsUpdate = true
        }
        standard.opacity = baseOpacity * next
        standard.depthWrite = !transparent && baseOpacity > 0.5
      }
    })
  })

  return <group ref={group}>{children}</group>
}

function windowBoxes(wall: WallConfig, opening: OpeningConfig, a: number, b: number): BoxSpec[] {
  const t = wall.thickness
  const frame = opening.type === "bay" ? 0.07 : 0.055
  const divisions = opening.divisions ?? 1
  const bottom = opening.sill
  const top = opening.top
  const boxes: BoxSpec[] = []

  pushBox(boxes, { x0: a, x1: a + frame, y0: bottom, y1: top, z0: -0.035, z1: 0.035, materialId: "whitePaint", castShadow: true })
  pushBox(boxes, { x0: b - frame, x1: b, y0: bottom, y1: top, z0: -0.035, z1: 0.035, materialId: "whitePaint", castShadow: true })
  pushBox(boxes, { x0: a, x1: b, y0: top - frame, y1: top, z0: -0.035, z1: 0.035, materialId: "whitePaint", castShadow: true })
  pushBox(boxes, { x0: a, x1: b, y0: bottom, y1: bottom + frame, z0: -0.035, z1: 0.035, materialId: "whitePaint", castShadow: true })

  for (let index = 0; index < Math.max(0, divisions - 1); index += 1) {
    const x = a + ((b - a) * (index + 1)) / divisions
    pushBox(boxes, { x0: x - 0.018, x1: x + 0.018, y0: bottom + frame, y1: top - frame, z0: -0.03, z1: 0.03, materialId: "whitePaint" })
  }

  if (bottom > 0.02) {
    pushBox(boxes, { x0: a - 0.1, x1: b + 0.1, y0: bottom - 0.05, y1: bottom - 0.018, z0: -t / 2 - 0.08, z1: -t / 2 + 0.01, materialId: "stone", castShadow: true })
    pushBox(boxes, { x0: a - 0.02, x1: b + 0.02, y0: bottom, y1: bottom + 0.03, z0: t / 2 - 0.01, z1: t / 2 + 0.05, materialId: "stone" })
  }
  return boxes
}

function windowGlass(wall: WallConfig, opening: OpeningConfig, a: number, b: number): ReactNode {
  const frame = opening.type === "bay" ? 0.07 : 0.055
  return (
    <mesh key={`glass-${a}-${b}`} position={[(a + b) / 2, (opening.sill + opening.top) / 2, 0]} receiveShadow>
      <boxGeometry args={[b - a - frame * 2, opening.top - opening.sill - frame * 2, 0.008]} />
      <SurfaceMaterial material={getMaterial("glass")} envMapIntensity={1.35} />
    </mesh>
  )
}

function casingBoxes(wall: WallConfig, a: number, b: number, top: number): BoxSpec[] {
  const t = wall.thickness
  const trim = 0.07
  return [
    { x0: a - trim, x1: a, y0: 0, y1: top + trim, z0: -t / 2 - 0.006, z1: t / 2 + 0.006, materialId: "whitePaint" },
    { x0: b, x1: b + trim, y0: 0, y1: top + trim, z0: -t / 2 - 0.006, z1: t / 2 + 0.006, materialId: "whitePaint" },
    { x0: a - trim, x1: b + trim, y0: top, y1: top + trim, z0: -t / 2 - 0.006, z1: t / 2 + 0.006, materialId: "whitePaint" },
  ]
}

function baseboardBoxes(wall: WallConfig): BoxSpec[] {
  const t = wall.thickness
  const mode = wall.baseboard ?? (wall.exterior ? "auto" : "both")
  if (mode === "none") return []
  const sides: number[] = mode === "both" ? [1, -1] : mode === "auto" ? [wallOutwardSign(wall)] : [1]
  const cuts = (wall.openings ?? [])
    .filter((opening) => opening.sill <= 0.02)
    .map((opening) => openingSpan(wall, opening))
    .sort((a, b) => a[0] - b[0])
  const spans: [number, number][] = []
  let cursor = 0
  for (const [a, b] of cuts) {
    if (a > cursor + 0.005) spans.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < wallGeometry(wall).length - 0.005) spans.push([cursor, wallGeometry(wall).length])

  const boxes: BoxSpec[] = []
  for (const side of sides) {
    for (const [a, b] of spans) {
      const offset = side * (t / 2 + 0.008)
      pushBox(boxes, {
        x0: a,
        x1: b,
        y0: 0,
        y1: 0.09,
        z0: offset - 0.008,
        z1: offset + 0.008,
        materialId: "whitePaint",
      })
    }
  }
  return boxes
}

function DoorLeaf({
  wall,
  opening,
  a,
  b,
  exterior,
}: {
  wall: WallConfig
  opening: OpeningConfig
  a: number
  b: number
  exterior: boolean
}) {
  const width = b - a - 0.035
  const height = opening.top - 0.03
  const hinge = opening.hinge ?? "start"
  const swing = opening.swing ?? 1
  const leafMaterial = exterior ? "entryDoor" : wall.material === "doorPaint" ? "doorPaint" : "whitePaint"
  const hingeX = hinge === "start" ? a + 0.015 : b - 0.015
  const direction = hinge === "start" ? 1 : -1
  const defaultOpen = false
  const exteriorTrimA = Math.min(direction * 0.06, direction * (width - 0.06))
  const exteriorTrimB = Math.max(direction * 0.06, direction * (width - 0.06))
  const exteriorGlassA = Math.min(direction * 0.09, direction * (width - 0.09))
  const exteriorGlassB = Math.max(direction * 0.09, direction * (width - 0.09))
  const interiorTrimA = Math.min(direction * 0.08, direction * (width - 0.08))
  const interiorTrimB = Math.max(direction * 0.08, direction * (width - 0.08))
  const doorKey = `house:${wall.id}:${a.toFixed(3)}-${b.toFixed(3)}`
  const tool = usePlanner((state) => state.tool)
  const storedOpen = usePlanner((state) => state.openDoors[doorKey])
  const toggleDoor = usePlanner((state) => state.toggleDoor)
  const open = storedOpen ?? defaultOpen
  const group = useRef<THREE.Group>(null)

  const trims: BoxSpec[] = []
  if (exterior) {
    pushBox(trims, { x0: exteriorTrimA, x1: exteriorTrimB, y0: 0.55, y1: height - 0.25, z0: 0.025, z1: 0.035, materialId: "entryDoor" })
    pushBox(trims, { x0: exteriorGlassA, x1: exteriorGlassB, y0: 0.85, y1: height - 0.5, z0: 0.025, z1: 0.038, materialId: "blackMetal" })
  } else {
    pushBox(trims, { x0: interiorTrimA, x1: interiorTrimB, y0: 0.35, y1: height - 0.25, z0: 0.024, z1: 0.034, materialId: leafMaterial })
  }

  useFrame((_, delta) => {
    if (!group.current) return
    const target = open ? 1.12 * swing : 0
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      target,
      9,
      Math.min(delta, 0.05),
    )
  })

  return (
    <group
      ref={group}
      name={`house-door-${doorKey}`}
      position={[hingeX, 0, 0]}
      onPointerDown={(event) => {
        if (tool !== "doors") return
        event.stopPropagation()
        toggleDoor(doorKey, defaultOpen)
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
      <mesh position={[(direction * width) / 2, height / 2 + 0.015, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.045]} />
        <SurfaceMaterial material={getMaterial(leafMaterial)} uv={[width, height]} />
      </mesh>
      <MergedBoxes boxes={trims} />
      <mesh position={[direction * (width - 0.09), 1.02, -0.045]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.1, 12]} />
        <SurfaceMaterial material={getMaterial("metal")} />
      </mesh>
      <mesh position={[direction * (width - 0.09), 1.02, -0.095]} castShadow>
        <sphereGeometry args={[0.024, 12, 10]} />
        <SurfaceMaterial material={getMaterial("metal")} />
      </mesh>
    </group>
  )
}

function GarageDoor({ wall: _wall, a, b, top }: { wall: WallConfig; a: number; b: number; top: number }) {
  const panel = top - 0.03
  return (
    <group>
      <mesh position={[(a + b) / 2, panel / 2 + 0.015, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[b - a - 0.04, panel, 0.06]} />
        <SurfaceMaterial material={getMaterial("garageDoor")} uv={[b - a, panel]} />
      </mesh>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <mesh key={ratio} position={[(a + b) / 2, 0.015 + panel * ratio, -0.093]}>
          <boxGeometry args={[b - a - 0.1, 0.018, 0.008]} />
          <meshStandardMaterial color="#9d9a92" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[(a + b) / 2, 0.12, -0.095]}>
        <boxGeometry args={[0.34, 0.035, 0.012]} />
        <meshStandardMaterial color="#72736f" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[(a + b) / 2, 0.012, -0.05]}>
        <boxGeometry args={[b - a, 0.03, 0.008]} />
        <meshStandardMaterial color="#2e302d" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Wall({ wall }: { wall: WallConfig }) {
  const details = usePlanner((state) => state.ambience.details)
  const view = usePlanner((state) => state.view)
  const geom = wallGeometry(wall)
  const height = wallHeight(wall)
  const base = wallBase(wall)
  const t = wall.thickness
  const openings = [...(wall.openings ?? [])].sort(
    (a, b) => openingSpan(wall, a)[0] - openingSpan(wall, b)[0],
  )
  const segments: { x0: number; x1: number; y0: number; y1: number }[] = []
  let cursor = 0
  for (const opening of openings) {
    const [a, b] = openingSpan(wall, opening)
    if (a > cursor) segments.push({ x0: cursor, x1: a, y0: 0, y1: height })
    if (opening.sill > 0.002) segments.push({ x0: a, x1: b, y0: 0, y1: opening.sill })
    if (opening.top < height - 0.002) segments.push({ x0: a, x1: b, y0: opening.top, y1: height })
    cursor = b
  }
  if (cursor < geom.length) segments.push({ x0: cursor, x1: geom.length, y0: 0, y1: height })

  const boxes: BoxSpec[] = []
  const extras: ReactNode[] = []
  for (const segment of segments) {
    pushBox(boxes, {
      x0: segment.x0,
      x1: segment.x1,
      y0: segment.y0,
      y1: segment.y1,
      z0: -t / 2,
      z1: t / 2,
      materialId: wall.material,
      castShadow: true,
    })
  }
  if (view === "plan") {
    for (const segment of segments) {
      pushBox(boxes, {
        x0: segment.x0,
        x1: segment.x1,
        y0: height,
        y1: height + 0.008,
        z0: -t / 2,
        z1: t / 2,
        materialId: "planWall",
      })
    }
  }
  if (details) boxes.push(...baseboardBoxes(wall))

  for (const opening of openings) {
    const [a, b] = openingSpan(wall, opening)
    if (opening.type === "window" || opening.type === "bay") {
      boxes.push(...windowBoxes(wall, opening, a, b))
      extras.push(windowGlass(wall, opening, a, b))
    } else if (opening.type === "garage") {
      extras.push(<GarageDoor key={`garage-${a}-${b}`} wall={wall} a={a} b={b} top={opening.top} />)
    } else if (opening.type === "door") {
      if (details) boxes.push(...casingBoxes(wall, a, b, opening.top))
      extras.push(
        <DoorLeaf key={`door-${a}-${b}`} wall={wall} opening={opening} a={a} b={b} exterior={Boolean(wall.exterior)} />,
      )
    } else if (details) {
      boxes.push(...casingBoxes(wall, a, b, opening.top))
    }
  }

  const transform = wallRenderTransform(wall)
  return (
    <group position={[transform.position[0], base, transform.position[1]]} rotation={[0, transform.rotation, 0]}>
      <FadeGroup wall={wall}>
        <MergedBoxes boxes={boxes} />
        {extras}
      </FadeGroup>
    </group>
  )
}

export function Walls({ level }: { level: "rdc" | "etage" }) {
  const walls = getWalls(level)
  return (
    <group>
      {walls.map((wall) => (
        <Wall key={wall.id} wall={wall} />
      ))}
    </group>
  )
}
