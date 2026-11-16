import { useCallback, useEffect, useRef, useState } from "react"
import { MapControls, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { getCatalogItem, getItemSize } from "@/catalog/catalog"
import { HOUSE, getLevel, getWalls, wallWalkRects } from "@/config/house"
import { aabbOf } from "@/lib/placement"
import { usePlanner } from "@/store/planner"
import { sceneApi } from "./scene-api"

const orbitMemory = {
  position: new THREE.Vector3(...HOUSE.camera.position),
  target: new THREE.Vector3(...HOUSE.camera.target),
}
const planMemory = { zoom: HOUSE.camera.planZoom }
const compactMemory = {
  target: new THREE.Vector3(...HOUSE.camera.target),
  position: new THREE.Vector3(...HOUSE.camera.position)
    .sub(new THREE.Vector3(...HOUSE.camera.target))
    .multiplyScalar(1.45)
    .add(new THREE.Vector3(...HOUSE.camera.target)),
}

type ControlLike = { target: THREE.Vector3; update?: () => void }

export function CameraRig() {
  const view = usePlanner((state) => state.view)
  const level = usePlanner((state) => state.level)
  const dragging = usePlanner((state) => state.dragging)
  const rotating = usePlanner((state) => state.rotatingId !== null)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as ControlLike | null
  const size = useThree((state) => state.size)
  const compact = size.width > 0 && size.width < 720
  const memory = compact ? compactMemory : orbitMemory
  const levelConfig = getLevel(level)
  const roof = usePlanner((state) => state.ambience.roof)
  const roofMemory = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const memoryRef = useRef(memory)
  memoryRef.current = memory
  const [, setCameraVersion] = useState(0)

  const saveOrbit = useCallback(() => {
    if (!camera || !controls) return
    memory.position.copy(camera.position)
    memory.target.copy(controls.target)
  }, [camera, controls, memory])

  const savePlan = useCallback(() => {
    if (!camera) return
    const ortho = camera as THREE.OrthographicCamera
    if ("zoom" in ortho) planMemory.zoom = ortho.zoom
  }, [camera])

  useEffect(() => {
    sceneApi.current.setCamera = (position, target) => {
      const active = memoryRef.current
      active.position.set(...position)
      active.target.set(...target)
      camera.position.copy(active.position)
      if (controls) {
        controls.target.copy(active.target)
        controls.update?.()
      }
      setCameraVersion((version) => version + 1)
    }
    return () => {
      delete sceneApi.current.setCamera
    }
  }, [camera, controls])

  useEffect(() => {
    if (view !== "3d" || roof) return
    memory.target.y = levelConfig.elevation + 0.9
    if (controls) {
      controls.target.copy(memory.target)
      controls.update?.()
    }
  }, [controls, levelConfig.elevation, memory, roof, view])

  useEffect(() => {
    if (view !== "3d") return
    if (roof) {
      if (!roofMemory.current) {
        roofMemory.current = { position: memory.position.clone(), target: memory.target.clone() }
      }
      memory.position.set(18.5, 13.2, 13.0)
      memory.target.set(3.5, 2.4, -6.9)
      camera.position.copy(memory.position)
      if (controls) {
        controls.target.copy(memory.target)
        controls.update?.()
      }
    } else if (roofMemory.current) {
      memory.position.copy(roofMemory.current.position)
      memory.target.copy(roofMemory.current.target)
      camera.position.copy(memory.position)
      if (controls) {
        controls.target.copy(memory.target)
        controls.update?.()
      }
      roofMemory.current = null
    }
  }, [camera, controls, memory, roof, view])

  useEffect(() => {
    function reset() {
      if (!camera) return
      if (view === "plan") {
        const ortho = camera as THREE.OrthographicCamera
        ortho.zoom = HOUSE.camera.planZoom
        ortho.updateProjectionMatrix()
        planMemory.zoom = HOUSE.camera.planZoom
        if (controls) {
          controls.target.set(3.5, 0, -6.9)
        }
      } else if (view === "3d") {
        camera.position.set(...HOUSE.camera.position)
        memory.position.copy(camera.position)
        if (controls) {
          controls.target.set(HOUSE.camera.target[0], levelConfig.elevation + 0.9, HOUSE.camera.target[2])
          memory.target.copy(controls.target)
          controls.update?.()
        }
      }
    }
    window.addEventListener("planner:reset-camera", reset)
    return () => window.removeEventListener("planner:reset-camera", reset)
  }, [camera, controls, levelConfig.elevation, memory, view])

  if (view === "plan") {
    return (
      <>
        <OrthographicCamera
          makeDefault
          position={[3.5, 30, -6.9]}
          up={[0, 0, -1]}
          zoom={planMemory.zoom}
          near={0.1}
          far={100}
        />
        <MapControls
          makeDefault
          target={[3.5, 0, -6.9]}
          enableRotate={false}
          enableDamping
          dampingFactor={0.12}
          zoomToCursor
          minZoom={18}
          maxZoom={130}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          onEnd={savePlan}
        />
      </>
    )
  }

  if (view === "walk") {
    return (
      <PerspectiveCamera
        makeDefault
        position={[3.2, levelConfig.elevation + 1.62, -8.8]}
        fov={66}
        near={0.03}
        far={120}
      />
    )
  }

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={memory.position.toArray()}
        fov={compact || level === "etage" ? 50 : HOUSE.camera.fov}
        near={0.05}
        far={180}
      />
      <OrbitControls
        makeDefault
        target={memory.target.toArray()}
        enableDamping
        dampingFactor={0.08}
        enablePan
        minDistance={3.2}
        maxDistance={68}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2.02}
        enabled={!dragging && !rotating}
        onEnd={saveOrbit}
      />
    </>
  )
}

export function WalkController() {
  const view = usePlanner((state) => state.view)
  const level = usePlanner((state) => state.level)
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(0)
  const locked = useRef(false)
  const dragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const keys = useRef(new Set<string>())
  const velocity = useRef(new THREE.Vector3())
  const bob = useRef(0)
  const levelConfig = getLevel(level)

  useEffect(() => {
    if (view !== "walk") {
      keys.current.clear()
      if (document.pointerLockElement) document.exitPointerLock()
      locked.current = false
      return
    }
    const startPosition =
      level === "rdc"
        ? new THREE.Vector3(3.2, levelConfig.elevation + 1.62, -8.8)
        : new THREE.Vector3(3.75, levelConfig.elevation + 1.62, -9.0)
    camera.position.copy(startPosition)
    yaw.current = 0
    pitch.current = 0
    camera.rotation.order = "YXZ"
    camera.rotation.set(0, yaw.current, 0)
    velocity.current.set(0, 0, 0)

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return
      }
      keys.current.add(event.code)
      if (event.code === "Escape" && document.pointerLockElement) {
        document.exitPointerLock()
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      keys.current.delete(event.code)
    }
    function onPointerLock() {
      locked.current = document.pointerLockElement === gl.domElement
    }
    function onMouseMove(event: MouseEvent) {
      if (!locked.current) return
      yaw.current -= event.movementX * 0.0023
      pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * 0.0021, -1.38, 1.38)
    }
    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "touch") {
        dragging.current = true
        lastPointer.current = { x: event.clientX, y: event.clientY }
        return
      }
      if (!locked.current) {
        gl.domElement.requestPointerLock?.()
      }
    }
    function onPointerMove(event: PointerEvent) {
      if (!dragging.current) return
      const dx = event.clientX - lastPointer.current.x
      const dy = event.clientY - lastPointer.current.y
      lastPointer.current = { x: event.clientX, y: event.clientY }
      yaw.current -= dx * 0.005
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.0045, -1.38, 1.38)
    }
    function onPointerUp() {
      dragging.current = false
    }
    function onBlur() {
      keys.current.clear()
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    document.addEventListener("pointerlockchange", onPointerLock)
    window.addEventListener("mousemove", onMouseMove)
    gl.domElement.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      document.removeEventListener("pointerlockchange", onPointerLock)
      window.removeEventListener("mousemove", onMouseMove)
      gl.domElement.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [camera, gl, level, levelConfig.elevation, view])

  return <WalkMover camera={camera} keys={keys} yaw={yaw} pitch={pitch} velocity={velocity} bob={bob} level={level} active={view === "walk"} />
}

function WalkMover({
  camera,
  keys,
  yaw,
  pitch,
  velocity,
  bob,
  level,
  active,
}: {
  camera: THREE.Camera
  keys: React.RefObject<Set<string>>
  yaw: React.RefObject<number>
  pitch: React.RefObject<number>
  velocity: React.RefObject<THREE.Vector3>
  bob: React.RefObject<number>
  level: "rdc" | "etage"
  active: boolean
}) {
  useWalkFrame(camera, keys, yaw, pitch, velocity, bob, level, active)
  return null
}


function useWalkFrame(
  camera: THREE.Camera,
  keys: React.RefObject<Set<string>>,
  yaw: React.RefObject<number>,
  pitch: React.RefObject<number>,
  velocity: React.RefObject<THREE.Vector3>,
  bob: React.RefObject<number>,
  level: "rdc" | "etage",
  active: boolean,
) {
  const storeLevel = usePlanner((state) => state.level)
  useFrame((_, delta) => {
    if (!active) return
    const dt = Math.min(delta, 0.05)
    const set = keys.current
    if (!set) return
    const forward = Number(set.has("KeyW") || set.has("KeyZ")) - Number(set.has("KeyS"))
    const strafe = Number(set.has("KeyD")) - Number(set.has("KeyA") || set.has("KeyQ"))
    const running = set.has("ShiftLeft") || set.has("ShiftRight")
    const speed = running ? 3.4 : 1.85
    const length = Math.hypot(forward, strafe)
    const target = new THREE.Vector3()
    if (length > 0) {
      const f = forward / length
      const s = strafe / length
      const fwd = new THREE.Vector3(-Math.sin(yaw.current ?? 0), 0, -Math.cos(yaw.current ?? 0))
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
      target.addScaledVector(fwd, f * speed).addScaledVector(right, s * speed)
    }
    velocity.current?.lerp(target, 1 - Math.exp(-12 * dt))
    const move = velocity.current ?? new THREE.Vector3()
    const current = camera.position
    const radius = 0.24
    const walls = wallWalkRectsForLevel(storeLevel)
    const furniture = furnitureRects(storeLevel)
    const blocked = (x: number, z: number): boolean => {
      for (const rect of walls) {
        if (x > rect[0] - radius && x < rect[2] + radius && z > rect[1] - radius && z < rect[3] + radius) return true
      }
      for (const rect of furniture) {
        if (x > rect[0] - radius && x < rect[2] + radius && z > rect[1] - radius && z < rect[3] + radius) return true
      }
      return false
    }
    const nextX = current.x + move.x * dt
    if (!blocked(nextX, current.z)) current.x = nextX
    const nextZ = current.z + move.z * dt
    if (!blocked(current.x, nextZ)) current.z = nextZ
    const speedNow = Math.hypot(move.x, move.z)
    bob.current = (bob.current ?? 0) + dt * (4 + speedNow * 2.4)
    const bobAmount = Math.min(0.012, speedNow * 0.004)
    const eye = getLevel(level).elevation + 1.62
    current.y = eye + Math.sin(bob.current) * bobAmount
    camera.rotation.order = "YXZ"
    camera.rotation.set(pitch.current ?? 0, yaw.current ?? 0, 0)
  })
}

function wallWalkRectsForLevel(level: "rdc" | "etage") {
  return getWalls(level).flatMap(wallWalkRects)
}


function furnitureRects(level: "rdc" | "etage") {
  const state = usePlanner.getState()
  const rects = state.furniture
    .filter((item) => item.level === level)
    .map((item) => {
      const catalog = getCatalogItem(item.catalogId)
      if (catalog.allowOverlap || (item.elevation ?? catalog.elevation ?? 0) > 0.9) return null
      const size = getItemSize(item)
      const [x0, z0, x1, z1] = aabbOf({ x: item.x, z: item.z, w: size.w, d: size.d, rotation: item.rotation })
      return [x0, -z1, x1, -z0] as [number, number, number, number]
    })
    .filter((rect): rect is [number, number, number, number] => rect !== null)
  // L'escalier est un volume plein : on ne le traverse pas en visite.
  if (level === "rdc") rects.push([3.92, -8.1, 6.62, -7.2])
  return rects
}
