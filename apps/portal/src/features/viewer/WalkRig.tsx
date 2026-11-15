import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import type { ViewerSpot } from "./spots"
import {
  anglesTowards,
  clampPitch,
  COLLISION_FAN,
  COLLISION_HEIGHTS,
  EYE_HEIGHT,
  GRAVITY,
  horizontalMove,
  LOOK_SENSITIVITY,
  MAX_STEP,
  MIN_FLOOR,
  PLAYER_RADIUS,
  RUN_SPEED,
  WALK_SPEED,
  type WalkInput,
} from "./walk"

export interface WalkMeshes {
  /** Obstacles du rez-de-chaussée : murs, cloisons, garde-corps, menuiseries, mobilier. */
  rdcWalls: THREE.Mesh[]
  /** Obstacles de l'étage (on ne teste que le niveau où l'on se trouve). */
  upperWalls: THREE.Mesh[]
  /** Surfaces portantes : dalles, sols, escalier, terrain. */
  floors: THREE.Mesh[]
}

interface WalkRigProps {
  active: boolean
  spot: ViewerSpot
  meshes: React.RefObject<WalkMeshes>
  input: WalkInput
  onLockChange: (locked: boolean) => void
}

const DOWN = new THREE.Vector3(0, -1, 0)

export function WalkRig({ active, spot, meshes, input, onLockChange }: WalkRigProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const gl = useThree((state) => state.gl)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const keys = useRef(new Set<string>())
  const player = useRef({
    x: spot.position[0],
    z: spot.position[2],
    feet: spot.position[1],
    vy: 0,
    yaw: 0,
    pitch: 0,
    camY: spot.position[1] + EYE_HEIGHT,
  })
  const origin = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const lastTouchRef = useRef<{ id: number; x: number; y: number } | null>(null)

  // Téléportation vers le point de visite demandé.
  useLayoutEffect(() => {
    if (!active) return
    const state = player.current
    state.x = spot.position[0]
    state.z = spot.position[2]
    state.feet = spot.position[1]
    state.vy = 0
    state.camY = spot.position[1] + EYE_HEIGHT
    const angles = anglesTowards(spot.position, spot.lookAt)
    state.yaw = angles.yaw
    state.pitch = angles.pitch
    camera.rotation.order = "YXZ"
    camera.position.set(state.x, state.camY, state.z)
    camera.rotation.set(state.pitch, state.yaw, 0)
  }, [active, spot, camera])

  // Clavier, souris (pointer lock) et tactile (glisser pour regarder).
  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement
    const pressed = keys.current

    function onKeyDown(event: KeyboardEvent) {
      pressed.add(event.code)
      if (event.code.startsWith("Arrow")) event.preventDefault()
    }

    function onKeyUp(event: KeyboardEvent) {
      pressed.delete(event.code)
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "touch") {
        canvas.setPointerCapture(event.pointerId)
        lastTouchRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
        return
      }
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock()
      }
    }

    function onPointerMove(event: PointerEvent) {
      const touch = lastTouchRef.current
      if (event.pointerType === "touch") {
        if (!touch || touch.id !== event.pointerId) return
        input.lookX += event.clientX - touch.x
        input.lookY += event.clientY - touch.y
        lastTouchRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
        return
      }
      if (document.pointerLockElement === canvas) {
        input.lookX += event.movementX
        input.lookY += event.movementY
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (lastTouchRef.current?.id === event.pointerId) lastTouchRef.current = null
    }

    function handleLockChange() {
      onLockChange(document.pointerLockElement === canvas)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    document.addEventListener("pointerlockchange", handleLockChange)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      document.removeEventListener("pointerlockchange", handleLockChange)
      pressed.clear()
      lastTouchRef.current = null
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      onLockChange(false)
    }
  }, [active, gl, input, onLockChange])

  function blocked(x: number, z: number, dx: number, dz: number, feet: number): boolean {
    const store = meshes.current
    if (!store) return false
    const list = feet >= 1.8 ? store.upperWalls : store.rdcWalls
    if (list.length === 0) return false
    const length = Math.hypot(dx, dz)
    if (length < 1e-7) return false
    for (const height of COLLISION_HEIGHTS) {
      for (const angle of COLLISION_FAN) {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        direction.set((dx * cos - dz * sin) / length, 0, (dx * sin + dz * cos) / length)
        origin.set(x, feet + height, z)
        raycaster.set(origin, direction)
        raycaster.near = 0
        raycaster.far = PLAYER_RADIUS + length
        if (raycaster.intersectObjects(list, false).length) return true
      }
    }
    return false
  }

  function groundHeight(x: number, z: number, feet: number): number {
    const list = meshes.current?.floors
    if (!list || list.length === 0) return Number.NEGATIVE_INFINITY
    origin.set(x, feet + 0.6, z)
    raycaster.set(origin, DOWN)
    raycaster.near = 0
    raycaster.far = 8
    const hits = raycaster.intersectObjects(list, false)
    return hits.length ? origin.y - hits[0]!.distance : Number.NEGATIVE_INFINITY
  }

  useFrame((_, delta) => {
    if (!active) return
    if (!meshes.current || meshes.current.floors.length === 0) return
    const dt = Math.min(delta, 0.05)
    const state = player.current

    state.yaw -= input.lookX * LOOK_SENSITIVITY
    state.pitch = clampPitch(state.pitch - input.lookY * LOOK_SENSITIVITY)
    input.lookX = 0
    input.lookY = 0

    let forward = 0
    let strafe = 0
    const pressed = keys.current
    if (pressed.has("KeyW") || pressed.has("ArrowUp")) forward += 1
    if (pressed.has("KeyS") || pressed.has("ArrowDown")) forward -= 1
    if (pressed.has("KeyD") || pressed.has("ArrowRight")) strafe += 1
    if (pressed.has("KeyA") || pressed.has("ArrowLeft")) strafe -= 1
    // Le stick tactile (ou un futur pad) prend le relais dès qu'il est sollicité.
    if (Math.abs(input.forward) > 0.01 || Math.abs(input.strafe) > 0.01) {
      forward = input.forward
      strafe = input.strafe
    }

    const running = input.run || pressed.has("ShiftLeft") || pressed.has("ShiftRight")
    const speed = running ? RUN_SPEED : WALK_SPEED
    const move = horizontalMove(state.yaw, forward, strafe, speed * dt)
    if (move.dx !== 0 && !blocked(state.x, state.z, move.dx, 0, state.feet)) {
      state.x += move.dx
    }
    if (move.dz !== 0 && !blocked(state.x, state.z, 0, move.dz, state.feet)) {
      state.z += move.dz
    }

    const ground = groundHeight(state.x, state.z, state.feet)
    if (
      Number.isFinite(ground) &&
      ground - state.feet <= MAX_STEP &&
      ground >= state.feet - 0.6
    ) {
      state.feet = ground
      state.vy = 0
    } else {
      state.vy -= GRAVITY * dt
      state.feet += state.vy * dt
      if (Number.isFinite(ground) && state.feet <= ground) {
        state.feet = ground
        state.vy = 0
      }
    }

    if (state.feet < MIN_FLOOR) {
      state.x = spot.position[0]
      state.z = spot.position[2]
      state.feet = spot.position[1]
      state.vy = 0
      state.camY = state.feet + EYE_HEIGHT
    }

    const targetY = state.feet + EYE_HEIGHT
    state.camY += (targetY - state.camY) * Math.min(1, dt * 14)
    camera.position.set(state.x, state.camY, state.z)
    camera.rotation.set(state.pitch, state.yaw, 0)
  })

  return null
}
