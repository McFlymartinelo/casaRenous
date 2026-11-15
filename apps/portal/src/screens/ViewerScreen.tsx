import { Component, lazy, Suspense, useState, type ReactNode } from "react"
import type { Room } from "@casarenous/shared"
import { Badge, Button, Card, Segmented, Skeleton, Switch } from "@/aura/react"
import { RoomSheet } from "@/features/rooms/RoomSheet"
import { useProject, useRooms } from "@/hooks/useApi"
import { CubeIcon } from "@/components/icons"
import type { ViewerLevel, ViewerMode } from "@/features/viewer/HouseViewer"
import {
  DEFAULT_SPOT_ID,
  VIEWER_SPOTS,
  findSpot,
  type ViewerSpot,
} from "@/features/viewer/spots"

const HouseViewer = lazy(() => import("@/features/viewer/HouseViewer"))

class ViewerBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    console.warn("[CasaRenous] Vue 3D indisponible", error)
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="app-viewer__fallback">
          <CubeIcon size={32} />
          <p className="aura-h3">Vue 3D indisponible sur cet appareil</p>
          <p className="app-small">
            Le plan et les fiches pièces restent accessibles. Essaie de recharger ou
            d'utiliser un navigateur plus récent.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

const MODE_OPTIONS: { value: ViewerMode; label: string }[] = [
  { value: "orbit", label: "Vue 3D" },
  { value: "walk", label: "Visite" },
]

const LEVEL_OPTIONS: { value: ViewerLevel; label: string }[] = [
  { value: "global", label: "Global" },
  { value: "rdc", label: "RdC" },
  { value: "etage", label: "Étage" },
]

const LEVEL_LABEL: Record<Room["level"], string> = {
  rdc: "Rez-de-chaussée",
  etage: "Étage",
  exterieur: "Extérieur",
}

export function ViewerScreen() {
  const rooms = useRooms()
  const project = useProject()
  const [mode, setMode] = useState<ViewerMode>("orbit")
  const [level, setLevel] = useState<ViewerLevel>("global")
  const [showRoof, setShowRoof] = useState(true)
  const [spotId, setSpotId] = useState(DEFAULT_SPOT_ID)
  const [selected, setSelected] = useState<Room | null>(null)

  const data = rooms.data ?? []
  const interior = data.filter((room) => room.level !== "exterieur")
  const totalArea = interior.reduce((sum, room) => sum + (room.areaM2 ?? 0), 0)
  const byLevel = {
    rdc: data.filter((room) => room.level === "rdc"),
    etage: data.filter((room) => room.level === "etage"),
    exterieur: data.filter((room) => room.level === "exterieur"),
  }
  const spot: ViewerSpot = findSpot(spotId)

  function selectRoom(slug: string) {
    const room = data.find((item) => item.slug === slug)
    if (room) setSelected(room)
  }

  function goToSpot(id: string) {
    setSpotId(id)
    setMode("walk")
  }

  return (
    <div className="app-pad app-stack">
      <div className="app-viewer">
        <ViewerBoundary>
          <Suspense
            fallback={
              <div className="app-viewer__fallback">
                <Skeleton height={28} width="55%" />
                <Skeleton height={18} width="72%" />
                <p className="app-small">Préparation de la maquette…</p>
              </div>
            }
          >
            <HouseViewer
              mode={mode}
              level={level}
              showRoof={showRoof}
              spot={spot}
              rooms={data}
              selectedSlug={selected?.slug ?? null}
              onSelectRoom={selectRoom}
            />
          </Suspense>
        </ViewerBoundary>
        {mode === "orbit" ? (
          <div className="app-viewer__overlay">
            <CubeIcon size={15} />
            {level === "global"
              ? "Maison complète"
              : level === "rdc"
                ? "Rez-de-chaussée"
                : "Étage"}
          </div>
        ) : null}
      </div>

      <Segmented<ViewerMode>
        label="Mode d'exploration"
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
      />

      {mode === "orbit" ? (
        <>
          <Segmented<ViewerLevel>
            label="Niveau affiché"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={setLevel}
          />
          <div className="app-toggle-row">
            <div>
              <p className="app-small" style={{ fontWeight: 600 }}>
                Afficher la toiture
              </p>
              <p className="app-small app-muted">
                Masque-la pour voir l'intérieur depuis le dessus.
              </p>
            </div>
            <Switch
              checked={showRoof && level === "global"}
              onChange={setShowRoof}
              label="Afficher la toiture"
              disabled={level !== "global"}
            />
          </div>
        </>
      ) : (
        <>
          <div className="app-scroll-row" role="group" aria-label="Points de visite">
            {VIEWER_SPOTS.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.id === spotId ? "primary" : "outline"}
                onClick={() => setSpotId(item.id)}
                aria-pressed={item.id === spotId}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="app-small app-muted">
            Sur ordinateur : clique dans la vue puis ZQSD / WASD, souris pour regarder,
            Maj pour courir, Échap pour sortir du mode visite. Sur mobile : glisse pour
            regarder et utilise le stick pour avancer.
          </p>
        </>
      )}

      <div className="app-stat-grid">
        <div className="aura-stat">
          <span className="aura-stat__label">Surface</span>
          <span className="aura-stat__value app-num">
            {totalArea.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²
          </span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Pièces</span>
          <span className="aura-stat__value app-num">{interior.length}</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Niveaux</span>
          <span className="aura-stat__value app-num">R+{(project.data?.levels ?? 2) - 1}</span>
        </div>
      </div>

      <div className="app-section-head">
        <div>
          <p className="app-kicker">Fiches pièces</p>
          <p className="aura-h3">Explorer la maison</p>
        </div>
        <Badge tone="neutral">{data.length} espaces</Badge>
      </div>

      {rooms.isLoading && !rooms.data ? (
        <div className="app-room-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} height={76} />
          ))}
        </div>
      ) : (
        <div className="aura-stack" style={{ gap: 18 }}>
          {(["rdc", "etage", "exterieur"] as const).map((levelKey) => {
            const items = byLevel[levelKey]
            if (!items.length) return null
            return (
              <section key={levelKey}>
                <p className="app-kicker" style={{ marginBottom: 8 }}>
                  {LEVEL_LABEL[levelKey]}
                </p>
                <div className="app-room-grid">
                  {items.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className="app-room-card aura-press"
                      onClick={() => setSelected(room)}
                    >
                      <span className="app-room-card__area">
                        {room.areaM2
                          ? `${room.areaM2.toLocaleString("fr-FR")} m²`
                          : "Extérieur"}
                      </span>
                      <span className="app-room-card__name">{room.name}</span>
                      <span className="app-room-card__level">{LEVEL_LABEL[room.level]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Card variant="soft">
        <p className="app-kicker">Visite de la maison</p>
        <p className="app-small" style={{ marginTop: 4 }}>
          La maquette 3D est chargée depuis <code>casarenous.glb</code>. En mode
          « Vue 3D », fais tourner la maison et sélectionne un niveau ; en mode
          « Visite », déplace-toi à l'intérieur comme dans un jeu. Touche une pièce
          pour ouvrir ses cotes.
        </p>
        <div className="app-chip-row" style={{ marginTop: 10 }}>
          {VIEWER_SPOTS.slice(0, 4).map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant="ghost"
              onClick={() => goToSpot(item.id)}
            >
              Aller à : {item.label}
            </Button>
          ))}
        </div>
      </Card>

      {selected ? (
        <RoomSheet
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          room={selected}
          project={project.data}
        />
      ) : null}
    </div>
  )
}
