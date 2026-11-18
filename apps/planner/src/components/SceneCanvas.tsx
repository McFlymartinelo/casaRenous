import { Component, Suspense, useCallback, useEffect, useState, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"
import * as THREE from "three"
import { HOUSE, getLevel, roomAt } from "@/config/house"
import { QualityMonitor, dprForTier, initialDpr, type QualitySample } from "@/scene/QualityMonitor"
import { addCatalogAt } from "@/lib/place"
import { formatHour, sunState, timeOfDay } from "@/lib/sun"
import { formatMeters } from "@/lib/format"
import { usePlanner } from "@/store/planner"
import { sceneApi } from "@/scene/scene-api"
import { HouseScene } from "@/scene/HouseScene"
import { getCatalogItem, getItemSize } from "@/catalog/catalog"

/** Plafond de résolution : au-delà, le gain visuel est nul et le coût GPU explose. */
const MAX_DPR = 1.5

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    console.error("[planner] scène 3D indisponible", error)
  }
  override render() {
    if (this.state.failed) {
      return (
        <div className="scene-fallback">
          <p className="scene-fallback__title">La vue 3D n'a pas pu démarrer</p>
          <p className="scene-fallback__text">
            Le catalogue et les réglages restent disponibles. Recharge la page ou essaie un
            navigateur récent avec WebGL 2.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

export function SceneCanvas() {
  const view = usePlanner((state) => state.view)
  const level = usePlanner((state) => state.level)
  const ambience = usePlanner((state) => state.ambience)
  const selectedId = usePlanner((state) => state.selectedId)
  const furniture = usePlanner((state) => state.furniture)
  const quality = usePlanner((state) => state.quality)
  const setQuality = usePlanner((state) => state.setQuality)
  const [fps, setFps] = useState(0)
  const handleSample = useCallback(
    (sample: QualitySample) => {
      setQuality(sample.tier)
      setFps(sample.fps)
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__plannerQuality = sample
      }
    },
    [setQuality],
  )
  const maxDpr = initialDpr(MAX_DPR)
  const dpr = dprForTier(quality, maxDpr)
  const [dropActive, setDropActive] = useState(false)
  const [locked, setLocked] = useState(false)
  const [ready, setReady] = useState(false)
  const sun = sunState(ambience.hour, ambience.latitude, ambience.dayOfYear)
  const levelConfig = getLevel(level)
  const selected = furniture.find((item) => item.id === selectedId)
  const selectedCatalog = selected ? getCatalogItem(selected.catalogId) : null
  const selectedSize = selected ? getItemSize(selected) : null
  const room = selected ? roomAt(selected.level, [selected.x, selected.z]) : null
  const place = room ? room.name : view === "plan" ? `Plan · ${levelConfig.shortName}` : levelConfig.name

  useEffect(() => {
    function onLockChange() {
      setLocked(document.pointerLockElement instanceof HTMLCanvasElement)
    }
    document.addEventListener("pointerlockchange", onLockChange)
    return () => document.removeEventListener("pointerlockchange", onLockChange)
  }, [])

  return (
    <div
      className={`scene${dropActive ? " scene--drop" : ""}${view === "walk" ? " scene--walk" : ""}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        setDropActive(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setDropActive(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDropActive(false)
        const id =
          event.dataTransfer.getData("application/x-planner-item") ||
          event.dataTransfer.getData("text/plain")
        if (!id) return
        const point = sceneApi.current.screenToFloor?.(event.clientX, event.clientY)
        if (point) addCatalogAt(id, point)
      }}
    >
      <SceneBoundary>
        <Canvas
          shadows
          dpr={dpr}
          frameloop="always"
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            // Coûteux en continu : la capture PNG redessine juste avant toDataURL.
            preserveDrawingBuffer: false,
            toneMapping: THREE.AgXToneMapping,
            toneMappingExposure: ambience.exposure,
          }}
          camera={{
            position: HOUSE.camera.position,
            fov: HOUSE.camera.fov,
            near: 0.03,
            far: 180,
          }}
          onCreated={({ gl }) => {
            ;(window as unknown as Record<string, unknown>).__plannerCreated = true
            gl.shadowMap.type = THREE.PCFSoftShadowMap
            setReady(true)
          }}
        >
          <Suspense fallback={null}>
            <HouseScene />
          </Suspense>
          <QualityMonitor maxDpr={maxDpr} onSample={handleSample} />
        </Canvas>
      </SceneBoundary>

      <div className="scene-hud">
        <div className="scene-pill">
          <span className={`scene-pill__dot${sun.isNight ? " scene-pill__dot--night" : ""}`} />
          <span>{place}</span>
          <span className="scene-pill__sep" />
          <span className="scene-pill__sun">{sun.isNight ? "lune" : "soleil"} à {formatHour(ambience.hour)}</span>
        </div>
        {selectedCatalog ? (
          <div className="scene-pill scene-pill--sub">
            {selectedCatalog.name} · {formatMeters(selectedSize?.w ?? selectedCatalog.w)} × {formatMeters(selectedSize?.d ?? selectedCatalog.d)}
          </div>
        ) : (
          <div className="scene-pill scene-pill--sub">
            {timeOfDay(ambience.hour)} · {Math.round(ambience.exposure * 100)} % d'exposition
          </div>
        )}
        {quality !== "high" ? (
          <div
            className="scene-pill scene-pill--quality"
            title={`Qualité ajustée automatiquement · ${Math.round(fps)} images/s mesurées`}
          >
            Qualité auto · {quality === "low" ? "réduite" : "moyenne"} · {Math.round(fps)} i/s
          </div>
        ) : null}
      </div>

      {view === "plan" ? (
        <div className="scene-compass" aria-hidden="true">
          <span className="scene-compass__n">N</span>
          <span className="scene-compass__arrow">↑</span>
        </div>
      ) : null}

      {view === "walk" ? (
        <div className={`walk-ui${locked ? " walk-ui--locked" : ""}`}>
          {locked ? <div className="walk-cross" aria-hidden="true" /> : null}
          <div className="walk-hint">
            {locked ? (
              <span>ZQSD / WASD pour marcher · Maj pour courir · Échap pour libérer la souris</span>
            ) : (
              <span>
                Clique dans la scène pour regarder autour · ZQSD / WASD pour avancer ·
                Échap pour sortir
              </span>
            )}
          </div>
        </div>
      ) : null}

      {dropActive ? (
        <div className="scene-drop">
          <div className="scene-drop__inner">
            <span className="scene-drop__plus">+</span>
            <span>Déposez le meuble dans la pièce</span>
            <span className="scene-drop__hint">accroche 5 cm · collisions actives</span>
          </div>
        </div>
      ) : null}

      {!ready ? <div className="scene-loading" /> : null}
    </div>
  )
}
