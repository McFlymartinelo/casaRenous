import { useEffect, useState } from "react"
import type { Room } from "@casarenous/shared"
import { Button, Input, Select, Sheet, Textarea } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useCreateReserve } from "@/hooks/useApi"
import { ApiClientError } from "@/lib/api-client"
import { enqueueReserve } from "@/lib/outbox"
import { randomUUID } from "@/lib/uuid"

export function ReserveSheet({
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
  const create = useCreateReserve()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [roomId, setRoomId] = useState("")
  const [severity, setSeverity] = useState<"mineure" | "majeure" | "bloquante">("mineure")
  const [dueDate, setDueDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setTitle("")
      setDescription("")
      setLocation("")
      setRoomId("")
      setSeverity("mineure")
      setDueDate("")
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function submit() {
    if (title.trim().length < 2) {
      setError("Donne un titre à la réserve.")
      return
    }
    setBusy(true)
    setError(null)
    const payload = {
      clientId: randomUUID(),
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      roomId: roomId || null,
      severity,
      status: "open" as const,
      dueDate: dueDate || null,
    }
    try {
      if (online) {
        await create.mutateAsync(payload)
        notify({ title: "Réserve enregistrée", message: "Elle apparaît dans la liste de livraison.", tone: "success" })
      } else {
        await enqueueReserve(payload)
        notify({
          title: "Réserve conservée hors ligne",
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
      await enqueueReserve(payload)
      notify({
        title: "Réserve mise en attente",
        message: "Le serveur est injoignable : elle sera renvoyée automatiquement.",
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
      title="Signaler une réserve"
      description="Un défaut constaté, à suivre jusqu'à sa levée."
      footer={
        <Button block loading={busy} onClick={() => void submit()}>
          {online ? "Créer la réserve" : "Conserver hors ligne"}
        </Button>
      }
    >
      <div className="aura-stack">
        <Input
          label="Titre"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Rayure sur le dormant de la baie"
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="app-two-col">
          <Select
            label="Pièce"
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
          <Select
            label="Gravité"
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value as "mineure" | "majeure" | "bloquante")
            }
          >
            <option value="mineure">Mineure</option>
            <option value="majeure">Majeure</option>
            <option value="bloquante">Bloquante</option>
          </Select>
        </div>
        <Input
          label="Emplacement précis"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Séjour, angle nord-est"
        />
        <Input
          label="Échéance de levée (optionnel)"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        {!online ? (
          <p className="aura-hint">
            Hors ligne : la réserve reste sur cet appareil jusqu'à la prochaine connexion.
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
