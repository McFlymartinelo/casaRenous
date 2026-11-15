import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { formatCents } from "@casarenous/shared"
import {
  Badge,
  Button,
  Card,
  PwaInstallCard,
  Skeleton,
  Stat,
  useOnlineStatus,
} from "@/aura/react"
import { useAuth } from "@/auth/AuthProvider"
import { AuthenticatedImage } from "@/components/AuthenticatedImage"
import {
  CalendarIcon,
  CameraIcon,
  CheckIcon,
  EditIcon,
  MapPinIcon,
} from "@/components/icons"
import { KeyDatesSheet } from "@/features/key-dates/KeyDatesSheet"
import { PhotoSheet } from "@/features/photos/PhotoSheet"
import {
  useBudget,
  useKeyDates,
  useMilestones,
  usePhotos,
  useProject,
  useReserves,
  useRooms,
} from "@/hooks/useApi"
import { api } from "@/lib/api-client"
import { countdown, formatDate, todayIso } from "@/lib/dates"

export function PiazzaScreen() {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const project = useProject()
  const rooms = useRooms()
  const keyDates = useKeyDates()
  const milestones = useMilestones()
  const budget = useBudget()
  const reserves = useReserves({ status: "open" })
  const photos = usePhotos({ limit: 8 })
  const [datesOpen, setDatesOpen] = useState(false)
  const [showAllDates, setShowAllDates] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)

  const dates = [...(keyDates.data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const livraison = dates.find((item) => item.slug === "livraison" || item.kind === "livraison")
  const delivery = livraison ? countdown(livraison.date) : null
  const nextMilestone = [...(milestones.data ?? [])]
    .filter((item) => item.status !== "done" && item.status !== "cancelled")
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))[0]
  const openReserves = reserves.data?.items?.length ?? 0
  const summary = budget.data?.summary
  const paidRatio =
    summary && summary.totalCents > 0
      ? Math.max(0, Math.min(100, Math.round((summary.paidCents / summary.totalCents) * 100)))
      : 0

  if (keyDates.isLoading && !keyDates.data) {
    return (
      <div className="app-pad app-stack">
        <Skeleton height={190} />
        <div className="app-stat-grid">
          <Skeleton height={82} />
          <Skeleton height={82} />
          <Skeleton height={82} />
        </div>
        <Skeleton height={220} />
      </div>
    )
  }

  return (
    <div className="app-pad app-stack">
      <Card variant="hero">
        <div className="aura-row-flex" style={{ justifyContent: "space-between" }}>
          <p className="aura-hero__eyebrow">Livraison prévue</p>
          {delivery ? (
            <span className="app-hero-chip">{delivery.label}</span>
          ) : null}
        </div>
        <p className="aura-hero__value" style={{ marginTop: 10 }}>
          {livraison ? formatDate(livraison.date, { year: "numeric" }) : "À définir"}
        </p>
        <p className="aura-hero__meta" style={{ marginTop: 8 }}>
          {delivery
            ? delivery.past
              ? "Date passée ou livraison réalisée — ajuste-la dans les dates clés."
              : `Encore ${delivery.days} jours de chantier · ${dates.length} dates clés au carnet.`
            : "Renseigne la date de livraison depuis les dates clés."}
        </p>
        <div style={{ marginTop: 16 }}>
          <div className="aura-row-flex" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="aura-hero__meta">Budget payé</span>
            <span className="aura-hero__meta app-num">{paidRatio} %</span>
          </div>
          <div className="app-progress" aria-hidden>
            <div className="app-progress__fill" style={{ width: `${paidRatio}%` }} />
          </div>
        </div>
      </Card>

      <div className="app-stat-grid">
        <Stat
          label="Budget engagé"
          value={summary ? formatCents(summary.totalCents) : "—"}
          hint={
            summary
              ? summary.pendingCount > 0
                ? `${summary.count} mouvement(s) · ${summary.pendingCount} à compléter`
                : `${summary.count} mouvement(s)`
              : "CCMI + avenants"
          }
        />
        <Stat
          label="Prochain jalon"
          value={nextMilestone ? formatDate(nextMilestone.plannedStart, { year: undefined }) : "—"}
          hint={nextMilestone?.title ?? "Aucun jalon à venir"}
        />
        <Stat
          label="Réserves"
          value={openReserves}
          tone={openReserves > 0 ? "danger" : "success"}
          hint={openReserves > 0 ? "à lever" : "aucune ouverte"}
        />
      </div>

      <Button
        block
        size="lg"
        icon={isAdmin ? <CalendarIcon size={18} /> : <CameraIcon size={18} />}
        onClick={() => (isAdmin ? setDatesOpen(true) : setPhotoOpen(true))}
      >
        {isAdmin ? "Ajuster les dates clés" : "Ajouter une photo de chantier"}
      </Button>

      <Card>
        <div className="app-section-head" style={{ marginBottom: 4 }}>
          <div>
            <p className="app-kicker">Le fil du projet</p>
            <p className="aura-h3">Dates clés</p>
          </div>
          {isAdmin ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<EditIcon size={15} />}
              onClick={() => setDatesOpen(true)}
            >
              Modifier
            </Button>
          ) : null}
        </div>
        <div>
          {(showAllDates ? dates : dates.slice(0, 6)).map((item) => (
            <div
              key={item.id}
              className={`app-date-row ${item.completedOn ? "is-done" : ""}`}
            >
              <p className="app-date-row__date">
                {formatDate(item.date, { year: undefined })}
              </p>
              <div className="app-date-row__body">
                <p className="app-date-row__title">
                  <span className="app-date-row__label">{item.label}</span>
                  {item.completedOn ? (
                    <Badge tone="success">
                      <CheckIcon size={12} />
                      Réalisé
                    </Badge>
                  ) : item.isProvisional ? (
                    <Badge tone="warn">Provisoire</Badge>
                  ) : null}
                </p>
                {item.note ? <p className="app-date-row__note">{item.note}</p> : null}
              </div>
            </div>
          ))}
          {dates.length > 6 ? (
            <Button
              block
              size="sm"
              variant="ghost"
              onClick={() => setShowAllDates((value) => !value)}
            >
              {showAllDates
                ? "Réduire"
                : `Voir les ${dates.length} dates clés du projet`}
            </Button>
          ) : null}
        </div>
      </Card>

      {(photos.data?.items.length ?? 0) > 0 ? (
        <Card>
          <div className="app-section-head" style={{ marginBottom: 10 }}>
            <div>
              <p className="app-kicker">Journal de chantier</p>
              <p className="aura-h3">Derniers instants</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate("/chantier")}>
              Tout voir
            </Button>
          </div>
          <div className="app-photo-strip">
            {photos.data?.items.slice(0, 6).map((photo) => (
              <div className="app-photo-thumb" key={photo.id}>
                <AuthenticatedImage
                  cacheKey={`thumb-${photo.id}`}
                  loader={() => api.photos.thumb(photo.id)}
                  alt={photo.caption ?? "Photo de chantier"}
                  fallback={<MapPinIcon size={20} />}
                />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {project.data ? (
        <Card variant="soft">
          <p className="app-kicker">La maison</p>
          <p className="aura-h3" style={{ marginTop: 4 }}>
            {project.data.footprintWidthM.toLocaleString("fr-FR")} ×{" "}
            {project.data.footprintDepthM.toLocaleString("fr-FR")} m · R+
            {project.data.levels - 1}
          </p>
          <p className="app-small" style={{ marginTop: 4 }}>
            {project.data.exteriorSpecs.finish} · {project.data.exteriorSpecs.roof} ·{" "}
            {project.data.exteriorSpecs.terrace}.
          </p>
        </Card>
      ) : null}

      <PwaInstallCard
        appName="CasaRenous"
        title="Installer CasaRenous"
        description="Le carnet reste accessible sur le chantier, même sans réseau."
        storageKey="casarenous-install-dismissed"
      />

      <p className="app-tiny" style={{ textAlign: "center" }}>
        {formatDate(todayIso(), { weekday: "long" })} ·{" "}
        {online ? "connecté au carnet" : "hors ligne, dernière version en cache"}
      </p>

      {datesOpen ? (
        <KeyDatesSheet
          open={datesOpen}
          onClose={() => setDatesOpen(false)}
          dates={dates}
        />
      ) : null}
      {photoOpen ? (
        <PhotoSheet
          open={photoOpen}
          onClose={() => setPhotoOpen(false)}
          rooms={rooms.data ?? []}
          online={online}
        />
      ) : null}
    </div>
  )
}
