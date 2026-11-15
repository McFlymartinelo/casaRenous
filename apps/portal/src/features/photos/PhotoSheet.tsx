import { useEffect, useRef, useState } from "react"
import { randomUUID } from "@/lib/uuid"
import type { Room } from "@casarenous/shared"
import { Button, Input, Select, Sheet } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useUploadPhoto } from "@/hooks/useApi"
import { ApiClientError } from "@/lib/api-client"
import { compressImage, getPosition, type Position } from "@/lib/media"
import { enqueuePhoto } from "@/lib/outbox"
import { MapPinIcon } from "@/components/icons"

export function PhotoSheet({
  open,
  onClose,
  rooms,
  online,
}: {
  open: boolean
  onClose: () => void
  rooms: Room[]
  online: boolean
}) {
  const { notify } = useNotify()
  const upload = useUploadPhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState("")
  const [roomId, setRoomId] = useState("")
  const [position, setPosition] = useState<Position | null>(null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  useEffect(() => {
    if (!open) return
    setLocating(true)
    void getPosition().then((value) => {
      setPosition(value)
      setLocating(false)
    })
  }, [open])

  useEffect(() => {
    if (!open) {
      setBlob(null)
      setCaption("")
      setRoomId("")
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const compressed = await compressImage(file)
      setBlob(compressed)
    } catch {
      setError("Photo illisible. Utilise l'appareil photo ou un JPEG.")
    }
  }

  async function submit() {
    if (!blob) {
      setError("Choisis d'abord une photo.")
      return
    }
    setBusy(true)
    setError(null)
    const clientId = randomUUID()
    const fields = {
      clientId,
      caption: caption.trim() || null,
      takenAt: new Date().toISOString(),
      ...(position ? { lat: position.lat, lng: position.lng, accuracyM: position.accuracyM } : {}),
      roomId: roomId || null,
    }
    try {
      if (online) {
        await upload.mutateAsync({ fields, file: blob })
        notify({ title: "Photo ajoutée", message: "Le journal de chantier est à jour.", tone: "success" })
      } else {
        await enqueuePhoto(blob, fields)
        notify({
          title: "Photo conservée hors ligne",
          message: "Elle sera synchronisée au retour du réseau.",
          tone: "info",
        })
      }
      onClose()
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500) {
        setError(cause.message)
        return
      }
      try {
        await enqueuePhoto(blob, fields)
        notify({
          title: "Photo mise en attente",
          message: "Tu es hors ligne : elle partira dès le retour du réseau.",
          tone: "warn",
        })
        onClose()
      } catch {
        setError(cause instanceof Error ? cause.message : "Envoi impossible.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajouter une photo"
      description="Le lieu et la date sont enregistrés avec la photo."
      footer={
        <Button block loading={busy} disabled={!blob} onClick={() => void submit()}>
          {online ? "Ajouter au journal" : "Conserver hors ligne"}
        </Button>
      }
    >
      <div className="aura-stack">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="app-visually-hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          type="button"
          className="app-photo-thumb"
          style={{ width: "100%", height: 210 }}
          onClick={() => inputRef.current?.click()}
          aria-label="Choisir une photo"
        >
          {preview ? (
            <img src={preview} alt="Aperçu de la photo" />
          ) : (
            <span className="app-media-placeholder">
              <span>
                <strong>Prendre une photo</strong>
                <br />
                <span className="app-tiny">Appareil photo ou pellicule</span>
              </span>
            </span>
          )}
        </button>

        <div className="app-sync-bar">
          <MapPinIcon size={17} />
          <span className="app-sync-bar__text">
            {locating
              ? "Recherche de la position…"
              : position
                ? `Position captée (± ${position.accuracyM} m)`
                : "Position indisponible — la photo reste utilisable."}
          </span>
        </div>

        <Input
          label="Légende"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Coulage des fondations côté jardin"
        />
        <Select
          label="Pièce (optionnel)"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
        >
          <option value="">Non précisée</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </Select>

        {!online ? (
          <p className="aura-hint">
            Hors ligne : la photo et sa légende restent sur cet appareil jusqu'à la
            prochaine connexion.
          </p>
        ) : null}
        {error ? (
          <p className="aura-error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
