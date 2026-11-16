import { useEffect, useState } from "react"
import { CatalogPanel } from "@/components/CatalogPanel"
import { InspectorPanel } from "@/components/InspectorPanel"
import { SceneCanvas } from "@/components/SceneCanvas"
import { Toolbar } from "@/components/Toolbar"
import { TopBar } from "@/components/TopBar"
import { usePlanner } from "@/store/planner"

type MobilePanel = "catalog" | "inspector" | null

export function App() {
  const furniture = usePlanner((state) => state.furniture)
  const ambience = usePlanner((state) => state.ambience)
  const level = usePlanner((state) => state.level)
  const selectedId = usePlanner((state) => state.selectedId)
  const markSaved = usePlanner((state) => state.markSaved)
  const undo = usePlanner((state) => state.undo)
  const redo = usePlanner((state) => state.redo)
  const remove = usePlanner((state) => state.remove)
  const duplicate = usePlanner((state) => state.duplicate)
  const select = usePlanner((state) => state.select)
  const setView = usePlanner((state) => state.setView)
  const setTool = usePlanner((state) => state.setTool)
  const setAmbience = usePlanner((state) => state.setAmbience)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => markSaved(), 700)
    return () => window.clearTimeout(timer)
  }, [ambience, furniture, level, markSaved])

  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      )
    }

    function onKey(event: KeyboardEvent) {
      if (isEditable(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault()
        redo()
        return
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault()
        if (selectedId) duplicate(selectedId)
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId) {
          event.preventDefault()
          remove(selectedId)
          select(null)
        }
        return
      }
      if (event.key === "Escape") {
        select(null)
        setTool("move")
        return
      }
      if (mod || event.altKey) return
      if (event.key === "1") setView("3d")
      if (event.key === "2") setView("plan")
      if (event.key === "3") setView("walk")
      if (event.key.toLowerCase() === "g") setAmbience({ grid: !usePlanner.getState().ambience.grid })
      if (event.key === "/") {
        event.preventDefault()
        const input = document.querySelector<HTMLInputElement>(".search-field input")
        input?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [duplicate, redo, remove, select, selectedId, setAmbience, setTool, setView, undo])

  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-main">
        <div className={`sheet-slot sheet-slot--catalog${mobilePanel === "catalog" ? " is-open" : ""}`}>
          <CatalogPanel />
        </div>
        <div className="stage">
          <SceneCanvas />
          <Toolbar />
        </div>
        <div className={`sheet-slot sheet-slot--inspector${mobilePanel === "inspector" ? " is-open" : ""}`}>
          <InspectorPanel />
        </div>
        {mobilePanel ? (
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="Fermer le panneau"
            onClick={() => setMobilePanel(null)}
          />
        ) : null}
      </main>

      <div className="mobile-tabs" role="group" aria-label="Panneaux">
        <button
          type="button"
          className={mobilePanel === "catalog" ? "is-active" : ""}
          onClick={() => setMobilePanel((panel) => (panel === "catalog" ? null : "catalog"))}
        >
          Catalogue
        </button>
        <button
          type="button"
          className={mobilePanel === null ? "is-active" : ""}
          onClick={() => setMobilePanel(null)}
        >
          Scène
        </button>
        <button
          type="button"
          className={mobilePanel === "inspector" ? "is-active" : ""}
          onClick={() => setMobilePanel((panel) => (panel === "inspector" ? null : "inspector"))}
        >
          Propriétés
        </button>
      </div>

    </div>
  )
}
