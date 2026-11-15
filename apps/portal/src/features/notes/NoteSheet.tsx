import { useEffect, useState } from "react"
import type { Room } from "@casarenous/shared"
import { Button, Select, Sheet, Textarea } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useCreateNote } from "@/hooks/useApi"
import { ApiClientError } from "@/lib/api-client"
import { enqueueNote } from "@/lib/outbox"
import { randomUUID } from "@/lib/uuid"

export function NoteSheet({
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
  const create = useCreateNote()
  const [body, setBody] = useState("")
  const [roomId, setRoomId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBody("")
      setRoomId("")
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function submit() {
    if (body.trim().length === 0) {
      setError("Écris une note avant d'enregistrer.")
      return
    }
    setBusy(true)
    setError(null)
    const payload = {
      clientId: randomUUID(),
      body: body.trim(),
      takenAt: new Date().toISOString(),
      roomId: roomId || null,
    }
    try {
      if (online) {
        await create.mutateAsync(payload)
        notify({ title: "Note enregistrée", message: "Ajoutée au journal de chantier.", tone: "success" })
      } else {
        await enqueueNote(payload)
        notify({
          title: "Note conservée hors ligne",
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
      await enqueueNote(payload)
      notify({
        title: "Note mise en attente",
        message: "Tu es hors ligne : elle partira dès le retour du réseau.",
        tone: "warn",
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nouvelle note de chantier"
      description="Une observation, une mesure, une question à poser."
      footer={
        <Button block loading={busy} onClick={() => void submit()}>
          {online ? "Enregistrer" : "Conserver hors ligne"}
        </Button>
      }
    >
      <div className="aura-stack">
        <Textarea
          label="Note"
          rows={6}
          autoFocus
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Le mur nord de la chambre 2 présente un écart de 8 mm à vérifier."
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
            Hors ligne : la note reste sur cet appareil jusqu'à la prochaine connexion.
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
