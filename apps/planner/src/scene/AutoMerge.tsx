import { useLayoutEffect, useRef, type ReactNode } from "react"
import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

type Bucket = {
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
  geometries: THREE.BufferGeometry[]
  meshes: THREE.Mesh[]
}

/**
 * `SurfaceMaterial` crée une nouvelle instance de matériau pour chaque pièce :
 * deux cubes identiques ont donc des uuid différents. On regroupe plutôt par
 * signature visuelle, sinon la fusion ne trouve jamais rien à fusionner.
 */
function materialSignature(material: THREE.Material): string {
  const std = material as THREE.MeshStandardMaterial & {
    sheen?: number
    sheenColor?: THREE.Color
    sheenRoughness?: number
    clearcoat?: number
    clearcoatRoughness?: number
  }
  const texture = (value: THREE.Texture | null | undefined): string => {
    if (!value) return "-"
    // Les clones de texture partagent la même `source` : c'est l'identité stable.
    return `${value.source?.uuid ?? value.uuid}|${value.repeat.x.toFixed(3)}x${value.repeat.y.toFixed(3)}|${value.colorSpace ?? ""}`
  }
  return [
    std.type,
    std.color?.getHexString?.() ?? "",
    std.roughness ?? "",
    std.metalness ?? "",
    std.opacity ?? "",
    std.transparent ? 1 : 0,
    std.depthWrite ? 1 : 0,
    std.side ?? "",
    std.emissive?.getHexString?.() ?? "",
    std.emissiveIntensity ?? "",
    std.envMapIntensity ?? "",
    texture(std.map),
    texture(std.normalMap),
    texture(std.roughnessMap),
    std.sheen ?? "",
    std.sheenColor?.getHexString?.() ?? "",
    std.sheenRoughness ?? "",
    std.clearcoat ?? "",
    std.clearcoatRoughness ?? "",
  ].join("|")
}

function isAnimated(mesh: THREE.Object3D, root: THREE.Group): boolean {
  // Les portes et tiroirs ont leur propre animation : on ne les fusionne pas.
  let node: THREE.Object3D | null = mesh
  while (node && node !== root) {
    if (node.name.startsWith("door-") || node.name.startsWith("house-door-")) return true
    node = node.parent
  }
  return false
}

/**
 * Fusionne les pièces statiques d'un meuble en un seul mesh par matériau.
 *
 * Les maillages d'origine restent montés (ils portent les gestionnaires de
 * sélection et les animations) ; seuls ceux qui ont effectivement été remplacés
 * par un mesh fusionné sont masqués. Si une fusion échoue, le meuble est laissé
 * tel quel — jamais de pièce invisible. Le déplacement, la rotation et la
 * sélection continuent à fonctionner normalement.
 */
export function AutoMerge({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    const group = root.current
    if (!group) return
    group.updateMatrixWorld(true)
    const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert()
    const buckets = new Map<string, Bucket>()

    group.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || isAnimated(mesh, group)) return
      if (!mesh.material || Array.isArray(mesh.material)) return
      const attributes = Object.keys(mesh.geometry.attributes).sort().join(",")
      // mergeGeometries refuse de fusionner un mesh indexé avec un non-indexé.
      const indexed = mesh.geometry.index ? 1 : 0
      const key = `${materialSignature(mesh.material)}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}|${indexed}|${attributes}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = {
          material: mesh.material,
          castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow,
          geometries: [],
          meshes: [],
        }
        buckets.set(key, bucket)
      }
      const geometry = mesh.geometry.clone()
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld))
      bucket.geometries.push(geometry)
      bucket.meshes.push(mesh)
    })

    const replacements: { originals: THREE.Mesh[]; merged: THREE.Mesh }[] = []
    let complete = true
    for (const bucket of buckets.values()) {
      if (bucket.meshes.length < 2) {
        bucket.geometries.forEach((geometry) => geometry.dispose())
        continue
      }
      const geometry = mergeGeometries(bucket.geometries, false)
      bucket.geometries.forEach((item) => item.dispose())
      if (!geometry) {
        // Une fusion impossible ne doit jamais faire disparaître un meuble :
        // on abandonne l'optimisation pour celui-ci et on garde tout visible.
        complete = false
        break
      }
      const mesh = new THREE.Mesh(geometry, bucket.material)
      mesh.castShadow = bucket.castShadow
      mesh.receiveShadow = bucket.receiveShadow
      replacements.push({ originals: bucket.meshes, merged: mesh })
    }

    if (!complete) {
      for (const { merged } of replacements) merged.geometry.dispose()
      for (const bucket of buckets.values()) bucket.geometries.forEach((geometry) => geometry.dispose())
      return
    }

    for (const { originals, merged } of replacements) {
      for (const mesh of originals) mesh.visible = false
      group.add(merged)
    }

    if (import.meta.env.DEV) {
      const before = [...buckets.values()].reduce((total, bucket) => total + bucket.meshes.length, 0)
      console.info(`[AutoMerge] ${before} pièces → ${replacements.length} meshes`)
    }

    return () => {
      for (const { originals, merged } of replacements) {
        group.remove(merged)
        merged.geometry.dispose()
        for (const mesh of originals) mesh.visible = true
      }
    }
  }, [])

  return <group ref={root}>{children}</group>
}
