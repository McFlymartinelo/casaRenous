import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { HOUSE, drivewayBounds, getMaterial, pointInPolygon } from "@/config/house"
import type { Rect2 } from "@/types"
import { SurfaceMaterial } from "./SurfaceMaterial"

/* -------------------------------------------------------------------------- */
/*  Utilitaires déterministes                                                 */
/* -------------------------------------------------------------------------- */

function rng(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FOLIAGE_COLORS = [
  "#40583a",
  "#486345",
  "#516d4b",
  "#5b7852",
  "#65835a",
  "#708e62",
  "#7b986b",
]

/** Mélange deux couleurs hexadécimales. */
function mix(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t)
}

/* -------------------------------------------------------------------------- */
/*  Vent partagé (uniforme unique pour tous les brins d'herbe)                */
/* -------------------------------------------------------------------------- */

const windTime = { value: 0 }
const windStrength = { value: 0.26 }

const GRASS_MATERIAL = (() => {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  material.customProgramCacheKey = () => "casarenous-grass-wind-v1"
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime
    shader.uniforms.uWindStrength = windStrength
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform float uWindStrength;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec3 windOrigin = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
         #else
           vec3 windOrigin = vec3(0.0);
         #endif
         float windPhase = windOrigin.x * 0.83 + windOrigin.z * 0.61;
         float gust = sin(uTime * 1.7 + windPhase) * 0.66
                    + sin(uTime * 2.9 + windPhase * 1.73) * 0.34;
         float bend = pow(clamp(transformed.y, 0.0, 1.0), 1.6);
         transformed.x += gust * uWindStrength * bend;
         transformed.z += cos(uTime * 1.31 + windPhase) * uWindStrength * 0.4 * bend;`,
      )
  }
  return material
})()

/* -------------------------------------------------------------------------- */
/*  Géométries partagées                                                      */
/* -------------------------------------------------------------------------- */

function makeBladeGeometry(): THREE.BufferGeometry {
  const segments = 4
  const positions: number[] = []
  const indices: number[] = []
  const halfWidth = 0.1
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const width = Math.max(0.006, halfWidth * (1 - Math.pow(t, 1.7)))
    const curve = 0.16 * t * t
    positions.push(-width, t, curve, width, t, curve)
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeLeafGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.16, 0, 0,
        0.16, 0, 0,
        -0.3, 0.5, 0.05,
        0.3, 0.5, 0.05,
        0, 1, 0.12,
      ],
      3,
    ),
  )
  geometry.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4])
  geometry.computeVertexNormals()
  return geometry
}

function makeBlobGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 18, 14)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const random = rng(seed)
  const p1 = random() * 6.28
  const p2 = random() * 6.28
  const p3 = random() * 6.28
  const vertex = new THREE.Vector3()
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).normalize()
    const lump =
      1 +
      0.11 * Math.sin(vertex.x * 3.7 + p1) * Math.cos(vertex.y * 4.1 + p2) +
      0.07 * Math.sin(vertex.z * 5.3 + p3) +
      0.04 * Math.cos((vertex.x + vertex.y) * 7.1 + p2)
    position.setXYZ(i, vertex.x * lump, vertex.y * lump, vertex.z * lump)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

const BLADE_GEOMETRY = makeBladeGeometry()
const LEAF_GEOMETRY = makeLeafGeometry()
const BLOB_GEOMETRIES = [makeBlobGeometry(101), makeBlobGeometry(202), makeBlobGeometry(303)]
const LEAF_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  roughness: 0.92,
  metalness: 0,
  side: THREE.DoubleSide,
})

/* -------------------------------------------------------------------------- */
/*  Arbres                                                                    */
/* -------------------------------------------------------------------------- */

const BRANCH_TILT = 0.62

function Tree({
  x,
  z,
  height,
  radius,
  index,
}: {
  x: number
  z: number
  height: number
  radius: number
  index: number
}) {
  const crown = useRef<THREE.Group>(null)
  const phase = index * 1.9 + 0.4

  const trunk = useMemo(() => {
    const h = height * 0.62
    const geometry = new THREE.CylinderGeometry(radius * 0.065, radius * 0.135, h, 10, 6)
    const position = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < position.count; i += 1) {
      const t = (position.getY(i) + h / 2) / h
      const bend = Math.sin(t * Math.PI) * radius * 0.045
      position.setX(i, position.getX(i) + bend)
      position.setZ(i, position.getZ(i) + bend * 0.35)
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    return geometry
  }, [height, radius])

  useEffect(() => () => trunk.dispose(), [trunk])

  const branches = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0)
    return Array.from({ length: 5 }, (_, i) => {
      const angle = i * 2.39996 + index * 0.7
      const direction = new THREE.Vector3(Math.cos(angle), BRANCH_TILT, Math.sin(angle)).normalize()
      const length = radius * (0.55 + (i % 2) * 0.14)
      const start = new THREE.Vector3(
        Math.cos(angle) * radius * 0.06,
        height * (0.42 + i * 0.075),
        Math.sin(angle) * radius * 0.06,
      )
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction)
      return {
        position: start.clone().addScaledVector(direction, length * 0.5),
        quaternion,
        length,
        base: radius * 0.034,
        tip: radius * 0.013,
      }
    })
  }, [height, radius, index])

  const clusters = useMemo(() => {
    const random = rng(7411 + index * 131)
    return Array.from({ length: 20 }, (_, i) => {
      const t = i / 19
      const angle = i * 2.39996 + random() * 0.5
      const spread = radius * (0.12 + 0.72 * Math.sin(t * Math.PI)) * (0.75 + random() * 0.35)
      const size = radius * (0.34 - t * 0.07 + random() * 0.1)
      return {
        position: new THREE.Vector3(
          Math.cos(angle) * spread,
          height * (0.48 + t * 0.5) + (random() - 0.5) * height * 0.05,
          Math.sin(angle) * spread,
        ),
        rotation: [random() * 6.28, random() * 6.28, random() * 6.28] as [number, number, number],
        scale: [size, size * (0.85 + random() * 0.18), size] as [number, number, number],
        color: mix(FOLIAGE_COLORS[i % FOLIAGE_COLORS.length]!, FOLIAGE_COLORS[6]!, t * 0.45),
        geometry: BLOB_GEOMETRIES[i % BLOB_GEOMETRIES.length]!,
      }
    })
  }, [height, radius, index])

  const leaves = useMemo(() => {
    const random = rng(9917 + index * 277)
    return Array.from({ length: 720 }, () => {
      const theta = random() * Math.PI * 2
      const cosPhi = -0.12 + random() * 1.12
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi))
      const shell = radius * (0.78 + random() * 0.28)
      return {
        position: new THREE.Vector3(
          Math.cos(theta) * sinPhi * shell,
          height * 0.72 + cosPhi * radius * 0.68,
          Math.sin(theta) * sinPhi * shell,
        ),
        rotation: [
          (random() - 0.5) * 1.5,
          theta + (random() - 0.5) * 1.1,
          (random() - 0.5) * 1.5,
        ] as [number, number, number],
        scale: radius * (0.055 + random() * 0.055),
        color: mix(FOLIAGE_COLORS[Math.floor(random() * FOLIAGE_COLORS.length)]!, "#a8bd7d", 0.25 + random() * 0.4),
      }
    })
  }, [height, radius, index])

  const leafMesh = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = leafMesh.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    leaves.forEach((leaf, i) => {
      dummy.position.copy(leaf.position)
      dummy.rotation.set(...leaf.rotation)
      dummy.scale.setScalar(leaf.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, leaf.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [leaves])

  useFrame(({ clock }) => {
    if (!crown.current) return
    const t = clock.elapsedTime
    crown.current.rotation.z = Math.sin(t * 0.72 + phase) * 0.008
    crown.current.rotation.x = Math.cos(t * 0.54 + phase * 1.3) * 0.006
  })

  return (
    <group ref={crown} position={[x, 0, -z]}>
      <mesh geometry={trunk} castShadow receiveShadow dispose={null}>
        <SurfaceMaterial material={getMaterial("trunk")} uv={[radius * 2.2, height * 0.7]} />
      </mesh>
      {branches.map((branch, i) => (
        <mesh
          key={i}
          position={branch.position}
          quaternion={branch.quaternion}
          castShadow
          dispose={null}
        >
          <cylinderGeometry args={[branch.tip, branch.base, branch.length, 6, 1]} />
          <SurfaceMaterial material={getMaterial("trunk")} uv={[branch.length, branch.length]} />
        </mesh>
      ))}
      {clusters.map((cluster, i) => (
        <mesh
          key={i}
          geometry={cluster.geometry}
          position={cluster.position}
          rotation={cluster.rotation}
          scale={cluster.scale}
          castShadow
          receiveShadow
          dispose={null}
        >
          <meshStandardMaterial color={cluster.color} roughness={1} metalness={0} />
        </mesh>
      ))}
      <instancedMesh
        ref={leafMesh}
        args={[LEAF_GEOMETRY, LEAF_MATERIAL, leaves.length]}
        dispose={null}
        frustumCulled={false}
      />
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/*  Pelouse 3D                                                                */
/* -------------------------------------------------------------------------- */

function worldRect(rect: Rect2): Rect2 {
  return [rect[0], -rect[3], rect[2], -rect[1]]
}

function inside(rect: Rect2, x: number, z: number, margin: number): boolean {
  return x > rect[0] - margin && x < rect[2] + margin && z > rect[1] - margin && z < rect[3] + margin
}

function GrassBlades() {
  const mesh = useRef<THREE.InstancedMesh>(null)

  const blades = useMemo(() => {
    const random = rng(20261117)
    const site = HOUSE.site
    const asphalt = site.asphaltArea?.points
    const envelope = HOUSE.envelope
    const excluded: Rect2[] = [
      // La maison entière (murs compris) ne reçoit aucun brin d'herbe.
      worldRect([0, 0, envelope.width, envelope.depth]),
      worldRect(site.terrace.rect),
      worldRect(drivewayBounds()),
      ...(site.path ? [worldRect(site.path.rect)] : []),
    ]
    const result: { position: THREE.Vector3; rotation: number; scale: number; color: THREE.Color }[] = []
    const target = 26000
    let attempts = 0
    while (result.length < target && attempts < target * 4) {
      attempts += 1
      const x = -6 + random() * 24
      const z = -18 + random() * 23
      if (excluded.some((rect) => inside(rect, x, z, 0.25))) continue
      // Le gazon ne pousse que hors de l'enrobé (stationnement + allée).
      if (asphalt && pointInPolygon([x, -z], asphalt)) continue
      const dry = random() < 0.06
      result.push({
        position: new THREE.Vector3(x, 0.012, z),
        rotation: random() * Math.PI * 2,
        scale: 0.07 + random() * 0.075,
        color: dry
          ? mix("#c0b37a", "#d6c894", random())
          : mix("#8aab68", "#c6d9a0", random() * 0.9),
      })
    }
    return result
  }, [])

  useEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const dummy = new THREE.Object3D()
    blades.forEach((blade, i) => {
      dummy.position.copy(blade.position)
      dummy.rotation.set(0, blade.rotation, 0)
      dummy.scale.setScalar(blade.scale)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
      instanced.setColorAt(i, blade.color)
    })
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
  }, [blades])

  useFrame(({ clock }) => {
    windTime.value = clock.elapsedTime
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[BLADE_GEOMETRY, GRASS_MATERIAL, blades.length]}
      dispose={null}
      frustumCulled={false}
      receiveShadow
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Haies                                                                     */
/* -------------------------------------------------------------------------- */

export function Hedge({ x, z, size }: { x: number; z: number; size: number }) {
  const blobs = useMemo(() => {
    const random = rng(Math.round((x + z) * 100) + 17)
    return Array.from({ length: 6 }, (_, i) => ({
      position: new THREE.Vector3(
        (i / 5 - 0.5) * size * 0.92,
        size * (0.27 + random() * 0.09),
        (random() - 0.5) * 0.22,
      ),
      rotation: [random() * 6.28, random() * 6.28, random() * 6.28] as [number, number, number],
      scale: [size * (0.3 + random() * 0.08), size * (0.34 + random() * 0.1), 0.5] as [
        number,
        number,
        number,
      ],
      color: mix(FOLIAGE_COLORS[1]!, FOLIAGE_COLORS[4]!, random()),
      geometry: BLOB_GEOMETRIES[i % BLOB_GEOMETRIES.length]!,
    }))
  }, [x, z, size])

  return (
    <group position={[x, 0, -z]}>
      {blobs.map((blob, i) => (
        <mesh
          key={i}
          geometry={blob.geometry}
          position={blob.position}
          rotation={blob.rotation}
          scale={blob.scale}
          castShadow
          receiveShadow
          dispose={null}
        >
          <meshStandardMaterial color={blob.color} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

export { Tree, GrassBlades }
