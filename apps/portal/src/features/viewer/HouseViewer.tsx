import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber"
import { Edges, OrbitControls, useGLTF, useProgress } from "@react-three/drei"
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import type { Room, RoomLevel } from "@casarenous/shared"
import { ROOM_PROGRAM } from "@casarenous/shared"
import { readTokenColor } from "@/lib/oklch"
import { TouchStick } from "./TouchStick"
import { WalkRig, type WalkMeshes } from "./WalkRig"
import { createWalkInput } from "./walk"
import type { ViewerMode, ViewerSpot } from "./spots"
import { QualityMonitor, dprForTier, initialDpr, type QualitySample } from "./QualityMonitor"

export type ViewerLevel = "global" | "rdc" | "etage"
export type { ViewerMode, ViewerSpot }

const MODEL_URL = "/models/casarenous.glb"

/** Plafond de résolution : au-delà, le gain visuel est nul et le coût GPU explose. */
const MAX_DPR = 1.5

/** Repère du modèle : maison de x 0 → 7,00, z 0 → -13,80, sols à y 0 et 2,82. */
const HOUSE_CENTER: [number, number, number] = [3.5, 1.4, -6.9]
const OVERVIEW: [number, number, number] = [17.5, 12, 9.5]

const ROOM_MATCH =
  /(piece-de-vie|entree|cellier|garage|chambre-parentale|chambre-[1-4]|dressing|salle-d-eau[a-z-]*|salle-de-bain|degagement[a-z-]*|wc[a-z-]*|placard|terrasse-bois)/i

function roomSlugFromName(name: string): string | null {
  const match = name.match(ROOM_MATCH)
  return match ? match[1]!.toLowerCase() : null
}

type MeshCategory = "rdc" | "upper" | "roof" | "ceiling" | "site" | "other"

function categorize(name: string): MeshCategory {
  if (/^site/i.test(name)) return "site"
  if (/plafond/i.test(name)) return "ceiling"
  if (/^toiture/i.test(name)) return "roof"
  if (/^etage/i.test(name)) return "upper"
  if (/^rdc/i.test(name)) return "rdc"
  return "other"
}

/** Murs, cloisons, garde-corps, encadrements, mobilier : autant d'obstacles. */
function isWallMesh(name: string): boolean {
  if (/(Murs|Cloisons|Escalier|Garde_corps|Mobilier|Encadrements)/i.test(name)) return true
  return /menuiseries/i.test(name) && !/vitrage|porte_entree/i.test(name)
}

/** Surfaces sur lesquelles on peut marcher (le plafond de toiture est exclu). */
function isFloorMesh(name: string): boolean {
  return (
    /(Dalles|Fondations|Escalier|herbe|pave|bois_terrasse)/i.test(name) &&
    !/plafond/i.test(name)
  )
}

interface Prepared {
  root: THREE.Object3D
  meshes: WalkMeshes
}

function prepareModel(scene: THREE.Object3D): Prepared {
  const root = scene.clone(true)
  const meshes: WalkMeshes = { rdcWalls: [], upperWalls: [], floors: [] }
  const seenMaterials = new Set<THREE.Material>()

  root.updateMatrixWorld(true)
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const name = mesh.name || ""
    const category = categorize(name)
    mesh.userData.category = category

    const slug = roomSlugFromName(name)
    if (slug) mesh.userData.roomSlug = slug

    mesh.castShadow = category !== "site" && !/vitrage/i.test(name)
    mesh.receiveShadow = category === "rdc" || category === "upper" || category === "site"

    if (isWallMesh(name)) {
      ;(category === "upper" ? meshes.upperWalls : meshes.rdcWalls).push(mesh)
    }
    if (isFloorMesh(name)) meshes.floors.push(mesh)

    if (category === "roof" || category === "ceiling") mesh.visible = false

    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    const list = Array.isArray(material) ? material : material ? [material] : []
    for (const item of list) {
      if (!item || seenMaterials.has(item)) continue
      seenMaterials.add(item)
      const standard = item as THREE.MeshStandardMaterial
      if ("envMapIntensity" in standard) {
        standard.envMapIntensity = standard.transparent
          ? 1.2
          : 0.35 + 0.65 * (standard.metalness ?? 0)
      }
      if (standard.transparent) standard.depthWrite = false
    }
  })

  return { root, meshes }
}

function applyVisibility(
  prepared: Prepared,
  level: ViewerLevel,
  mode: ViewerMode,
  showRoof: boolean,
) {
  const roofVisible = mode === "walk" ? false : showRoof
  prepared.root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const category = (child.userData.category as MeshCategory | undefined) ?? "other"
    switch (category) {
      case "ceiling":
        mesh.visible = false
        break
      case "roof":
        mesh.visible = roofVisible
        break
      case "site":
        mesh.visible = true
        break
      case "rdc":
        mesh.visible = mode === "walk" || level !== "etage"
        break
      case "upper":
        mesh.visible = mode === "walk" || level !== "rdc"
        break
      default:
        mesh.visible = true
    }
  })
}

function ModelScene({
  level,
  mode,
  showRoof,
  onSelectRoom,
  meshesRef,
}: {
  level: ViewerLevel
  mode: ViewerMode
  showRoof: boolean
  onSelectRoom: (slug: string) => void
  meshesRef: React.RefObject<WalkMeshes>
}) {
  const { scene } = useGLTF(MODEL_URL)
  const prepared = useMemo(() => prepareModel(scene), [scene])

  useLayoutEffect(() => {
    meshesRef.current = prepared.meshes
  }, [prepared, meshesRef])

  useLayoutEffect(() => {
    applyVisibility(prepared, level, mode, showRoof)
  }, [prepared, level, mode, showRoof])

  function handlePointer(event: ThreeEvent<PointerEvent>) {
    if (mode !== "orbit") return
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
      onPointerDown={handlePointer}
      onPointerOver={() => {
        if (mode === "orbit") document.body.style.cursor = "pointer"
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
    <group position={[HOUSE_CENTER[0], 0, HOUSE_CENTER[2]]}>
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

function CameraDirector({ mode }: { mode: ViewerMode }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null

  useLayoutEffect(() => {
    if (mode !== "orbit") return
    camera.position.set(...OVERVIEW)
    camera.near = 0.05
    camera.far = 300
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(...HOUSE_CENTER)
      controls.update()
    }
  }, [mode, camera, controls])

  return null
}

function SceneEnvironment() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl)
    const texture = generator.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = texture
    scene.environmentIntensity = 0.3
    generator.dispose()
    return () => {
      scene.environment = null
      texture.dispose()
    }
  }, [gl, scene])

  return null
}

function DebugBridge() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const scope = window as unknown as Record<string, unknown>
    scope.__casaViewer = { gl, scene, camera }
    document.documentElement.dataset.viewerDebug = "on"
    return () => {
      delete scope.__casaViewer
      delete document.documentElement.dataset.viewerDebug
    }
  }, [gl, scene, camera])

  return null
}

export default function HouseViewer({
  mode,
  level,
  showRoof,
  spot,
  rooms,
  selectedSlug,
  onSelectRoom,
}: {
  mode: ViewerMode
  level: ViewerLevel
  showRoof: boolean
  spot: ViewerSpot
  rooms: Room[]
  selectedSlug?: string | null
  onSelectRoom: (slug: string) => void
}) {
  const background = readTokenColor("--aura-surface-3", "oklch(92.6% 0.018 78)")
  const skyTint = readTokenColor("--aura-ink-3", "oklch(68% 0.012 250)")
  const groundTint = readTokenColor("--aura-surface-3", "oklch(92.6% 0.018 78)")
  const sunTint = readTokenColor("--aura-accent-soft", "oklch(95.5% 0.028 45)")
  const { active: loadingModel, progress } = useProgress()
  const [sample, setSample] = useState<QualitySample>({ tier: "high", fps: 0 })
  const handleSample = useCallback((next: QualitySample) => {
    setSample(next)
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__casaViewerQuality = next
    }
  }, [])
  const quality = sample.tier
  const maxDpr = initialDpr(MAX_DPR)
  const dpr = dprForTier(quality, maxDpr)
  const input = useMemo(() => createWalkInput(), [])
  const meshesRef = useRef<WalkMeshes>({ rdcWalls: [], upperWalls: [], floors: [] })
  const [locked, setLocked] = useState(false)
  const coarsePointer = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    [],
  )
  const handleLock = useCallback((value: boolean) => setLocked(value), [])
  const lightTarget = useMemo(() => {
    const target = new THREE.Object3D()
    target.position.set(...HOUSE_CENTER)
    return target
  }, [])

  return (
    <>
      <Canvas
        dpr={dpr}
        shadows
        frameloop={mode === "walk" ? "always" : "demand"}
        camera={{ fov: 45, near: 0.05, far: 300, position: OVERVIEW }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ background }}
      >
        <color attach="background" args={[background]} />
        <SceneEnvironment />
        <hemisphereLight args={[skyTint, groundTint, 0.28]} />
        <ambientLight intensity={0.04} />
        <primitive object={lightTarget} />
        <directionalLight
          target={lightTarget}
          position={[HOUSE_CENTER[0] + 14, 20, HOUSE_CENTER[2] + 12]}
          intensity={3.1}
          color={sunTint}
          castShadow={quality !== "low"}
          shadow-mapSize-width={quality === "low" ? 512 : 1024}
          shadow-mapSize-height={quality === "low" ? 512 : 1024}
          shadow-camera-left={-18}
          shadow-camera-right={18}
          shadow-camera-top={18}
          shadow-camera-bottom={-18}
          shadow-camera-near={1}
          shadow-camera-far={80}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />

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
          <Suspense fallback={null}>
            <ModelScene
              level={level}
              mode={mode}
              showRoof={showRoof}
              onSelectRoom={onSelectRoom}
              meshesRef={meshesRef}
            />
          </Suspense>
        </ModelBoundary>

        <WalkRig
          active={mode === "walk"}
          spot={spot}
          meshes={meshesRef}
          input={input}
          onLockChange={handleLock}
        />
        <CameraDirector mode={mode} />
        <DebugBridge />
        <QualityMonitor maxDpr={maxDpr} onSample={handleSample} />
        {mode === "orbit" ? (
          <OrbitControls
            makeDefault
            enablePan
            enableDamping
            dampingFactor={0.08}
            minPolarAngle={Math.PI / 12}
            maxPolarAngle={Math.PI / 2.05}
            minDistance={5}
            maxDistance={70}
            target={HOUSE_CENTER}
          />
        ) : null}
      </Canvas>

      {quality !== "high" ? (
        <div
          className="app-viewer__quality"
          title={`Qualité ajustée automatiquement · ${Math.round(sample.fps)} images/s mesurées`}
        >
          Qualité auto · {quality === "low" ? "réduite" : "moyenne"} · {Math.round(sample.fps)} i/s
        </div>
      ) : null}

      {loadingModel ? (
        <div className="app-viewer__loading">
          Chargement du modèle — {Math.round(progress)} %
        </div>
      ) : null}

      {mode === "walk" ? (
        <>
          <TouchStick input={input} />
          <div className="app-viewer__hint">
            {coarsePointer
              ? "Glisse pour regarder autour • stick en bas à gauche pour avancer"
              : locked
                ? "ZQSD / WASD pour marcher • Maj pour courir • Échap pour libérer la souris"
                : "Clique dans la vue pour regarder autour • ZQSD / WASD pour marcher"}
          </div>
          {locked ? <div className="app-viewer__cross" aria-hidden="true" /> : null}
        </>
      ) : null}
    </>
  )
}
