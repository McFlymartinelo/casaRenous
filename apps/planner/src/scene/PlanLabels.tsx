import { Grid, Html } from "@react-three/drei"
import { getLevel, getRooms, rectArea, rectCenter } from "@/config/house"
import { usePlanner } from "@/store/planner"

export function GridOverlay() {
  const grid = usePlanner((state) => state.ambience.grid)
  const exporting = usePlanner((state) => state.exporting)
  const view = usePlanner((state) => state.view)
  const level = usePlanner((state) => state.level)
  if (!grid || view === "walk" || exporting) return null
  const elevation = getLevel(level).elevation
  return (
    <Grid
      position={[3.5, elevation + 0.012, -6.9]}
      args={[24, 24]}
      cellSize={0.5}
      cellThickness={0.55}
      cellColor="#aebfb1"
      sectionSize={1}
      sectionThickness={1}
      sectionColor="#86a58d"
      fadeDistance={28}
      fadeStrength={1.4}
      followCamera={false}
      infiniteGrid
    />
  )
}

export function PlanLabels() {
  const view = usePlanner((state) => state.view)
  const level = usePlanner((state) => state.level)
  if (view !== "plan") return null
  const config = getLevel(level)
  const rooms = getRooms(level)
  return (
    <group>
      {rooms.map((room) => {
        const center = room.labelAt ?? rectCenter(room.rect)
        const area = rectArea(room.rect)
        const provisional = room.provisional
        return (
          <Html
            key={room.id}
            position={[center[0], config.elevation + 0.04, -center[1]]}
            center
            zIndexRange={[15, 0]}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div className={`plan-label${provisional ? " plan-label--provisional" : ""}`}>
              <span className="plan-label__name">{room.name}</span>
              <span className="plan-label__area">
                {area.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m²
              </span>
            </div>
          </Html>
        )
      })}
    </group>
  )
}
