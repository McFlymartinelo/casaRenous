import { useEffect, useRef, useState } from "react"
import type {
  Document,
  DocumentCategory,
  DocumentCategoryItem,
  Room,
} from "@casarenous/shared"
import { Button, Input, Select, Sheet, Textarea } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useUploadDocument } from "@/hooks/useApi"
import { BUILTIN_CATEGORIES } from "@/features/documents/categories"

export function UploadDocumentSheet({
  open,
  onClose,
  rooms,
  categories,
  onUploaded,
}: {
  open: boolean
  onClose: () => void
  rooms: Room[]
  categories: DocumentCategoryItem[]
  onUploaded?: (document: Document) => void
}) {
  const { notify } = useNotify()
  const upload = useUploadDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("built:plan")
  const [roomId, setRoomId] = useState("")
  const [notes, setNotes] = useState("")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setTitle("")
      setCategory("built:plan")
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
      const customCategoryId = category.startsWith("custom:")
        ? category.slice("custom:".length)
        : null
      const builtin = category.startsWith("built:")
        ? (category.slice("built:".length) as DocumentCategory)
        : "autre"
      const created = await upload.mutateAsync({
        fields: {
          title: title.trim(),
          category: builtin,
          customCategoryId,
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
            onChange={(event) => setCategory(event.target.value)}
          >
            <optgroup label="Catégories">
              {BUILTIN_CATEGORIES.map((item) => (
                <option key={item.value} value={`built:${item.value}`}>
                  {item.label}
                </option>
              ))}
            </optgroup>
            {categories.length ? (
              <optgroup label="Mes catégories">
                {categories.map((item) => (
                  <option key={item.id} value={`custom:${item.id}`}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
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
