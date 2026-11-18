import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { getMaterial } from "@/config/house"
import { SurfaceMaterial } from "./SurfaceMaterial"

export type BoxSpec = {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  materialId: string
  castShadow?: boolean
  envMapIntensity?: number
}

export function pushBox(boxes: BoxSpec[], box: BoxSpec): void {
  if (box.x1 - box.x0 < 0.001 || box.y1 - box.y0 < 0.001 || box.z1 - box.z0 < 0.001) return
  boxes.push(box)
}

/**
 * Géométrie d'un cube avec UV exprimés en mètres.
 *
 * `SurfaceMaterial` applique ensuite un `repeat` de 1/textureScale : on
 * reproduit exactement l'aspect des cubes d'origine (le `uv` passé à
 * SurfaceMaterial était la taille du cube en mètres) tout en pouvant fusionner
 * des cubes de tailles différentes dans un seul mesh.
 */
function boxGeometry(box: BoxSpec): THREE.BufferGeometry {
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const d = box.z1 - box.z0
  const geometry = new THREE.BoxGeometry(w, h, d)
  geometry.translate((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2)

  const uv = geometry.attributes.uv as THREE.BufferAttribute
  // BoxGeometry émet les faces dans cet ordre : +X, -X, +Y, -Y, +Z, -Z.
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = faces[face]!
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner
      uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv)
    }
  }
  uv.needsUpdate = true
  return geometry
}

/**
 * Fusionne les cubes statiques d'un mur en un seul mesh par matériau et par
 * réglage d'ombre. Passe de plusieurs centaines de draw calls à une poignée,
 * sans changer le rendu ni le comportement du mode coupé (chaque mur garde ses
 * propres instances de matériau).
 */
export function MergedBoxes({ boxes }: { boxes: BoxSpec[] }) {
  const merged = useMemo(() => {
    const groups = new Map<string, { materialId: string; castShadow: boolean; envMapIntensity?: number; boxes: BoxSpec[] }>()
    for (const box of boxes) {
      const key = `${box.materialId}|${box.castShadow ? 1 : 0}|${box.envMapIntensity ?? ""}`
      let group = groups.get(key)
      if (!group) {
        group = {
          materialId: box.materialId,
          castShadow: Boolean(box.castShadow),
          envMapIntensity: box.envMapIntensity,
          boxes: [],
        }
        groups.set(key, group)
      }
      group.boxes.push(box)
    }

    return [...groups.values()].flatMap((group) => {
      const key = `${group.materialId}|${group.castShadow ? 1 : 0}|${group.envMapIntensity ?? ""}`
      const geometries = group.boxes.map(boxGeometry)
      const geometry = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false)
      if (geometries.length > 1) geometries.forEach((item) => item.dispose())
      if (!geometry) {
        // Fusion impossible : on rend les cubes un par un plutôt que de perdre
        // un morceau de mur.
        return group.boxes.map((box, index) => ({
          key: `${key}-${index}`,
          geometry: boxGeometry(box),
          materialId: group.materialId,
          castShadow: group.castShadow,
          envMapIntensity: group.envMapIntensity,
        }))
      }
      return [
        {
          key,
          geometry,
          materialId: group.materialId,
          castShadow: group.castShadow,
          envMapIntensity: group.envMapIntensity,
        },
      ]
    })
  }, [boxes])

  useEffect(() => () => merged.forEach((group) => group.geometry.dispose()), [merged])

  return (
    <>
      {merged.map((group) => (
        <mesh
          key={group.key}
          geometry={group.geometry}
          castShadow={group.castShadow}
          receiveShadow
        >
          <SurfaceMaterial
            material={getMaterial(group.materialId)}
            uv={[1, 1]}
            envMapIntensity={group.envMapIntensity}
          />
        </mesh>
      ))}
    </>
  )
}
