import { useState } from "react"
import type { DocumentCategoryItem } from "@casarenous/shared"
import { Badge, Button, Card, Input, ListRow, Sheet, Skeleton } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { EditIcon, PlusIcon, TrashIcon } from "@/components/icons"
import {
  useCreateDocumentCategory,
  useDeleteDocumentCategory,
  useDocumentCategories,
  useUpdateDocumentCategory,
} from "@/hooks/useApi"

export function DocumentCategoriesSheet({ onClose }: { onClose: () => void }) {
  const { notify } = useNotify()
  const categories = useDocumentCategories()
  const create = useCreateDocumentCategory()
  const update = useUpdateDocumentCategory()
  const remove = useDeleteDocumentCategory()

  const [name, setName] = useState("")
  const [editing, setEditing] = useState<DocumentCategoryItem | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (name.trim().length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.")
      return
    }
    setError(null)
    try {
      await create.mutateAsync({ name: name.trim() })
      setName("")
      notify({ title: "Catégorie créée", message: `« ${name.trim()} » est disponible.`, tone: "success" })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible.")
    }
  }

  async function rename() {
    if (!editing || draft.trim().length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.")
      return
    }
    setError(null)
    try {
      await update.mutateAsync({ id: editing.id, input: { name: draft.trim() } })
      setEditing(null)
      setDraft("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Renommage impossible.")
    }
  }

  async function removeCategory(item: DocumentCategoryItem) {
    const suffix = item.documentCount
      ? ` ${item.documentCount} document(s) seront replacés dans « Autre ».`
      : ""
    if (!window.confirm(`Supprimer la catégorie « ${item.name} » ?${suffix}`)) return
    setError(null)
    try {
      await remove.mutateAsync(item.id)
      if (editing?.id === item.id) setEditing(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suppression impossible.")
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Catégories de documents"
      description="Ajoute tes propres catégories. Elles s'ajoutent aux huit catégories de base."
      footer={
        <Button block variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="app-stack">
        <Input
          label="Nouvelle catégorie"
          value={name}
          placeholder="Électricité, Mobilier, Photos notaire…"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add()
          }}
        />
        <Button
          block
          icon={<PlusIcon size={16} />}
          loading={create.isPending}
          onClick={() => void add()}
        >
          Ajouter la catégorie
        </Button>

        {categories.isLoading && !categories.data ? <Skeleton height={140} /> : null}

        {categories.data?.items.length ? (
          <Card flush>
            <div className="app-list">
              {categories.data.items.map((item) => (
                <ListRow
                  key={item.id}
                  title={
                    editing?.id === item.id ? (
                      <Input
                        label="Nom de la catégorie"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void rename()
                        }}
                      />
                    ) : (
                      item.name
                    )
                  }
                  meta={<Badge tone="neutral">{item.documentCount} doc</Badge>}
                  trailing={
                    editing?.id === item.id ? (
                      <span className="aura-row-flex">
                        <Button size="sm" loading={update.isPending} onClick={() => void rename()}>
                          OK
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(null)
                            setDraft("")
                          }}
                        >
                          Annuler
                        </Button>
                      </span>
                    ) : (
                      <span className="aura-row-flex">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Renommer ${item.name}`}
                          onClick={() => {
                            setEditing(item)
                            setDraft(item.name)
                          }}
                        >
                          <EditIcon size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Supprimer ${item.name}`}
                          loading={remove.isPending}
                          onClick={() => void removeCategory(item)}
                        >
                          <TrashIcon size={16} />
                        </Button>
                      </span>
                    )
                  }
                />
              ))}
            </div>
          </Card>
        ) : categories.data && !categories.data.items.length ? (
          <Card variant="soft">
            <p className="app-small">
              Aucune catégorie personnalisée pour l'instant. Crée « Électricité »,
              « Mobilier » ou ce qui te parle.
            </p>
          </Card>
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
