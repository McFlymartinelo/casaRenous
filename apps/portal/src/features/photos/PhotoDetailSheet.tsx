import { useState } from "react"
import type { Photo } from "@casarenous/shared"
import { Badge, Button, Sheet } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { AuthenticatedImage } from "@/components/AuthenticatedImage"
import { DownloadIcon, MapPinIcon, TrashIcon } from "@/components/icons"
import { api } from "@/lib/api-client"
import { formatDateTime } from "@/lib/dates"
import { downloadBlob } from "@/lib/media"

function photoFileName(photo: Photo): string {
  const date = photo.takenAt.slice(0, 10)
  const slug = (photo.caption ?? "photo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return `journal-${date}-${slug || "photo"}.jpg`
}

export function PhotoDetailSheet({
  open,
  onClose,
  photo,
  isAdmin,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  photo: Photo | null
  isAdmin: boolean
  onDelete: () => void
}) {
  const { notify } = useNotify()
  const [downloading, setDownloading] = useState(false)

  if (!photo) return null

  async function download() {
    if (!photo) return
    setDownloading(true)
    try {
      const blob = await api.photos.file(photo.id)
      downloadBlob(blob, photoFileName(photo))
    } catch {
      notify({
        title: "Téléchargement impossible",
        message: "Réessaie dans un instant.",
        tone: "danger",
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={photo.caption ?? "Photo de chantier"}
      description={formatDateTime(photo.takenAt)}
    >
      <div className="aura-stack">
        <div className="app-photo-thumb" style={{ width: "100%", height: 280 }}>
          <AuthenticatedImage
            cacheKey={`full-${photo.id}`}
            loader={() => api.photos.file(photo.id)}
            alt={photo.caption ?? "Photo de chantier"}
          />
        </div>
        <div className="aura-row-flex" style={{ flexWrap: "wrap" }}>
          <Badge tone="neutral">
            {(photo.sizeBytes / 1024 / 1024).toLocaleString("fr-FR", {
              maximumFractionDigits: 1,
            })}{" "}
            Mo
          </Badge>
          {photo.lat != null && photo.lng != null ? (
            <a
              className="aura-badge aura-badge--neutral"
              href={`https://www.google.com/maps?q=${photo.lat},${photo.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPinIcon size={12} /> Voir sur la carte
            </a>
          ) : (
            <Badge tone="neutral">Sans position</Badge>
          )}
        </div>
        <Button
          variant="outline"
          block
          icon={<DownloadIcon size={16} />}
          loading={downloading}
          onClick={() => void download()}
        >
          Télécharger la photo
        </Button>
        {isAdmin ? (
          <Button
            variant="ghost"
            block
            icon={<TrashIcon size={16} />}
            onClick={() => {
              if (window.confirm("Supprimer cette photo du journal ?")) onDelete()
            }}
          >
            Supprimer la photo
          </Button>
        ) : null}
      </div>
    </Sheet>
  )
}
