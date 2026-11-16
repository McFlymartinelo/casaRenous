import { useMemo, useState } from "react"
import { CATALOG, CATEGORIES, getVariant } from "@/catalog/catalog"
import { addCatalogAt } from "@/lib/place"
import { formatDimensions } from "@/lib/format"
import { usePlanner } from "@/store/planner"
import type { FurnitureCategory, LevelId } from "@/types"
import { FurnitureThumb } from "./FurnitureThumb"
import { GripIcon, SearchIcon, CloseIcon, PlusIcon } from "./Icons"

const DEFAULT_POINTS: Record<LevelId, Record<FurnitureCategory, [number, number]>> = {
  rdc: {
    Salon: [2.1, 10.8],
    Cuisine: [2.0, 6.15],
    Chambre: [1.9, 1.8],
    "Salle d'eau": [1.2, 4.05],
    Déco: [5.3, 11.4],
  },
  etage: {
    Salon: [2.3, 11.5],
    Cuisine: [3.0, 9.0],
    Chambre: [2.0, 2.2],
    "Salle d'eau": [5.6, 6.0],
    Déco: [3.8, 9.0],
  },
}

export function CatalogPanel() {
  const level = usePlanner((state) => state.level)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<FurnitureCategory | "Tout">("Tout")

  const results = useMemo(() => {
    const normalized = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
    return CATALOG.filter((item) => {
      if (category !== "Tout" && item.category !== category) return false
      if (!normalized) return true
      const haystack = `${item.name} ${item.category} ${item.keywords ?? ""}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [category, query])

  const groups = useMemo(() => {
    const map = new Map<FurnitureCategory, typeof CATALOG>()
    for (const item of results) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return CATEGORIES.filter((cat) => map.has(cat)).map((cat) => [cat, map.get(cat) ?? []] as const)
  }, [results])

  function place(itemId: string, itemCategory: FurnitureCategory) {
    addCatalogAt(itemId, DEFAULT_POINTS[level][itemCategory])
  }

  return (
    <aside className="panel catalog-panel">
      <div className="panel__head catalog-panel__head">
        <div className="panel__title-row">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h2 className="panel__title">Meubles</h2>
          </div>
          <span className="count-pill">{CATALOG.length}</span>
        </div>
        <label className="search-field">
          <SearchIcon size={17} className="search-field__icon" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un meuble"
            aria-label="Rechercher un meuble"
          />
          {query ? (
            <button type="button" className="search-field__clear" onClick={() => setQuery("")} aria-label="Effacer la recherche">
              <CloseIcon size={14} />
            </button>
          ) : (
            <kbd className="search-field__kbd">/</kbd>
          )}
        </label>
        <div className="chip-row catalog-chips" role="group" aria-label="Filtrer par catégorie">
          <button
            type="button"
            className={`chip${category === "Tout" ? " chip--active" : ""}`}
            onClick={() => setCategory("Tout")}
            aria-pressed={category === "Tout"}
          >
            Tout
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`chip${category === cat ? " chip--active" : ""}`}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-panel__scroll">
        <div className="catalog-hint">
          <GripIcon size={16} />
          <span>Glissez un meuble dans la scène, ou cliquez pour le poser.</span>
        </div>

        {groups.length === 0 ? (
          <div className="catalog-empty">
            <p>Aucun meuble ne correspond.</p>
            <button type="button" className="button button--ghost button--sm" onClick={() => { setQuery(""); setCategory("Tout") }}>
              Réinitialiser les filtres
            </button>
          </div>
        ) : null}

        {groups.map(([group, items]) => (
          <section key={group} className="catalog-group">
            <div className="catalog-group__head">
              <h3>{group}</h3>
              <span>{items.length}</span>
            </div>
            <div className="catalog-list">
              {items.map((item) => {
                const variant = getVariant(item, item.defaultVariant ?? item.variants[0]?.id ?? "")
                return (
                  <div
                    key={item.id}
                    className="catalog-card"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-planner-item", item.id)
                      event.dataTransfer.setData("text/plain", item.id)
                      event.dataTransfer.effectAllowed = "copy"
                    }}
                    onClick={() => place(item.id, item.category)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        place(item.id, item.category)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Poser ${item.name}`}
                  >
                    <div className="catalog-card__thumb" style={{ background: `${variant.secondary}22` }}>
                      <FurnitureThumb item={item} variant={variant} />
                    </div>
                    <div className="catalog-card__body">
                      <div className="catalog-card__name">{item.name}</div>
                      <div className="catalog-card__dims">
                        {formatDimensions(item.w, item.d)}
                        {item.model ? <span className="catalog-card__badge">GLB</span> : null}
                      </div>
                      <div className="catalog-card__variants" aria-hidden="true">
                        {item.variants.slice(0, 4).map((entry) => (
                          <span key={entry.id} style={{ background: entry.primary }} />
                        ))}
                      </div>
                    </div>
                    <span className="catalog-card__add" aria-hidden="true">
                      <PlusIcon size={14} />
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}
