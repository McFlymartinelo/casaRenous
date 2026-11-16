import { usePlanner } from "@/store/planner"
import { sceneApi } from "@/scene/scene-api"
import {
  CameraIcon,
  CloseIcon,
  DoorIcon,
  GridIcon,
  MoveIcon,
  RotateIcon,
  RulerIcon,
} from "./Icons"

const TOOLS = [
  { id: "move" as const, label: "Déplacer", icon: MoveIcon },
  { id: "rotate" as const, label: "Pivoter", icon: RotateIcon },
  { id: "measure" as const, label: "Mesurer", icon: RulerIcon },
  { id: "doors" as const, label: "Portes", icon: DoorIcon },
]

export function Toolbar() {
  const tool = usePlanner((state) => state.tool)
  const setTool = usePlanner((state) => state.setTool)
  const grid = usePlanner((state) => state.ambience.grid)
  const setAmbience = usePlanner((state) => state.setAmbience)
  const measurePoints = usePlanner((state) => state.measurePoints)
  const clearMeasure = usePlanner((state) => state.clearMeasure)
  const selectedId = usePlanner((state) => state.selectedId)
  const view = usePlanner((state) => state.view)

  if (view === "walk") return null

  const hint =
    tool === "measure"
      ? measurePoints.length === 0
        ? "Cliquez un premier point sur le sol"
        : measurePoints.length === 1
          ? "Cliquez le second point pour mesurer"
          : "Mesure terminée · cliquez pour recommencer"
      : tool === "rotate"
        ? selectedId
          ? "Faites glisser le meuble pour le pivoter par pas de 15°"
          : "Sélectionnez un meuble à pivoter"
        : tool === "doors"
          ? "Cliquez sur une porte pour l'ouvrir ou la fermer"
          : "Faites glisser un meuble · double-clic pour pivoter de 90°"

  return (
    <div className="toolbar-wrap">
      <div className="toolbar-hint">
        <span>{hint}</span>
        {tool === "measure" && measurePoints.length > 0 ? (
          <button type="button" onClick={clearMeasure} aria-label="Effacer la mesure">
            <CloseIcon size={13} />
            Effacer
          </button>
        ) : null}
      </div>
      <div className="toolbar" role="toolbar" aria-label="Outils de la scène">
        {TOOLS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? "is-active" : ""}
              onClick={() => setTool(item.id)}
              aria-pressed={tool === item.id}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          )
        })}
        <span className="toolbar__sep" />
        <button
          type="button"
          className={grid ? "is-active" : ""}
          onClick={() => setAmbience({ grid: !grid })}
          aria-pressed={grid}
        >
          <GridIcon size={17} />
          <span>Grille</span>
        </button>
        <button
          type="button"
          className="toolbar__icon"
          onClick={() => sceneApi.current.resetCamera?.()}
          title="Recadrer la vue"
          aria-label="Recadrer la vue"
        >
          <CameraIcon size={17} />
        </button>
      </div>
    </div>
  )
}
