import { useMemo, useState } from "react"
import { CATALOG, getCatalogItem } from "@/catalog/catalog"
import { roomAt } from "@/config/house"
import { formatPrice } from "@/lib/format"
import { usePlanner } from "@/store/planner"

interface RoomTotal {
  name: string
  count: number
  price: number
}

interface BudgetLine {
  clientId: string
  kind: "invoice"
  label: string
  reference: string
  amountCents: number
  status: "planned"
  notes: string
}

/** UUID déterministe : un même meuble renvoie toujours la même ligne budget. */
function hash32(seed: string, salt: number): number {
  let hash = (2166136261 ^ salt) >>> 0
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stableUuid(seed: string): string {
  const a = hash32(seed, 1).toString(16).padStart(8, "0")
  const b = (hash32(seed, 2) & 0xffff).toString(16).padStart(4, "0")
  const c = ((hash32(seed, 3) & 0x0fff) | 0x4000).toString(16).padStart(4, "0")
  const d = ((hash32(seed, 4) & 0x3fff) | 0x8000).toString(16).padStart(4, "0")
  const e = hash32(seed, 5).toString(16).padStart(8, "0")
  const f = (hash32(seed, 6) & 0xffff).toString(16).padStart(4, "0")
  return `${a}-${b}-${c}-${d}-${e}${f}`
}

const clip = (value: string, max: number) => value.slice(0, max)

/** Récapitulatif des meubles posés : total global, par pièce et envoi au budget. */
export function ProjectSummary() {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const furniture = usePlanner((state) => state.furniture)

  const summary = useMemo(() => {
    const rooms = new Map<string, RoomTotal>()
    const lines: BudgetLine[] = []
    let price = 0
    for (const item of furniture) {
      const catalog = getCatalogItem(item.catalogId)
      const room = roomAt(item.level, [item.x, item.z])
      const name = room?.name ?? "Extérieur"
      const total = rooms.get(name) ?? { name, count: 0, price: 0 }
      total.count += 1
      total.price += catalog.price ?? 0
      rooms.set(name, total)
      price += catalog.price ?? 0

      if (catalog.price !== undefined && catalog.price > 0) {
        lines.push({
          clientId: stableUuid(item.id),
          kind: "invoice",
          label: clip(`Aménagement · ${name} · ${catalog.name}`, 180),
          reference: clip(`${catalog.brand ?? "Meuble"} ${catalog.reference ?? catalog.id}`, 120),
          amountCents: Math.round(catalog.price * 100),
          status: "planned",
          notes: clip(`Ajouté depuis le planificateur. ${catalog.productUrl ?? ""}`, 2000),
        })
      }
    }
    return {
      count: furniture.length,
      price,
      lines,
      rooms: [...rooms.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }
  }, [furniture])

  async function addToBudget() {
    if (!summary.lines.length) return
    let referrer: string | null = null
    try {
      if (document.referrer) referrer = new URL(document.referrer).origin
    } catch {
      /* referrer invalide : le portail vérifiera l'origine du message */
    }
    const embedded =
      window.parent !== window && new URLSearchParams(window.location.search).get("embed") === "1"

    if (embedded) {
      window.parent.postMessage(
        { source: "casarenous-planner", type: "budget:add", items: summary.lines },
        referrer ?? "*",
      )
      setFeedback(`${summary.lines.length} ligne${summary.lines.length > 1 ? "s" : ""} envoyée${summary.lines.length > 1 ? "s" : ""} au budget`)
      return
    }

    const tsv = summary.lines
      .map((line) => `${line.label}\t${formatPrice(line.amountCents / 100)}`)
      .join("\n")
    try {
      await navigator.clipboard.writeText(tsv)
      setFeedback("Copié — collez dans Budget › Coller un tableau")
    } catch {
      setFeedback("Copie indisponible : ouvrez le planner depuis le portail")
    }
  }

  return (
    <div className={`project-summary${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="project-summary__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Afficher le récapitulatif du projet"
      >
        <span className="project-summary__label">Projet</span>
        <span className="project-summary__count">{summary.count} meubles</span>
        <span className="project-summary__price">{formatPrice(summary.price)}</span>
        <span className="project-summary__chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open ? (
        <div className="project-summary__body">
          <div className="project-summary__line">
            <span>Catalogue</span>
            <span>{CATALOG.length} articles</span>
          </div>
          <div className="project-summary__line project-summary__line--strong">
            <span>Meubles posés</span>
            <span>
              {summary.count} · {formatPrice(summary.price)}
            </span>
          </div>
          <div className="project-summary__divider" />
          {summary.rooms.length === 0 ? (
            <p className="project-summary__empty">Aucun meuble posé.</p>
          ) : (
            summary.rooms.map((room) => (
              <div className="project-summary__line" key={room.name}>
                <span>{room.name}</span>
                <span>
                  {room.count} · {formatPrice(room.price)}
                </span>
              </div>
            ))
          )}
          <button
            type="button"
            className="project-summary__budget"
            onClick={addToBudget}
            disabled={!summary.lines.length}
            title="Ajoute les meubles IKEA posés comme achats dans le budget"
          >
            Ajouter {summary.lines.length} ligne{summary.lines.length > 1 ? "s" : ""} au budget ·{" "}
            {formatPrice(
              summary.lines.reduce((total, line) => total + line.amountCents, 0) / 100,
            )}
          </button>
          {feedback ? <p className="project-summary__feedback">{feedback}</p> : null}
          <p className="project-summary__note">Prix indicatifs relevés à l'import.</p>
        </div>
      ) : null}
    </div>
  )
}
