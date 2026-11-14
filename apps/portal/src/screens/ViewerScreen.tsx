import { Component, lazy, Suspense, useState, type ReactNode } from "react"
import type { Room } from "@casarenous/shared"
import { Badge, Card, Segmented, Skeleton } from "@/aura/react"
import { RoomSheet } from "@/features/rooms/RoomSheet"
import { useProject, useRooms } from "@/hooks/useApi"
import { CubeIcon } from "@/components/icons"
import type { ViewerLevel } from "@/features/viewer/HouseViewer"

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
  const [level, setLevel] = useState<ViewerLevel>("global")
  const [selected, setSelected] = useState<Room | null>(null)

  const data = rooms.data ?? []
  const interior = data.filter((room) => room.level !== "exterieur")
  const totalArea = interior.reduce((sum, room) => sum + (room.areaM2 ?? 0), 0)
  const byLevel = {
    rdc: data.filter((room) => room.level === "rdc"),
    etage: data.filter((room) => room.level === "etage"),
    exterieur: data.filter((room) => room.level === "exterieur"),
  }

  function selectRoom(slug: string) {
    const room = data.find((item) => item.slug === slug)
    if (room) setSelected(room)
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
              level={level}
              rooms={data}
              selectedSlug={selected?.slug ?? null}
              onSelectRoom={selectRoom}
            />
          </Suspense>
        </ViewerBoundary>
        <div className="app-viewer__overlay">
          <CubeIcon size={15} />
          {level === "global" ? "Maison complète" : level === "rdc" ? "Rez-de-chaussée" : "Étage"}
        </div>
      </div>

      <Segmented<ViewerLevel>
        label="Niveau affiché"
        options={LEVEL_OPTIONS}
        value={level}
        onChange={setLevel}
      />

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
        <p className="app-kicker">Maquette 3D</p>
        <p className="app-small" style={{ marginTop: 4 }}>
          Touche une pièce dans la maquette ou dans la liste pour ouvrir ses cotes.
          La maquette filaire est utilisée tant que le fichier <code>casarenous.glb</code>{" "}
          n'est pas déposé.
        </p>
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
