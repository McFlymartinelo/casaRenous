import { useMemo, useState } from "react"
import type { Milestone } from "@casarenous/shared"
import { Badge, Button, Card, Chip, Skeleton } from "@/aura/react"
import { useAuth } from "@/auth/AuthProvider"
import { CalendarIcon, PlusIcon } from "@/components/icons"
import { CalendarSheet } from "@/features/milestones/CalendarSheet"
import { MilestoneSheet } from "@/features/milestones/MilestoneSheet"
import { RoleNotice } from "@/components/RoleNotice"
import { useMilestones } from "@/hooks/useApi"
import { countdown, formatDate, isWithinNextDays, quarterKey, todayIso } from "@/lib/dates"

type Filter = "all" | Milestone["category"]

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "administratif", label: "Admin" },
  { value: "technique", label: "Technique" },
  { value: "chantier", label: "Chantier" },
  { value: "livraison", label: "Livraison" },
]

const STATUS_LABEL: Record<Milestone["status"], string> = {
  planned: "Prévu",
  in_progress: "En cours",
  done: "Terminé",
  late: "En retard",
  cancelled: "Annulé",
}

function dotClass(milestone: Milestone): string {
  if (milestone.status === "done") return "app-dot app-dot--done"
  if (milestone.status === "late") return "app-dot app-dot--late"
  if (milestone.status === "cancelled") return "app-dot app-dot--cancelled"
  return "app-dot"
}

export function PlanningScreen() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const milestones = useMilestones()
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<Milestone | null>(null)
  const [creating, setCreating] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const items = useMemo(() => {
    const list = milestones.data ?? []
    return filter === "all" ? list : list.filter((item) => item.category === filter)
  }, [milestones.data, filter])

  const next = useMemo(
    () =>
      [...(milestones.data ?? [])]
        .filter((item) => item.status !== "done" && item.status !== "cancelled")
        .filter((item) => item.plannedEnd >= todayIso())
        .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))[0],
    [milestones.data],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Milestone[]>()
    for (const item of items) {
      const key = quarterKey(item.plannedStart)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()]
  }, [items])

  const totals = milestones.data ?? []
  const done = totals.filter((item) => item.status === "done").length
  const progress = totals.length ? Math.round((done / totals.length) * 100) : 0
  const upcoming = totals.filter(
    (item) =>
      item.status !== "done" &&
      item.status !== "cancelled" &&
      isWithinNextDays(item.plannedStart, 90),
  ).length
  const late = totals.filter((item) => item.status === "late").length

  if (milestones.isLoading && !milestones.data) {
    return (
      <div className="app-pad app-stack">
        <Skeleton height={180} />
        <div className="app-stat-grid">
          <Skeleton height={82} />
          <Skeleton height={82} />
          <Skeleton height={82} />
        </div>
        <Skeleton height={300} />
      </div>
    )
  }

  return (
    <div className="app-pad app-stack">
      <Card variant="hero">
        <p className="aura-hero__eyebrow">Prochaine étape</p>
        <p className="aura-hero__value" style={{ marginTop: 10 }}>
          {next ? formatDate(next.plannedStart, { year: undefined }) : "Terminé"}
        </p>
        <p className="aura-hero__meta" style={{ marginTop: 8 }}>
          {next
            ? `${next.title} · ${countdown(next.plannedStart).label}`
            : "Tous les jalons sont réalisés ou annulés."}
        </p>
      </Card>

      <div className="app-stat-grid">
        <div className="aura-stat">
          <span className="aura-stat__label">Avancement</span>
          <span className="aura-stat__value app-num">{progress} %</span>
          <span className="aura-stat__hint">{done}/{totals.length} jalons</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">À 90 jours</span>
          <span className="aura-stat__value app-num">{upcoming}</span>
          <span className="aura-stat__hint">jalons à venir</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Retards</span>
          <span className={`aura-stat__value app-num ${late > 0 ? "app-danger-text" : ""}`}>
            {late}
          </span>
          <span className="aura-stat__hint">{late > 0 ? "à traiter" : "aucun"}</span>
        </div>
      </div>

      <RoleNotice>
        Le rétroplanning est tenu par l'admin. Tu peux l'abonner à ton agenda, et
        signaler des réserves depuis l'onglet Chantier.
      </RoleNotice>

      <div className="app-action-row">
        <Button
          block
          size="lg"
          icon={isAdmin ? <PlusIcon size={18} /> : <CalendarIcon size={18} />}
          onClick={() => (isAdmin ? setCreating(true) : setCalendarOpen(true))}
        >
          {isAdmin ? "Ajouter un jalon" : "Abonner mon agenda"}
        </Button>
        {isAdmin ? (
          <Button
            block
            variant="outline"
            size="lg"
            icon={<CalendarIcon size={18} />}
            onClick={() => setCalendarOpen(true)}
          >
            Agenda
          </Button>
        ) : null}
      </div>

      <div className="app-scroll-row" role="group" aria-label="Filtrer les jalons">
        {FILTERS.map((item) => (
          <Chip
            key={item.value}
            active={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Chip>
        ))}
      </div>

      {groups.length === 0 ? (
        <Card variant="soft">
          <p className="aura-h3">
            {totals.length === 0
              ? "Le rétroplanning est vide"
              : "Aucun jalon dans ce filtre"}
          </p>
          <p className="app-small" style={{ marginTop: 4 }}>
            {totals.length === 0
              ? isAdmin
                ? "Ajoute les grandes étapes : dépôt du permis, démarrage du chantier, livraison."
                : "L'admin n'a pas encore saisi les jalons du chantier."
              : "Change de catégorie pour voir les autres jalons."}
          </p>
        </Card>
      ) : (
        groups.map(([quarter, group]) => (
          <section key={quarter}>
            <p className="app-quarter">{quarter}</p>
            <div className="aura-timeline">
              <div className="aura-timeline__rail" aria-hidden />
              {group.map((item) => (
                <div className="aura-timeline__item" key={item.id}>
                  <div className={dotClass(item)} aria-hidden>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {item.status === "done" ? "✓" : item.plannedStart.slice(8, 10)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="app-milestone"
                    onClick={() => setSelected(item)}
                  >
                    <p className="aura-timeline__date">
                      {formatDate(item.plannedStart, { year: undefined })}
                      {item.plannedEnd !== item.plannedStart
                        ? ` → ${formatDate(item.plannedEnd, { year: undefined })}`
                        : ""}
                    </p>
                    <p className="app-milestone__title">{item.title}</p>
                    <p className="app-milestone__meta">
                      {STATUS_LABEL[item.status]}
                      {item.isKey ? " · jalon clé" : ""}
                      {item.notifyDays.length
                        ? ` · rappels ${item.notifyDays.map((d) => (d === 0 ? "J" : `J-${d}`)).join(" ")}`
                        : ""}
                    </p>
                    {item.status === "late" ? (
                      <span style={{ display: "inline-block", marginTop: 4 }}>
                        <Badge tone="danger">En retard</Badge>
                      </span>
                    ) : null}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {selected ? (
        <MilestoneSheet
          key={selected.id}
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          milestone={selected}
          isNew={false}
          isAdmin={Boolean(isAdmin)}
        />
      ) : null}
      {creating ? (
        <MilestoneSheet
          key="new"
          open={creating}
          onClose={() => setCreating(false)}
          milestone={null}
          isNew
          isAdmin
        />
      ) : null}
      {calendarOpen ? (
        <CalendarSheet open={calendarOpen} onClose={() => setCalendarOpen(false)} />
      ) : null}
    </div>
  )
}
