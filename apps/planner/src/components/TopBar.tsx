import { useEffect, useRef, useState } from "react"
import { usePlanner, type ProjectFile } from "@/store/planner"
import { sceneApi } from "@/scene/scene-api"
import type { LevelId } from "@/types"
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  HouseIcon,
  LayersIcon,
  RedoIcon,
  SparkleIcon,
  UndoIcon,
  UploadIcon,
} from "./Icons"

type ViewMode = "3d" | "plan" | "walk"

const VIEWS: { id: ViewMode; label: string; short: string }[] = [
  { id: "3d", label: "Vue 3D", short: "3D" },
  { id: "plan", label: "Plan 2D", short: "Plan" },
  { id: "walk", label: "Visite", short: "Visite" },
]

function download(filename: string, url: string) {
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function safeReturnTo(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "/"
  } catch {
    return "/"
  }
}

function waitFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count
    function tick() {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export function TopBar() {
  const level = usePlanner((state) => state.level)
  const view = usePlanner((state) => state.view)
  const ambience = usePlanner((state) => state.ambience)
  const past = usePlanner((state) => state.past)
  const future = usePlanner((state) => state.future)
  const savedAt = usePlanner((state) => state.savedAt)
  const setLevel = usePlanner((state) => state.setLevel)
  const setView = usePlanner((state) => state.setView)
  const undo = usePlanner((state) => state.undo)
  const redo = usePlanner((state) => state.redo)
  const setRealistic = usePlanner((state) => state.setRealistic)
  const setExporting = usePlanner((state) => state.setExporting)
  const exportProject = usePlanner((state) => state.exportProject)
  const importProject = usePlanner((state) => state.importProject)
  const resetProject = usePlanner((state) => state.resetProject)
  const loadExample = usePlanner((state) => state.loadExample)
  const furniture = usePlanner((state) => state.furniture)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const embedParams = new URLSearchParams(window.location.search)
  const embedded = embedParams.get("embed") === "1"
  const returnTo = safeReturnTo(embedParams.get("returnTo") || "/")
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const realistic =
    ambience.softShadows && ambience.textures && ambience.ambientOcclusion && ambience.vegetation
  const allLocked = furniture.length > 0 && furniture.every((item) => item.locked)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  async function exportPng() {
    setBusy(true)
    setMenuOpen(false)
    setExporting(true)
    await Promise.all([waitFrames(3), new Promise((resolve) => window.setTimeout(resolve, 180))])
    const data = sceneApi.current.capture?.()
    setExporting(false)
    setBusy(false)
    if (!data) {
      setToast("Export impossible : la scène n'est pas prête.")
      return
    }
    const date = new Date().toISOString().slice(0, 10)
    const base64 = data.split(",")[1] ?? ""
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    const blob = new Blob([bytes], { type: "image/png" })
    const url = URL.createObjectURL(blob)
    download(`maison-amenagement-${view}-${date}.png`, url)
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    setToast("Image PNG exportée.")
  }

  function exportJson() {
    setMenuOpen(false)
    const data = exportProject()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    download(`maison-amenagement-${new Date().toISOString().slice(0, 10)}.json`, url)
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    setToast("Projet exporté en JSON.")
  }

  async function importJson(file: File) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as ProjectFile
      if (parsed.app !== "casa-planner" || !Array.isArray(parsed.furniture)) {
        setToast("Ce fichier n'est pas un projet du planificateur.")
        return
      }
      importProject(parsed)
      setToast("Projet importé.")
    } catch {
      setToast("Fichier JSON illisible.")
    }
  }

  return (
    <header className="topbar">
      <div className="topbar__brand">
        {embedded ? (
          <a
            className="topbar__back"
            href={returnTo}
            target="_top"
            title="Retour au carnet CasaRenous"
            aria-label="Retour au carnet CasaRenous"
          >
            <ArrowLeftIcon size={17} />
            <span>Retour</span>
          </a>
        ) : null}
        <span className="brand-mark">
          <HouseIcon size={19} />
        </span>
        <div className="brand-text">
          <span className="brand-text__name">Maison · Aménagement</span>
          <span className="brand-text__sub">Planificateur 3D</span>
        </div>
      </div>

      <div className="topbar__center">
        <div className="segmented" role="group" aria-label="Niveau">
          {(
            [
              { id: "rdc" as LevelId, label: "RdC" },
              { id: "etage" as LevelId, label: "Étage" },
            ] satisfies { id: LevelId; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={level === item.id ? "is-active" : ""}
              onClick={() => setLevel(item.id)}
              aria-pressed={level === item.id}
            >
              {item.id === "etage" ? <LayersIcon size={14} /> : null}
              {item.label}
            </button>
          ))}
        </div>

        <span className="topbar__divider" />

        <div className="segmented" role="group" aria-label="Mode de vue">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "is-active" : ""}
              onClick={() => setView(item.id)}
              aria-pressed={view === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar__actions">
        <div className="history-actions">
          <button
            type="button"
            className="icon-button"
            onClick={undo}
            disabled={past.length === 0}
            title="Annuler (Ctrl+Z)"
            aria-label="Annuler"
          >
            <UndoIcon size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={redo}
            disabled={future.length === 0}
            title="Rétablir (Ctrl+Shift+Z)"
            aria-label="Rétablir"
          >
            <RedoIcon size={17} />
          </button>
        </div>

        <span className="save-state" title="Sauvegarde automatique dans le navigateur">
          <span className={`save-state__dot${savedAt ? " save-state__dot--saved" : ""}`} />
          <span className="save-state__text">{savedAt ? "Enregistré" : "Sauvegarde…"}</span>
        </span>

        <button
          type="button"
          className={`button button--outline button--sm realistic-toggle${realistic ? " is-on" : ""}`}
          onClick={() => setRealistic(!realistic)}
          title="Activer/désactiver le rendu réaliste"
        >
          {realistic ? <CheckIcon size={14} /> : <SparkleIcon size={14} />}
          <span className="realistic-toggle__label">Rendu réaliste</span>
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={() => void exportPng()}
          disabled={busy}
          title="Exporter une image PNG"
          aria-label="Exporter une image PNG"
        >
          <CameraIcon size={17} />
        </button>

        <div className="menu" ref={menuRef}>
          <button
            type="button"
            className={`icon-button${menuOpen ? " is-open" : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            title="Projet"
            aria-label="Menu projet"
            aria-expanded={menuOpen}
          >
            <DownloadIcon size={17} />
            <ChevronDownIcon size={12} className="menu__chevron" />
          </button>
          {menuOpen ? (
            <div className="menu__panel">
              <button type="button" onClick={() => void exportPng()}>
                <CameraIcon size={16} />
                <span>Exporter l'image PNG</span>
              </button>
              <button type="button" onClick={exportJson}>
                <DownloadIcon size={16} />
                <span>Exporter le projet JSON</span>
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}>
                <UploadIcon size={16} />
                <span>Importer un projet</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  if (furniture.length > 0 && !window.confirm("Remplacer l'am?nagement actuel par l'exemple ?")) return
                  loadExample()
                  setToast("Exemple d'am?nagement charg?.")
                }}
              >
                <SparkleIcon size={16} />
                <span>Charger l'exemple</span>
              </button>
              <div className="menu__sep" />
              <button
                type="button"
                className="menu__danger"
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm("Recommencer avec un aménagement vide ?")) {
                    resetProject()
                    setToast("Nouvel aménagement.")
                  }
                }}
              >
                <span className="menu__danger-dot" />
                <span>Nouvel aménagement</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importJson(file)
          event.target.value = ""
        }}
      />

      {toast ? <div className="toast">{toast}</div> : null}
    </header>
  )
}
