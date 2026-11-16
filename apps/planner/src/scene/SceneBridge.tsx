import { useEffect, useMemo } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { getLevel } from "@/config/house"
import { usePlanner } from "@/store/planner"
import { sceneApi } from "./scene-api"

export function SceneBridge() {
  const { camera, gl, size } = useThree()
  const level = usePlanner((state) => state.level)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const point = useMemo(() => new THREE.Vector3(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])

  useEffect(() => {
    point.set(0, 0, 0)
    const elevation = getLevel(level).elevation
    sceneApi.current.screenToFloor = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      plane.constant = -elevation
      const hit = raycaster.ray.intersectPlane(plane, point)
      return hit ? [hit.x, -hit.z] : null
    }
    sceneApi.current.capture = () => {
      try {
        return gl.domElement.toDataURL("image/png")
      } catch {
        return null
      }
    }
    sceneApi.current.resetCamera = () => {
      window.dispatchEvent(new CustomEvent("planner:reset-camera"))
    }
  }, [camera, gl, level, plane, pointer, point, raycaster, size.height, size.width])

  return null
}
