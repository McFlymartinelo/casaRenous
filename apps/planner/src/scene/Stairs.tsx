import { getLevel, getMaterial, HOUSE } from "@/config/house"
import { SurfaceMaterial } from "./SurfaceMaterial"

function Step({
  x0,
  x1,
  z0,
  z1,
  y0,
  y1,
  body,
  tread,
  riser,
}: {
  x0: number
  x1: number
  z0: number
  z1: number
  y0: number
  y1: number
  body: string
  tread: string
  riser: string
}) {
  const width = x1 - x0
  const depth = z1 - z0
  const height = y1 - y0
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, Math.max(0.02, height - 0.035), depth]} />
        <SurfaceMaterial material={getMaterial(body)} uv={[width, depth]} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, y1 - 0.0175, (z0 + z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.025, 0.035, depth + 0.02]} />
        <SurfaceMaterial material={getMaterial(tread)} uv={[width, depth]} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, y1 - 0.05, z1 - 0.008]} castShadow={false} receiveShadow>
        <boxGeometry args={[width + 0.01, 0.07, 0.016]} />
        <SurfaceMaterial material={getMaterial(riser)} />
      </mesh>
    </group>
  )
}

export function Stairs() {
  const stairs = HOUSE.stairs
  if (stairs.level !== "rdc") return null
  const upper = getLevel("etage")
  const rise = upper.elevation / stairs.steps
  const [x0, z0, x1, z1] = stairs.rect
  const winderDepth = 0.225
  const straightWidth = 0.234
  const east = 6.07
  const upperStart = 4.9
  const steps = []

  for (let i = 1; i <= 4; i += 1) {
    steps.push(
      <Step
        key={`winder-${i}`}
        x0={east}
        x1={x1}
        z0={-(z1 - winderDepth * (i - 1))}
        z1={-(z1 - winderDepth * i)}
        y0={0}
        y1={i * rise}
        body={stairs.material}
        tread={stairs.treadMaterial}
        riser={stairs.riserMaterial}
      />,
    )
  }
  for (let j = 5; j <= 9; j += 1) {
    const right = east - straightWidth * (j - 5)
    steps.push(
      <Step
        key={`straight-${j}`}
        x0={right - straightWidth}
        x1={right}
        z0={-z1}
        z1={-z0}
        y0={0}
        y1={j * rise}
        body={stairs.material}
        tread={stairs.treadMaterial}
        riser={stairs.riserMaterial}
      />,
    )
  }
  for (let j = 10; j <= stairs.steps; j += 1) {
    const right = upperStart - 0.25 * (j - 10)
    steps.push(
      <Step
        key={`upper-${j}`}
        x0={right - 0.25}
        x1={right}
        z0={-z1}
        z1={-z0}
        y0={j * rise - 0.09}
        y1={j * rise}
        body={stairs.material}
        tread={stairs.treadMaterial}
        riser={stairs.riserMaterial}
      />,
    )
  }

  return (
    <group>
      {steps}
      <mesh position={[5.0, upper.elevation - 0.07, -(z0 + z1) / 2]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.14, z1 - z0]} />
        <SurfaceMaterial material={getMaterial(stairs.material)} />
      </mesh>
      {stairs.railing ? (
        <group>
          <mesh position={[(x0 + x1) / 2, upper.elevation + 0.93, -z1 - 0.02]} castShadow>
            <boxGeometry args={[x1 - x0, 0.055, 0.055]} />
            <SurfaceMaterial material={getMaterial("oak")} />
          </mesh>
          {Array.from({ length: 10 }).map((_, index) => {
            const x = x0 + 0.2 + index * ((x1 - x0 - 0.4) / 9)
            return (
              <mesh key={index} position={[x, upper.elevation + 0.48, -z1 - 0.02]} castShadow>
                <boxGeometry args={[0.018, 0.9, 0.018]} />
                <SurfaceMaterial material={getMaterial("blackMetal")} />
              </mesh>
            )
          })}
        </group>
      ) : null}
    </group>
  )
}
