import type { Photo } from "@casarenous/shared"
import { Badge, Button, Sheet } from "@/aura/react"
import { AuthenticatedImage } from "@/components/AuthenticatedImage"
import { MapPinIcon, TrashIcon } from "@/components/icons"
import { api } from "@/lib/api-client"
import { formatDateTime } from "@/lib/dates"

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
  if (!photo) return null
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
