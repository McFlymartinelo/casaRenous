import { useMemo } from "react"
import * as THREE from "three"
import { HOUSE, getLevel, getMaterial } from "@/config/house"
import { usePlanner } from "@/store/planner"
import { SurfaceMaterial } from "./SurfaceMaterial"

export function Roof() {
  const visible = usePlanner((state) => state.ambience.roof)
  const view = usePlanner((state) => state.view)
  const roof = HOUSE.roof
  const level = getLevel("etage")
  const eave = roof.eaveHeight ?? level.elevation + level.ceilingHeight
  const half = HOUSE.envelope.width / 2
  const pitch = (roof.pitch * Math.PI) / 180
  const rise = half * Math.tan(pitch)
  const ridge = eave + rise
  const overhang = roof.overhangSide
  const depth = HOUSE.envelope.depth + roof.overhangGable * 2
  const zCenter = -HOUSE.envelope.depth / 2
  const slopeLength = (half + overhang) / Math.cos(pitch)
  const eaveEdge = eave - overhang * Math.tan(pitch)
  const centerY = (eaveEdge + ridge) / 2
  const centerXLeft = (half - overhang) / 2
  const centerXRight = (half + HOUSE.envelope.width + overhang) / 2

  const gable = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, eave)
    shape.lineTo(HOUSE.envelope.width, eave)
    shape.lineTo(half, ridge - 0.18)
    shape.closePath()
    return shape
  }, [eave, half, ridge])

  if (!visible || view === "plan") return null

  return (
    <group>
      <mesh
        position={[centerXLeft, centerY, zCenter]}
        rotation={[0, 0, pitch]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slopeLength, roof.thickness, depth]} />
        <SurfaceMaterial material={getMaterial(roof.material)} uv={[slopeLength, depth]} />
      </mesh>
      <mesh
        position={[centerXRight, centerY, zCenter]}
        rotation={[0, 0, -pitch]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slopeLength, roof.thickness, depth]} />
        <SurfaceMaterial material={getMaterial(roof.material)} uv={[slopeLength, depth]} />
      </mesh>
      <mesh position={[half, ridge + 0.08, zCenter]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, depth + 0.04, 8]} />
        <SurfaceMaterial material={getMaterial(roof.ridgeMaterial)} uv={[0.4, depth]} />
      </mesh>
      <mesh position={[-overhang, eaveEdge - 0.06, zCenter]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, depth, 10, 1, true]} />
        <SurfaceMaterial material={getMaterial(roof.gutterMaterial)} />
      </mesh>
      <mesh position={[HOUSE.envelope.width + overhang, eaveEdge - 0.06, zCenter]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, depth, 10, 1, true]} />
        <SurfaceMaterial material={getMaterial(roof.gutterMaterial)} />
      </mesh>
      <mesh position={[-overhang / 2, eave - 0.18, zCenter]} castShadow>
        <boxGeometry args={[overhang, 0.04, depth]} />
        <SurfaceMaterial material={getMaterial("plaster")} uv={[overhang, depth]} />
      </mesh>
      <mesh position={[HOUSE.envelope.width + overhang / 2, eave - 0.18, zCenter]} castShadow>
        <boxGeometry args={[overhang, 0.04, depth]} />
        <SurfaceMaterial material={getMaterial("plaster")} uv={[overhang, depth]} />
      </mesh>
      <mesh position={[0, 0, -0.38]} rotation={[0, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[gable, { depth: 0.38, bevelEnabled: false }]} />
        <SurfaceMaterial material={getMaterial("plaster")} uv={[7, 2.1]} />
      </mesh>
      <mesh position={[0, 0, -HOUSE.envelope.depth]} castShadow receiveShadow>
        <extrudeGeometry args={[gable, { depth: 0.38, bevelEnabled: false }]} />
        <SurfaceMaterial material={getMaterial("plaster")} uv={[7, 2.1]} />
      </mesh>
      {[
        [-overhang, -0.2],
        [HOUSE.envelope.width + overhang, -0.2],
        [-overhang, -(HOUSE.envelope.depth - 0.2)],
        [HOUSE.envelope.width + overhang, -(HOUSE.envelope.depth - 0.2)],
      ].map(([x, z], index) => (
        <group key={index}>
          <mesh position={[x!, (eaveEdge - 0.2) / 2, z!]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, eaveEdge - 0.2, 8]} />
            <SurfaceMaterial material={getMaterial(roof.gutterMaterial)} />
          </mesh>
          <mesh position={[x!, eaveEdge - 0.2, z!]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.3, 8]} />
            <SurfaceMaterial material={getMaterial(roof.gutterMaterial)} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
