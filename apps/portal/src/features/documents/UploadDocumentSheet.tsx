import { useEffect, useRef, useState } from "react"
import type { Document, DocumentCategory, Room } from "@casarenous/shared"
import { Button, Input, Select, Sheet, Textarea } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useUploadDocument } from "@/hooks/useApi"

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "permis", label: "Permis" },
  { value: "ccmi", label: "CCMI" },
  { value: "plan", label: "Plan" },
  { value: "facture", label: "Facture" },
  { value: "avenant", label: "Avenant" },
  { value: "assurance", label: "Assurance" },
  { value: "notice", label: "Notice" },
  { value: "autre", label: "Autre" },
]

export function UploadDocumentSheet({
  open,
  onClose,
  rooms,
  onUploaded,
}: {
  open: boolean
  onClose: () => void
  rooms: Room[]
  onUploaded?: (document: Document) => void
}) {
  const { notify } = useNotify()
  const upload = useUploadDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<DocumentCategory>("plan")
  const [roomId, setRoomId] = useState("")
  const [notes, setNotes] = useState("")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setTitle("")
      setCategory("plan")
      setRoomId("")
      setNotes("")
      setProgress(0)
      setError(null)
    }
  }, [open])

  function handleFile(value: File | undefined) {
    if (!value) return
    setFile(value)
    if (!title) {
      setTitle(value.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").slice(0, 80))
    }
    setError(null)
  }

  async function submit() {
    if (!file) {
      setError("Choisis un fichier.")
      return
    }
    if (title.trim().length === 0) {
      setError("Donne un titre au document.")
      return
    }
    setError(null)
    try {
      const created = await upload.mutateAsync({
        fields: {
          title: title.trim(),
          category,
          roomId: roomId || null,
          notes: notes.trim() || null,
        },
        file,
        onProgress: setProgress,
      })
      notify({ title: "Document ajouté", message: "Le coffre-fort est à jour.", tone: "success" })
      onClose()
      onUploaded?.(created)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Envoi impossible.")
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajouter un document"
      description="PDF, DOCX, XLSX, JPEG, PNG ou WebP — 20 Mo maximum."
      footer={
        <Button block loading={upload.isPending} onClick={() => void submit()}>
          {progress > 0 && progress < 1 ? `Envoi ${Math.round(progress * 100)} %` : "Ajouter au coffre"}
        </Button>
      }
    >
      <div className="aura-stack">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,image/jpeg,image/png,image/webp"
          className="app-visually-hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <Button variant="outline" block onClick={() => inputRef.current?.click()}>
          {file ? file.name : "Choisir un fichier"}
        </Button>
        <Input
          label="Titre"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Plan de masse validé"
        />
        <div className="app-two-col">
          <Select
            label="Catégorie"
            value={category}
            onChange={(event) => setCategory(event.target.value as DocumentCategory)}
          >
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
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
        </div>
        <Textarea
          label="Notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        {error ? (
          <p className="aura-error-text" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
