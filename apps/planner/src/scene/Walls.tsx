import { useRef, type ReactNode } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { HOUSE_CENTER, getMaterial, getWalls, wallGeometry, wallHeight, wallBase, openingSpan, wallRenderTransform } from "@/config/house"
import { usePlanner } from "@/store/planner"
import type { OpeningConfig, WallConfig } from "@/types"
import { SurfaceMaterial } from "./SurfaceMaterial"

function wallOutwardSign(wall: WallConfig): number {
  const geom = wallGeometry(wall)
  const toCenter: [number, number] = [
    HOUSE_CENTER[0] - geom.center[0],
    HOUSE_CENTER[1] - geom.center[1],
  ]
  // +Z local correspond ? l'oppos? de la normale de plan apr?s le passage en z n?gatif.
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

function WallBox({
  wall,
  x0,
  x1,
  y0,
  y1,
  materialId,
  uv,
  castShadow = true,
}: {
  wall: WallConfig
  x0: number
  x1: number
  y0: number
  y1: number
  materialId: string
  uv?: [number, number]
  castShadow?: boolean
}) {
  if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return null
  return (
    <mesh
      position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]}
      castShadow={castShadow}
      receiveShadow
    >
      <boxGeometry args={[x1 - x0, y1 - y0, wall.thickness]} />
      <SurfaceMaterial material={getMaterial(materialId)} uv={uv} />
    </mesh>
  )
}

function TrimBox({
  wall: _wall,
  x0,
  x1,
  y0,
  y1,
  z0,
  z1,
  materialId,
  castShadow = false,
}: {
  wall: WallConfig
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  materialId: string
  castShadow?: boolean
}) {
  if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return null
  return (
    <mesh
      position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}
      castShadow={castShadow}
      receiveShadow
    >
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
      <SurfaceMaterial material={getMaterial(materialId)} uv={[x1 - x0, y1 - y0]} />
    </mesh>
  )
}

function WindowUnit({
  wall,
  opening,
  a,
  b,
}: {
  wall: WallConfig
  opening: OpeningConfig
  a: number
  b: number
}) {
  const t = wall.thickness
  const frame = opening.type === "bay" ? 0.07 : 0.055
  const divisions = opening.divisions ?? 1
  const bottom = opening.sill
  const top = opening.top
  const glassDepth = 0.008
  return (
    <group>
      <TrimBox wall={wall} x0={a} x1={a + frame} y0={bottom} y1={top} z0={-0.035} z1={0.035} materialId="whitePaint" castShadow />
      <TrimBox wall={wall} x0={b - frame} x1={b} y0={bottom} y1={top} z0={-0.035} z1={0.035} materialId="whitePaint" castShadow />
      <TrimBox wall={wall} x0={a} x1={b} y0={top - frame} y1={top} z0={-0.035} z1={0.035} materialId="whitePaint" castShadow />
      <TrimBox wall={wall} x0={a} x1={b} y0={bottom} y1={bottom + frame} z0={-0.035} z1={0.035} materialId="whitePaint" castShadow />
      {Array.from({ length: Math.max(0, divisions - 1) }).map((_, index) => {
        const x = a + ((b - a) * (index + 1)) / divisions
        return (
          <TrimBox
            key={index}
            wall={wall}
            x0={x - 0.018}
            x1={x + 0.018}
            y0={bottom + frame}
            y1={top - frame}
            z0={-0.03}
            z1={0.03}
            materialId="whitePaint"
          />
        )
      })}
      <mesh position={[(a + b) / 2, (bottom + top) / 2, 0]} receiveShadow>
        <boxGeometry args={[b - a - frame * 2, top - bottom - frame * 2, glassDepth]} />
        <SurfaceMaterial material={getMaterial("glass")} envMapIntensity={1.35} />
      </mesh>
      {bottom > 0.02 ? (
        <>
          <TrimBox
            wall={wall}
            x0={a - 0.1}
            x1={b + 0.1}
            y0={bottom - 0.05}
            y1={bottom - 0.018}
            z0={-t / 2 - 0.08}
            z1={-t / 2 + 0.01}
            materialId="stone"
            castShadow
          />
          <TrimBox
            wall={wall}
            x0={a - 0.02}
            x1={b + 0.02}
            y0={bottom}
            y1={bottom + 0.03}
            z0={t / 2 - 0.01}
            z1={t / 2 + 0.05}
            materialId="stone"
          />
        </>
      ) : null}
    </group>
  )
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
      {exterior ? (
        <>
          <TrimBox wall={wall} x0={exteriorTrimA} x1={exteriorTrimB} y0={0.55} y1={height - 0.25} z0={0.025} z1={0.035} materialId="entryDoor" />
          <TrimBox wall={wall} x0={exteriorGlassA} x1={exteriorGlassB} y0={0.85} y1={height - 0.5} z0={0.025} z1={0.038} materialId="blackMetal" />
        </>
      ) : (
        <TrimBox wall={wall} x0={interiorTrimA} x1={interiorTrimB} y0={0.35} y1={height - 0.25} z0={0.024} z1={0.034} materialId={leafMaterial} />
      )}
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

function OpeningCasing({
  wall,
  a,
  b,
  top,
}: {
  wall: WallConfig
  a: number
  b: number
  top: number
}) {
  const t = wall.thickness
  const trim = 0.07
  return (
    <group>
      <TrimBox wall={wall} x0={a - trim} x1={a} y0={0} y1={top + trim} z0={-t / 2 - 0.006} z1={t / 2 + 0.006} materialId="whitePaint" />
      <TrimBox wall={wall} x0={b} x1={b + trim} y0={0} y1={top + trim} z0={-t / 2 - 0.006} z1={t / 2 + 0.006} materialId="whitePaint" />
      <TrimBox wall={wall} x0={a - trim} x1={b + trim} y0={top} y1={top + trim} z0={-t / 2 - 0.006} z1={t / 2 + 0.006} materialId="whitePaint" />
    </group>
  )
}

function Baseboards({ wall }: { wall: WallConfig }) {
  const t = wall.thickness
  const mode = wall.baseboard ?? (wall.exterior ? "auto" : "both")
  if (mode === "none") return null
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
  return (
    <group>
      {sides.map((side) =>
        spans.map(([a, b], index) => (
          <mesh
            key={`${side}-${index}`}
            position={[(a + b) / 2, 0.045, side * (t / 2 + 0.008)]}
            castShadow={false}
            receiveShadow
          >
            <boxGeometry args={[b - a, 0.09, 0.016]} />
            <SurfaceMaterial material={getMaterial("whitePaint")} uv={[b - a, 0.09]} />
          </mesh>
        )),
      )}
    </group>
  )
}

function Wall({ wall }: { wall: WallConfig }) {
  const details = usePlanner((state) => state.ambience.details)
  const view = usePlanner((state) => state.view)
  const geom = wallGeometry(wall)
  const height = wallHeight(wall)
  const base = wallBase(wall)
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

  const transform = wallRenderTransform(wall)
  return (
    <group position={[transform.position[0], base, transform.position[1]]} rotation={[0, transform.rotation, 0]}>
      <FadeGroup wall={wall}>
        {segments.map((segment, index) => (
          <WallBox
            key={index}
            wall={wall}
            x0={segment.x0}
            x1={segment.x1}
            y0={segment.y0}
            y1={segment.y1}
            materialId={wall.material}
            uv={[segment.x1 - segment.x0, segment.y1 - segment.y0]}
          />
        ))}
        {view === "plan"
          ? segments.map((segment, index) => (
              <WallBox
                key={`cap-${index}`}
                wall={wall}
                x0={segment.x0}
                x1={segment.x1}
                y0={height}
                y1={height + 0.008}
                materialId="planWall"
                castShadow={false}
              />
            ))
          : null}
        {details ? <Baseboards wall={wall} /> : null}
        {openings.map((opening) => {
          const [a, b] = openingSpan(wall, opening)
          if (opening.type === "window" || opening.type === "bay") {
            return <WindowUnit key={`${a}-${b}`} wall={wall} opening={opening} a={a} b={b} />
          }
          if (opening.type === "garage") {
            return <GarageDoor key={`${a}-${b}`} wall={wall} a={a} b={b} top={opening.top} />
          }
          if (opening.type === "door") {
            return (
              <group key={`${a}-${b}`}>
                {details ? <OpeningCasing wall={wall} a={a} b={b} top={opening.top} /> : null}
                <DoorLeaf wall={wall} opening={opening} a={a} b={b} exterior={Boolean(wall.exterior)} />
              </group>
            )
          }
          return (
            <group key={`${a}-${b}`}>
              {details ? <OpeningCasing wall={wall} a={a} b={b} top={opening.top} /> : null}
            </group>
          )
        })}
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
