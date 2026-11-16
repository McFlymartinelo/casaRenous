import { Suspense, useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { usePlanner } from "@/store/planner"
import { isFootprintValid } from "@/lib/place"
import { CameraRig, WalkController } from "./CameraRig"
import { Effects } from "./Effects"
import { DragController, FloorInteractions, FurnitureLayer, MeasureOverlay, SelectionOverlay } from "./Furniture"
import { Floors } from "./Floors"
import { Lighting } from "./Lighting"
import { GridOverlay, PlanLabels } from "./PlanLabels"
import { Roof } from "./Roof"
import { SceneBridge } from "./SceneBridge"
import { sceneApi } from "./scene-api"
import { Site } from "./Site"
import { Stairs } from "./Stairs"
import { Walls } from "./Walls"

function DebugBridge() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const scope = window as unknown as Record<string, unknown>
    scope.__planner = { gl, scene, camera, controls, sceneApi }
    scope.__plannerStore = usePlanner
    scope.__THREE = THREE
    scope.__plannerCheckAll = () =>
      usePlanner.getState().furniture.map((item) => ({
        id: item.id,
        catalogId: item.catalogId,
        valid: isFootprintValid(item),
      }))
    return () => {
      delete scope.__planner
    }
  }, [camera, gl, scene])
  return null
}

export function HouseScene() {
  const level = usePlanner((state) => state.level)
  const view = usePlanner((state) => state.view)
  const roof = usePlanner((state) => state.ambience.roof)
  const showRoof = roof && view === "3d"
  const showUpper = level === "etage" || showRoof

  return (
    <>
      <Lighting />
      <CameraRig />
      <SceneBridge />
      <Site />
      <Floors level={level} />
      {showUpper && level === "rdc" ? <Floors level="etage" /> : null}
      <Walls level={level} />
      {showUpper && level === "rdc" ? <Walls level="etage" /> : null}
      <Stairs />
      <Suspense fallback={null}>
        <FurnitureLayer />
      </Suspense>
      <SelectionOverlay />
      <MeasureOverlay />
      {view !== "walk" ? <FloorInteractions /> : null}
      <GridOverlay />
      <PlanLabels />
      <Roof />
      <DragController />
      <WalkController />
      <Effects />
      <DebugBridge />
    </>
  )
}
