import { useMemo } from "react"
import { HOUSE, getLevel, getMaterial, getRooms, getWalls, wallGeometry, openingSpan } from "@/config/house"
import { usePlanner } from "@/store/planner"
import type { LevelId, Rect2 } from "@/types"
import { SurfaceMaterial } from "./SurfaceMaterial"

export function Floors({ level }: { level: LevelId }) {
  const view = usePlanner((state) => state.view)
  const details = usePlanner((state) => state.ambience.details)
  const config = getLevel(level)
  const rooms = getRooms(level)
  const walls = getWalls(level)
  const rects: Rect2[] = config.floorRects ?? [
    [0.38, 0.38, 7 - 0.38, 13.8 - 0.38],
  ]

  // Bandeau d'enduit affleurant : il comble les 0,22 m entre le haut du RDC
  // (2,50) et le bas de l'étage (2,72) sans dépasser des façades. La dalle est
  // rentrée de 2 cm sur le pourtour pour laisser la place à l'enduit.
  const largeur = HOUSE.envelope.width
  const profondeur = HOUSE.envelope.depth
  const epEnduit = 0.02
  const bandeau: { key: string; position: [number, number, number]; size: [number, number, number] }[] = [
    { key: "sud", position: [largeur / 2, config.elevation - 0.11, -epEnduit / 2], size: [largeur, 0.22, epEnduit] },
    { key: "nord", position: [largeur / 2, config.elevation - 0.11, -profondeur + epEnduit / 2], size: [largeur, 0.22, epEnduit] },
    { key: "ouest", position: [epEnduit / 2, config.elevation - 0.11, -profondeur / 2], size: [epEnduit, 0.22, profondeur] },
    { key: "est", position: [largeur - epEnduit / 2, config.elevation - 0.11, -profondeur / 2], size: [epEnduit, 0.22, profondeur] },
  ]

  const doorThresholds = useMemo(() => {
    const list: {
      x: number
      z: number
      width: number
      depth: number
      rotation: number
      material: string
    }[] = []
    for (const wall of walls) {
      const geom = wallGeometry(wall)
      for (const opening of wall.openings ?? []) {
        if (opening.type !== "door" && opening.type !== "garage" && opening.type !== "passage") continue
        if (opening.sill > 0.02) continue
        const [a, b] = openingSpan(wall, opening)
        list.push({
          x: wall.from[0] + geom.direction[0] * ((a + b) / 2),
          z: -(wall.from[1] + geom.direction[1] * ((a + b) / 2)),
          width: b - a,
          depth: wall.thickness + 0.02,
          rotation: -geom.angle,
          material: wall.exterior && opening.type === "garage" ? "concrete" : "oak",
        })
      }
    }
    return list
  }, [walls])

  return (
    <group>
      {level === "rdc" ? (
        <mesh position={[3.5, -0.14, -6.9]} receiveShadow>
          <boxGeometry args={[7, 0.24, 13.8]} />
          <SurfaceMaterial material={getMaterial("concrete")} uv={[7, 13.8]} />
        </mesh>
      ) : null}
      {level === "etage" ? (
        <group>
          {/* Dalle sur toute l'emprise (comme celle du RDC), rentrée de 2 cm
              sur le pourtour pour que l'enduit soit parfaitement affleurant. */}
          <mesh
            position={[largeur / 2, config.elevation - 0.12, -profondeur / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[largeur - 2 * epEnduit, 0.22, profondeur - 2 * epEnduit]} />
            <SurfaceMaterial material={getMaterial("concrete")} uv={[largeur, profondeur]} />
          </mesh>
          {bandeau.map((bande) => (
            <mesh key={`bandeau-${bande.key}`} position={bande.position} receiveShadow>
              <boxGeometry args={bande.size} />
              <SurfaceMaterial material={getMaterial("plaster")} uv={[bande.size[0], bande.size[1]]} />
            </mesh>
          ))}
        </group>
      ) : null}
      {rects.map((rect, index) => {
        const width = rect[2] - rect[0]
        const depth = rect[3] - rect[1]
        return (
          <mesh
            key={`floor-${index}`}
            position={[(rect[0] + rect[2]) / 2, config.elevation - 0.02, -(rect[1] + rect[3]) / 2]}
            receiveShadow
          >
            <boxGeometry args={[width, 0.04, depth]} />
            <SurfaceMaterial material={getMaterial(config.floorMaterial)} uv={[width, depth]} envMapIntensity={0.16} />
          </mesh>
        )
      })}
      {rooms
        .filter((room) => room.floor !== config.floorMaterial)
        .map((room) => {
          const [x0, z0, x1, z1] = room.rect
          return (
            <mesh
              key={`overlay-${room.id}`}
              position={[(x0 + x1) / 2, config.elevation + 0.004, -(z0 + z1) / 2]}
              receiveShadow
            >
              <boxGeometry args={[x1 - x0, 0.02, z1 - z0]} />
              <SurfaceMaterial material={getMaterial(room.floor)} uv={[x1 - x0, z1 - z0]} />
            </mesh>
          )
        })}
      {details
        ? doorThresholds.map((threshold, index) => (
            <group
              key={`threshold-${index}`}
              position={[threshold.x, config.elevation + 0.01, threshold.z]}
              rotation={[0, threshold.rotation, 0]}
            >
              <mesh receiveShadow castShadow={false}>
                <boxGeometry args={[threshold.width, 0.014, threshold.depth]} />
                <SurfaceMaterial material={getMaterial(threshold.material)} uv={[threshold.width, threshold.depth]} />
              </mesh>
            </group>
          ))
        : null}
      {view === "walk" ? (
        <>
          <mesh position={[3.5, config.elevation + config.ceilingHeight - 0.015, -6.9]} receiveShadow>
            <boxGeometry args={[6.24, 0.03, 13.04]} />
            <SurfaceMaterial material={getMaterial("whitePaint")} uv={[6.24, 13.04]} />
          </mesh>
          {rooms.map((room) => {
            const [x0, z0, x1, z1] = room.rect
            const width = Math.min(0.22, (x1 - x0) * 0.3)
            const depth = Math.min(0.22, (z1 - z0) * 0.3)
            if (width < 0.08 || depth < 0.08) return null
            return (
              <mesh
                key={`light-${room.id}`}
                position={[(x0 + x1) / 2, config.elevation + config.ceilingHeight - 0.036, -(z0 + z1) / 2]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <circleGeometry args={[0.085, 20]} />
                <meshStandardMaterial color="#fff4df" emissive="#ffddb0" emissiveIntensity={1.6} roughness={0.5} />
              </mesh>
            )
          })}
        </>
      ) : null}
    </group>
  )
}
