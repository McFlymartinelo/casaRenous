import {
  Component,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber"
import { Edges, Html, OrbitControls, useGLTF, useProgress } from "@react-three/drei"
import * as THREE from "three"
import type { Room, RoomLevel } from "@casarenous/shared"
import { ROOM_PROGRAM } from "@casarenous/shared"
import { readTokenColor } from "@/lib/oklch"

export type ViewerLevel = "global" | "rdc" | "etage"

const MODEL_URL = "/models/casarenous.glb"
const TARGET_SPAN = 15

const ROOM_MATCH =
  /(piece-de-vie|entree|cellier|garage|chambre-parentale|chambre-[1-4]|dressing|salle-d-eau[a-z-]*|salle-de-bain|degagement|wc|terrasse-bois)/i

function roomSlugFromName(name: string): string | null {
  const match = name.match(ROOM_MATCH)
  return match ? match[1]!.toLowerCase() : null
}

function isCeiling(name: string): boolean {
  return /ceiling|plafond|roof|toit|charpente/i.test(name)
}

interface Prepared {
  root: THREE.Object3D
  scale: number
  center: THREE.Vector3
  minY: number
  maxY: number
}

function prepareModel(scene: THREE.Object3D): Prepared {
  const root = scene.clone(true)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxSpan = Math.max(size.x, size.y, size.z)
  const scale = maxSpan > 0 ? TARGET_SPAN / maxSpan : 1

  root.position.set(-center.x, -box.min.y, -center.z)
  root.updateMatrixWorld(true)

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    const slug = roomSlugFromName(mesh.name)
    if (slug) mesh.userData.roomSlug = slug
    if (isCeiling(mesh.name)) mesh.visible = false
    const material = mesh.material
    if (material && !Array.isArray(material) && "envMapIntensity" in material) {
      ;(material as THREE.MeshStandardMaterial).envMapIntensity = 0.6
    }
  })

  return { root, scale, center, minY: box.min.y, maxY: box.max.y }
}

function ModelScene({
  level,
  onSelectRoom,
}: {
  level: ViewerLevel
  onSelectRoom: (slug: string) => void
}) {
  const { scene } = useGLTF(MODEL_URL)
  const prepared = useMemo(() => prepareModel(scene), [scene])
  const groupRef = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    const root = prepared.root
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const mid = (box.min.y + box.max.y) / 2
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const name = child.name.toLowerCase()
      if (isCeiling(name)) {
        child.visible = false
        return
      }
      if (level === "global") {
        child.visible = true
        return
      }
      const namedLevel = /rdc|rez/.test(name)
        ? "rdc"
        : /etage|étage|upper|floor[_-]?2/.test(name)
          ? "etage"
          : null
      if (namedLevel) {
        child.visible = namedLevel === level
        return
      }
      const meshBox = new THREE.Box3().setFromObject(child)
      const y = (meshBox.min.y + meshBox.max.y) / 2
      child.visible = level === "rdc" ? y <= mid : y >= mid
    })
  }, [prepared, level])

  function handlePointer(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation()
    let node: THREE.Object3D | null = event.object
    while (node) {
      const slug =
        (node.userData.roomSlug as string | undefined) ?? roomSlugFromName(node.name)
      if (slug) {
        onSelectRoom(slug)
        return
      }
      node = node.parent
    }
  }

  return (
    <group
      ref={groupRef}
      scale={prepared.scale}
      onPointerDown={handlePointer}
      onPointerOver={() => {
        document.body.style.cursor = "pointer"
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto"
      }}
    >
      <primitive object={prepared.root} />
    </group>
  )
}

const PROGRAM_BY_LEVEL: Record<Exclude<RoomLevel, "exterieur">, typeof ROOM_PROGRAM> = {
  rdc: ROOM_PROGRAM.filter((room) => room.level === "rdc"),
  etage: ROOM_PROGRAM.filter((room) => room.level === "etage"),
}

function WireLevel({
  level,
  rooms,
  selectedSlug,
  onSelectRoom,
}: {
  level: "rdc" | "etage"
  rooms: Room[]
  selectedSlug?: string | null
  onSelectRoom: (slug: string) => void
}) {
  const accent = readTokenColor("--aura-accent-solid", "oklch(55% 0.132 45)")
  const line = readTokenColor("--aura-line-strong", "oklch(80% 0.025 75)")
  const floor = readTokenColor("--aura-surface-2", "oklch(95.6% 0.014 78)")
  const items = rooms.length ? rooms.filter((room) => room.level === level) : PROGRAM_BY_LEVEL[level]
  const baseY = level === "rdc" ? 0 : 3.15
  let cursor = -6.2

  const layout = items.map((room) => {
    const area = "areaM2" in room && room.areaM2 ? room.areaM2 : 6
    const width = Math.min(3.4, Math.max(1.6, Math.sqrt(area) * 0.62))
    const depth = Math.min(4.6, Math.max(1.8, area / width))
    return { room, width, depth }
  })
  const totalDepth = layout.reduce((sum, item) => sum + item.depth + 0.5, 0)
  const depthScale = totalDepth > 12.8 ? 12.8 / totalDepth : 1

  return (
    <group position={[0, baseY, 0]}>
      <mesh position={[0, 0.04, 0]} receiveShadow={false}>
        <boxGeometry args={[8.4, 0.08, 13.8]} />
        <meshStandardMaterial color={floor} roughness={0.9} />
        <Edges color={line} />
      </mesh>
      {layout.map(({ room, width, depth }, index) => {
        const x = index % 2 === 0 ? -1.9 : 1.9
        const scaledDepth = depth * depthScale
        const z = (cursor + depth / 2) * depthScale
        cursor += depth + 0.5
        const isSelected = selectedSlug === room.slug
        return (
          <group key={room.slug} position={[x, 1.3, z]}>
            <mesh
              userData={{ roomSlug: room.slug }}
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelectRoom(room.slug)
              }}
              onPointerOver={() => {
                document.body.style.cursor = "pointer"
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto"
              }}
            >
              <boxGeometry args={[width, 2.5, scaledDepth]} />
              <meshStandardMaterial
                color={isSelected ? accent : floor}
                transparent
                opacity={isSelected ? 0.62 : 0.38}
                roughness={0.65}
                metalness={0.05}
              />
              <Edges color={isSelected ? accent : line} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function WireHouse({
  level,
  rooms,
  selectedSlug,
  onSelectRoom,
}: {
  level: ViewerLevel
  rooms: Room[]
  selectedSlug?: string | null
  onSelectRoom: (slug: string) => void
}) {
  return (
    <group>
      {level !== "etage" ? (
        <WireLevel
          level="rdc"
          rooms={rooms}
          selectedSlug={selectedSlug}
          onSelectRoom={onSelectRoom}
        />
      ) : null}
      {level !== "rdc" ? (
        <WireLevel
          level="etage"
          rooms={rooms}
          selectedSlug={selectedSlug}
          onSelectRoom={onSelectRoom}
        />
      ) : null}
    </group>
  )
}

class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    console.warn("[CasaRenous] GLB indisponible, maquette filaire utilisée.", error)
  }

  override render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

function FitCamera() {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null
  const done = useRef(false)

  useLayoutEffect(() => {
    if (done.current) return
    const distance = Math.max(18, TARGET_SPAN * 1.25)
    camera.position.set(distance * 0.7, distance * 0.55, distance * 0.7)
    camera.near = 0.1
    camera.far = 200
    camera.lookAt(0, 3, 0)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(0, 3, 0)
      controls.update()
    }
    done.current = true
  }, [camera, controls])

  return null
}

function Loader() {
  const { progress, active } = useProgress()
  if (!active && progress >= 100) return null
  return (
    <Html center>
      <div className="app-viewer__overlay" style={{ position: "static" }}>
        Chargement du modèle · {Math.round(progress)} %
      </div>
    </Html>
  )
}

export default function HouseViewer({
  level,
  rooms,
  selectedSlug,
  onSelectRoom,
}: {
  level: ViewerLevel
  rooms: Room[]
  selectedSlug?: string | null
  onSelectRoom: (slug: string) => void
}) {
  const background = readTokenColor("--aura-surface-3", "oklch(92.6% 0.018 78)")

  return (
    <Canvas
      dpr={[1, 1.6]}
      frameloop="demand"
      camera={{ fov: 42, near: 0.1, far: 200, position: [14, 12, 14] }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      style={{ background }}
    >
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={[background, background, 0.6]} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-8, 6, -8]} intensity={0.35} />

      <ModelBoundary
        fallback={
          <WireHouse
            level={level}
            rooms={rooms}
            selectedSlug={selectedSlug}
            onSelectRoom={onSelectRoom}
          />
        }
      >
        <Suspense fallback={<Loader />}>
          <ModelScene level={level} onSelectRoom={onSelectRoom} />
        </Suspense>
      </ModelBoundary>

      <FitCamera />
      <OrbitControls
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={6}
        maxDistance={60}
        target={[0, 3, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={background} roughness={1} />
      </mesh>
    </Canvas>
  )
}
