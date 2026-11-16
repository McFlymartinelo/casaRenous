import { HOUSE, getMaterial } from "@/config/house"
import { usePlanner } from "@/store/planner"
import { SurfaceMaterial } from "./SurfaceMaterial"

function Tree({ x, z, height, radius }: { x: number; z: number; height: number; radius: number }) {
  return (
    <group position={[x, 0, -z]}>
      <mesh position={[0, height * 0.34, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 0.08, radius * 0.13, height * 0.68, 10]} />
        <SurfaceMaterial material={getMaterial("trunk")} />
      </mesh>
      {[0, 1, 2, 3, 4].map((index) => {
        const angle = index * 2.2
        const level = height * (0.56 + index * 0.08)
        const spread = radius * (0.55 - index * 0.06)
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * spread, level, Math.sin(angle) * spread]}
            scale={[radius * (0.62 - index * 0.04), radius * (0.5 - index * 0.03), radius * (0.62 - index * 0.04)]}
            castShadow
            receiveShadow
          >
            <icosahedronGeometry args={[1, 2]} />
            <meshStandardMaterial color={index % 2 ? "#63784f" : "#556c47"} roughness={0.92} metalness={0} />
          </mesh>
        )
      })}
    </group>
  )
}

export function Site() {
  const view = usePlanner((state) => state.view)
  const site = HOUSE.site
  if (view === "plan") return null
  const terrace = site.terrace
  const driveway = site.driveway
  const path = site.path

  return (
    <group>
      <mesh position={[3.5, -0.04, -6.9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <SurfaceMaterial material={getMaterial(site.grass)} uv={[70, 70]} />
      </mesh>
      <mesh
        position={[(terrace.rect[0] + terrace.rect[2]) / 2, 0.015, -(terrace.rect[1] + terrace.rect[3]) / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[terrace.rect[2] - terrace.rect[0], 0.09, terrace.rect[3] - terrace.rect[1]]} />
        <SurfaceMaterial
          material={getMaterial(terrace.material)}
          uv={[terrace.rect[2] - terrace.rect[0], terrace.rect[3] - terrace.rect[1]]}
        />
      </mesh>
      <mesh
        position={[(driveway.rect[0] + driveway.rect[2]) / 2, -0.005, -(driveway.rect[1] + driveway.rect[3]) / 2]}
        receiveShadow
      >
        <boxGeometry args={[driveway.rect[2] - driveway.rect[0], 0.05, driveway.rect[3] - driveway.rect[1]]} />
        <SurfaceMaterial
          material={getMaterial(driveway.material)}
          uv={[driveway.rect[2] - driveway.rect[0], driveway.rect[3] - driveway.rect[1]]}
        />
      </mesh>
      {path ? (
        <mesh
          position={[(path.rect[0] + path.rect[2]) / 2, -0.002, -(path.rect[1] + path.rect[3]) / 2]}
          receiveShadow
        >
          <boxGeometry args={[path.rect[2] - path.rect[0], 0.035, path.rect[3] - path.rect[1]]} />
          <SurfaceMaterial
            material={getMaterial(path.material)}
            uv={[path.rect[2] - path.rect[0], path.rect[3] - path.rect[1]]}
          />
        </mesh>
      ) : null}
      <mesh position={[6.76, 0.055, -8.66]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.11, 1.25]} />
        <SurfaceMaterial material={getMaterial("stone")} uv={[0.5, 1.25]} />
      </mesh>
      <mesh position={[6.64, 0.035, -10.9]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.07, 2.1]} />
        <SurfaceMaterial material={getMaterial("stone")} uv={[0.3, 2.1]} />
      </mesh>
      {site.trees?.map((tree, index) => (
        <Tree key={index} x={tree.at[0]} z={tree.at[1]} height={tree.height} radius={tree.radius} />
      ))}
      {[
        [2.4, 17.6, 1.4],
        [2.4, 16.5, 1.25],
        [8.7, 17.4, 1.3],
      ].map(([x, z, size], index) => (
        <mesh key={index} position={[x!, size! / 2, -z!]} castShadow receiveShadow>
          <boxGeometry args={[size!, size! * 0.55, 1]} />
          <SurfaceMaterial material={getMaterial("hedge")} uv={[size!, 1]} />
        </mesh>
      ))}
    </group>
  )
}
