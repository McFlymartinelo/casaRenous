import { useDeferredValue, useState } from "react"
import type { Document, Photo, Reserve, Room } from "@casarenous/shared"
import {
  Badge,
  Button,
  Card,
  Chip,
  Input,
  ListRow,
  Segmented,
  Skeleton,
  useOnlineStatus,
} from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useAuth } from "@/auth/AuthProvider"
import { AuthenticatedImage } from "@/components/AuthenticatedImage"
import {
  CameraIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
  MapPinIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons"
import { UploadDocumentSheet } from "@/features/documents/UploadDocumentSheet"
import { InvoiceAnalysisSheet } from "@/features/documents/InvoiceAnalysisSheet"
import { DocumentCategoriesSheet } from "@/features/documents/DocumentCategoriesSheet"
import { BUILTIN_CATEGORIES, BUILTIN_LABEL } from "@/features/documents/categories"
import { NoteSheet } from "@/features/notes/NoteSheet"
import { PhotoDetailSheet } from "@/features/photos/PhotoDetailSheet"
import { PhotoSheet } from "@/features/photos/PhotoSheet"
import { ReserveDetailSheet } from "@/features/reserves/ReserveDetailSheet"
import { ReserveSheet } from "@/features/reserves/ReserveSheet"
import {
  useDeleteDocument,
  useDeletePhoto,
  useDocumentCategories,
  useDocuments,
  useNotes,
  usePhotos,
  useReserves,
  useRooms,
} from "@/hooks/useApi"
import { api } from "@/lib/api-client"
import { formatDate, formatDateTime } from "@/lib/dates"
import { downloadBlob } from "@/lib/media"
import { useOutbox } from "@/lib/outbox"

type Mode = "documents" | "journal" | "reserves"

const MODES: { value: Mode; label: string }[] = [
  { value: "documents", label: "Documents" },
  { value: "journal", label: "Journal" },
  { value: "reserves", label: "Réserves" },
]

const RESERVE_STATUS: Record<Reserve["status"], { label: string; tone: "neutral" | "warn" | "success" | "danger" }> = {
  open: { label: "Ouverte", tone: "warn" },
  in_progress: { label: "En cours", tone: "warn" },
  resolved: { label: "Levée", tone: "success" },
  accepted: { label: "Acceptée", tone: "success" },
}

const SEVERITY_LABEL: Record<Reserve["severity"], string> = {
  mineure: "Mineure",
  majeure: "Majeure",
  bloquante: "Bloquante",
}

function roomName(rooms: Room[], id: string | null): string | null {
  if (!id) return null
  return rooms.find((room) => room.id === id)?.name ?? null
}

export function ChantierScreen() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const online = useOnlineStatus()
  const { notify } = useNotify()
  const rooms = useRooms()
  const notes = useNotes()
  const photos = usePhotos({ limit: 40 })
  const reserves = useReserves({ limit: 100 })
  const outbox = useOutbox()

  const [mode, setMode] = useState<Mode>("documents")
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState("all")
  const categories = useDocumentCategories()
  const customCategories = categories.data?.items ?? []
  const documents = useDocuments({
    q: deferredQuery.trim() || undefined,
    category: filter.startsWith("built:")
      ? (filter.slice("built:".length) as Document["category"])
      : undefined,
    customCategoryId: filter.startsWith("custom:")
      ? filter.slice("custom:".length)
      : undefined,
    limit: 60,
  })

  const deleteDocument = useDeleteDocument()
  const deletePhoto = useDeletePhoto()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [selectedReserve, setSelectedReserve] = useState<Reserve | null>(null)
  const [analysisTarget, setAnalysisTarget] = useState<Document | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const openReserves = (reserves.data?.items ?? []).filter(
    (item) => item.status === "open" || item.status === "in_progress",
  )

  async function downloadDocument(doc: Document) {
    setDownloading(doc.id)
    try {
      const blob = await api.documents.file(doc.id)
      downloadBlob(blob, doc.originalName)
    } catch {
      notify({ title: "Téléchargement impossible", message: "Réessaie dans un instant.", tone: "danger" })
    } finally {
      setDownloading(null)
    }
  }

  async function exportReserves() {
    try {
      const blob = await api.reserves.exportCsv()
      downloadBlob(blob, "casarenous-reserves.csv")
    } catch {
      notify({ title: "Export impossible", message: "Le serveur est injoignable.", tone: "danger" })
    }
  }

  const primary = (() => {
    if (mode === "documents" && isAdmin) {
      return (
        <Button block size="lg" icon={<UploadIcon size={18} />} onClick={() => setUploadOpen(true)}>
          Ajouter un document
        </Button>
      )
    }
    if (mode === "journal") {
      return (
        <Button block size="lg" icon={<CameraIcon size={18} />} onClick={() => setPhotoOpen(true)}>
          Ajouter une photo
        </Button>
      )
    }
    if (mode === "reserves") {
      return (
        <Button block size="lg" icon={<PlusIcon size={18} />} onClick={() => setReserveOpen(true)}>
          Signaler une réserve
        </Button>
      )
    }
    return null
  })()

  return (
    <div className="app-pad app-stack">
      <div className="app-stat-grid">
        <div className="aura-stat">
          <span className="aura-stat__label">Documents</span>
          <span className="aura-stat__value app-num">{documents.data?.items.length ?? "—"}</span>
          <span className="aura-stat__hint">coffre-fort</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Photos</span>
          <span className="aura-stat__value app-num">{photos.data?.items.length ?? "—"}</span>
          <span className="aura-stat__hint">journal</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Réserves</span>
          <span className={`aura-stat__value app-num ${openReserves.length ? "app-danger-text" : ""}`}>
            {openReserves.length}
          </span>
          <span className="aura-stat__hint">ouvertes</span>
        </div>
      </div>

      <Segmented<Mode> label="Section du chantier" options={MODES} value={mode} onChange={setMode} />

      {primary}

      {mode === "documents" ? (
        <div className="app-stack">
          <Input
            label="Rechercher"
            placeholder="Plan, facture, permis…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="app-scroll-row">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              Tout
            </Chip>
            {BUILTIN_CATEGORIES.map((item) => (
              <Chip
                key={item.value}
                active={filter === `built:${item.value}`}
                onClick={() => setFilter(`built:${item.value}`)}
              >
                {item.label}
              </Chip>
            ))}
            {customCategories.map((item) => (
              <Chip
                key={item.id}
                active={filter === `custom:${item.id}`}
                onClick={() => setFilter(`custom:${item.id}`)}
              >
                {item.name}
              </Chip>
            ))}
          </div>
          {isAdmin ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<PlusIcon size={14} />}
              onClick={() => setCategoriesOpen(true)}
            >
              Gérer les catégories
            </Button>
          ) : null}

          {documents.isLoading && !documents.data ? (
            <Skeleton height={200} />
          ) : documents.data?.items.length ? (
            <Card flush>
              <div className="app-list">
                {documents.data.items.map((doc) => (
                  <ListRow
                    key={doc.id}
                    icon={<FileIcon size={19} />}
                    title={doc.title}
                    subtitle={`${doc.customCategoryName ?? BUILTIN_LABEL[doc.category]} · ${formatDate(doc.createdAt.slice(0, 10))}`}
                    trailing={
                      <span className="aura-row-flex">
                        {doc.mime === "application/pdf" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Lire ${doc.title}`}
                            title="Lire la facture"
                            onClick={() => setAnalysisTarget(doc)}
                          >
                            <SearchIcon size={16} />
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Télécharger ${doc.title}`}
                          loading={downloading === doc.id}
                          onClick={() => void downloadDocument(doc)}
                        >
                          <DownloadIcon size={16} />
                        </Button>
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Supprimer ${doc.title}`}
                            onClick={() => {
                              if (window.confirm(`Supprimer « ${doc.title} » ?`)) {
                                void deleteDocument.mutateAsync(doc.id)
                              }
                            }}
                          >
                            <TrashIcon size={16} />
                          </Button>
                        ) : null}
                      </span>
                    }
                  />
                ))}
              </div>
            </Card>
          ) : (
            <Card variant="soft">
              <p className="aura-h3">Coffre-fort vide</p>
              <p className="app-small" style={{ marginTop: 4 }}>
                {isAdmin
                  ? "Dépose le CCMI, les plans et les factures pour les retrouver sur le chantier."
                  : "Les documents déposés par l'admin apparaîtront ici."}
              </p>
            </Card>
          )}
        </div>
      ) : null}

      {mode === "journal" ? (
        <div className="app-stack">
          {photos.isLoading && !photos.data ? (
            <Skeleton height={220} />
          ) : photos.data?.items.length ? (
            <div className="app-photo-grid">
              {photos.data.items.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className="app-photo-card aura-press"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <AuthenticatedImage
                    cacheKey={`grid-${photo.id}`}
                    loader={() => api.photos.thumb(photo.id)}
                    alt={photo.caption ?? "Photo de chantier"}
                    fallback={
                      <div className="app-media-placeholder">
                        <MapPinIcon size={20} />
                      </div>
                    }
                  />
                  <span className="app-photo-card__body">
                    <span className="app-photo-card__caption">
                      {photo.caption ?? "Sans légende"}
                    </span>
                    <span className="app-tiny" style={{ display: "block", marginTop: 2 }}>
                      {formatDate(photo.takenAt.slice(0, 10))}
                      {photo.lat != null ? " · géolocalisée" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Card variant="soft">
              <p className="aura-h3">Aucune photo</p>
              <p className="app-small" style={{ marginTop: 4 }}>
                Le journal de chantier se remplit depuis le téléphone, même sans réseau.
              </p>
            </Card>
          )}

          <div className="app-inline-actions">
            <Button variant="outline" size="sm" icon={<NoteIcon size={15} />} onClick={() => setNoteOpen(true)}>
              Ajouter une note
            </Button>
          </div>

          {outbox.items.length ? (
            <Card variant="soft">
              <div className="app-section-head" style={{ marginBottom: 6 }}>
                <p className="app-kicker">File locale</p>
                <Badge tone={outbox.errors ? "danger" : "warn"}>
                  {outbox.items.length} en attente
                </Badge>
              </div>
              <div className="app-list">
                {outbox.items.map((item) => (
                  <ListRow
                    key={item.id}
                    icon={<ClockIcon size={18} />}
                    title={
                      item.kind === "photo"
                        ? item.payload.caption || "Photo"
                        : item.kind === "note"
                          ? item.payload.body.slice(0, 80)
                          : item.payload.title
                    }
                    subtitle={
                      item.status === "error"
                        ? item.error ?? "Refusé"
                        : item.status === "syncing"
                          ? "Synchronisation…"
                          : "Sera envoyé au retour du réseau"
                    }
                    meta={<Badge tone={item.status === "error" ? "danger" : "warn"}>{item.kind}</Badge>}
                  />
                ))}
              </div>
              <Button
                block
                variant="soft"
                size="sm"
                loading={outbox.busy}
                onClick={() => void outbox.flush()}
                disabled={!online}
              >
                Synchroniser maintenant
              </Button>
            </Card>
          ) : null}

          <div>
            <p className="app-kicker" style={{ marginBottom: 6 }}>
              Notes de chantier
            </p>
            {notes.data?.length ? (
              <div className="app-list">
                {notes.data.map((note) => (
                  <ListRow
                    key={note.id}
                    icon={<NoteIcon size={18} />}
                    title={note.body.length > 90 ? `${note.body.slice(0, 90)}…` : note.body}
                    subtitle={`${formatDateTime(note.takenAt)}${roomName(rooms.data ?? [], note.roomId) ? ` · ${roomName(rooms.data ?? [], note.roomId)}` : ""}`}
                  />
                ))}
              </div>
            ) : (
              <p className="app-empty-inline">Aucune note pour l'instant.</p>
            )}
          </div>
        </div>
      ) : null}

      {mode === "reserves" ? (
        <div className="app-stack">
          <div className="app-section-head">
            <p className="app-kicker">Liste de livraison</p>
            <div className="app-inline-actions">
              <Button
                size="sm"
                variant="ghost"
                icon={<DownloadIcon size={15} />}
                onClick={() => void exportReserves()}
              >
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.print()}
              >
                Imprimer
              </Button>
            </div>
          </div>
          {reserves.isLoading && !reserves.data ? (
            <Skeleton height={220} />
          ) : reserves.data?.items.length ? (
            <Card flush>
              <div className="app-list">
                {reserves.data.items.map((reserve) => (
                  <ListRow
                    key={reserve.id}
                    icon={<MapPinIcon size={18} />}
                    title={reserve.title}
                    subtitle={`${SEVERITY_LABEL[reserve.severity]}${reserve.location ? ` · ${reserve.location}` : ""}${reserve.dueDate ? ` · échéance ${formatDate(reserve.dueDate)}` : ""}`}
                    meta={
                      <Badge tone={RESERVE_STATUS[reserve.status].tone}>
                        {RESERVE_STATUS[reserve.status].label}
                      </Badge>
                    }
                    onClick={() => setSelectedReserve(reserve)}
                  />
                ))}
              </div>
            </Card>
          ) : (
            <Card variant="soft">
              <p className="aura-h3">Aucune réserve</p>
              <p className="app-small" style={{ marginTop: 4 }}>
                Les défauts constatés à la livraison seront listés ici, avec leur statut de levée.
              </p>
            </Card>
          )}
        </div>
      ) : null}

      {uploadOpen ? (
        <UploadDocumentSheet
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          rooms={rooms.data ?? []}
          categories={customCategories}
          onUploaded={(doc) => {
            if (doc.category === "facture" && doc.mime === "application/pdf") {
              setAnalysisTarget(doc)
            }
          }}
        />
      ) : null}
      {categoriesOpen ? (
        <DocumentCategoriesSheet onClose={() => setCategoriesOpen(false)} />
      ) : null}
      {analysisTarget ? (
        <InvoiceAnalysisSheet
          key={analysisTarget.id}
          document={analysisTarget}
          onClose={() => setAnalysisTarget(null)}
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
      {noteOpen ? (
        <NoteSheet
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          rooms={rooms.data ?? []}
          online={online}
        />
      ) : null}
      {reserveOpen ? (
        <ReserveSheet
          open={reserveOpen}
          onClose={() => setReserveOpen(false)}
          rooms={rooms.data ?? []}
          online={online}
        />
      ) : null}
      {selectedPhoto ? (
        <PhotoDetailSheet
          key={selectedPhoto.id}
          open={Boolean(selectedPhoto)}
          onClose={() => setSelectedPhoto(null)}
          photo={selectedPhoto}
          isAdmin={Boolean(isAdmin)}
          onDelete={() => {
            void deletePhoto.mutateAsync(selectedPhoto.id)
            setSelectedPhoto(null)
          }}
        />
      ) : null}
      {selectedReserve ? (
        <ReserveDetailSheet
          key={selectedReserve.id}
          open={Boolean(selectedReserve)}
          onClose={() => setSelectedReserve(null)}
          reserve={selectedReserve}
          isAdmin={Boolean(isAdmin)}
        />
      ) : null}
    </div>
  )
}
