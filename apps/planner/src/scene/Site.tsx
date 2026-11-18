import { useMemo } from "react"
import * as THREE from "three"
import { HOUSE, drivewayOutline, getMaterial } from "@/config/house"
import type { Point2 } from "@/types"
import { usePlanner } from "@/store/planner"
import { SurfaceMaterial } from "./SurfaceMaterial"
import { GrassBlades, Hedge, Tree } from "./vegetation"

export function Site() {
  const view = usePlanner((state) => state.view)
  const vegetation = usePlanner((state) => state.ambience.vegetation !== false)
  const quality = usePlanner((state) => state.quality)
  const site = HOUSE.site
  const terrace = site.terrace
  const driveway = site.driveway
  const asphaltArea = site.asphaltArea
  const path = site.path

  const geometries = useMemo(() => {
    const trace = <T extends THREE.Path>(path: T, points: Point2[]) => {
      points.forEach(([x, z], index) => {
        if (index === 0) path.moveTo(x, z)
        else path.lineTo(x, z)
      })
      path.closePath()
      return path
    }
    const polygon = (points: Point2[], holes: Point2[][] = []) => {
      const shape = trace(new THREE.Shape(), points)
      holes.forEach((hole) => shape.holes.push(trace(new THREE.Path(), hole)))
      const geometry = new THREE.ShapeGeometry(shape)
      geometry.rotateX(-Math.PI / 2)
      return geometry
    }
    return {
      asphaltArea: asphaltArea ? polygon(asphaltArea.points, asphaltArea.holes) : polygon(drivewayOutline()),
    }
  }, [asphaltArea, driveway.width, driveway.points])

  if (view === "plan") return null

  return (
    <group>
      {/* La pelouse couvre aussi l'allée en coude jusqu'à la voie, à l'est. */}
      <mesh position={[8, -0.04, 1.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 90]} />
        <SurfaceMaterial material={getMaterial(site.grass)} uv={[100, 90]} />
      </mesh>
      {vegetation ? (
        <GrassBlades density={quality === "low" ? 0.25 : quality === "medium" ? 0.5 : 1} />
      ) : null}
      {/* Le dessus de la terrasse est affine avec le sol fini du RdC (Floors.tsx : +0,004). */}
      <mesh
        position={[
          (terrace.rect[0] + terrace.rect[2]) / 2,
          0.004 - 0.045,
          -(terrace.rect[1] + terrace.rect[3]) / 2,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[terrace.rect[2] - terrace.rect[0], 0.09, terrace.rect[3] - terrace.rect[1]]} />
        <SurfaceMaterial
          material={getMaterial(terrace.material)}
          uv={[terrace.rect[2] - terrace.rect[0], terrace.rect[3] - terrace.rect[1]]}
        />
      </mesh>
      <mesh geometry={geometries.asphaltArea} position={[0, -0.015, 0]} receiveShadow>
        <SurfaceMaterial
          material={getMaterial(asphaltArea?.material ?? driveway.material)}
          uv={[driveway.width, 42.6]}
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
        <Tree
          key={index}
          index={index}
          x={tree.at[0]}
          z={tree.at[1]}
          height={tree.height}
          radius={tree.radius}
        />
      ))}
      {[
        [2.4, 17.6, 1.4],
        [2.4, 16.5, 1.25],
        [8.7, 17.4, 1.3],
      ].map(([x, z, size], index) => (
        <Hedge key={index} x={x!} z={z!} size={size!} />
      ))}
    </group>
  )
}
