import { useState } from "react"
import type { BudgetItem } from "@casarenous/shared"
import { formatCents } from "@casarenous/shared"
import { Badge, Button, Card, ListRow, Skeleton } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useAuth } from "@/auth/AuthProvider"
import {
  CalendarCheckIcon,
  DownloadIcon,
  PlusIcon,
  TableIcon,
  WalletIcon,
} from "@/components/icons"
import { BudgetItemSheet } from "@/features/budget/BudgetItemSheet"
import { CemiScheduleSheet } from "@/features/budget/CcmiScheduleSheet"
import { PasteBudgetSheet } from "@/features/budget/PasteBudgetSheet"
import { RoleNotice } from "@/components/RoleNotice"
import { useBudget } from "@/hooks/useApi"
import { api } from "@/lib/api-client"
import { formatDate } from "@/lib/dates"
import { downloadBlob } from "@/lib/media"

const STATUS_LABEL: Record<BudgetItem["status"], { label: string; tone: "neutral" | "warn" | "success" | "danger" }> = {
  planned: { label: "Prévu", tone: "neutral" },
  due: { label: "À payer", tone: "warn" },
  paid: { label: "Payé", tone: "success" },
  cancelled: { label: "Annulé", tone: "danger" },
}

export function BudgetScreen() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const { notify } = useNotify()
  const budget = useBudget()
  const [selected, setSelected] = useState<BudgetItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  const summary = budget.data?.summary
  const items = budget.data?.items ?? []
  const existingCcmiCount = items.filter((item) => item.kind === "ccmi_call").length
  const pendingCount = summary?.pendingCount ?? 0
  const ratio =
    summary && summary.totalCents > 0
      ? Math.max(0, Math.min(100, Math.round((summary.paidCents / summary.totalCents) * 100)))
      : 0

  async function exportCsv() {
    try {
      const blob = await api.budget.exportCsv()
      downloadBlob(blob, "casarenous-budget.csv")
    } catch {
      notify({ title: "Export impossible", message: "Réessaie dans un instant.", tone: "danger" })
    }
  }

  if (budget.isLoading && !budget.data) {
    return (
      <div className="app-pad app-stack">
        <Skeleton height={180} />
        <div className="app-stat-grid">
          <Skeleton height={82} />
          <Skeleton height={82} />
          <Skeleton height={82} />
        </div>
        <Skeleton height={240} />
      </div>
    )
  }

  return (
    <div className="app-pad app-stack">
      <Card variant="hero">
        <p className="aura-hero__eyebrow">Budget engagé</p>
        <p className="aura-hero__value app-money" style={{ marginTop: 10 }}>
          {summary ? formatCents(summary.totalCents) : "0,00 €"}
        </p>
        <p className="aura-hero__meta" style={{ marginTop: 8 }}>
          {summary
            ? `${formatCents(summary.paidCents)} payés · ${formatCents(summary.remainingCents)} restants`
            : "Aucun mouvement enregistré."}
        </p>
        {pendingCount > 0 ? (
          <p className="app-small app-pending-note" style={{ marginTop: 6 }}>
            {pendingCount} ligne{pendingCount > 1 ? "s" : ""} sans montant —{" "}
            {pendingCount > 1 ? "elles ne sont" : "elle n'est"} pas comptée
            {pendingCount > 1 ? "s" : ""} dans le total.
          </p>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <div className="aura-row-flex" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="aura-hero__meta">Avancement des paiements</span>
            <span className="aura-hero__meta app-num">{ratio} %</span>
          </div>
          <div className="app-progress" aria-hidden>
            <div className="app-progress__fill" style={{ width: `${ratio}%` }} />
          </div>
        </div>
      </Card>

      <div className="app-stat-grid">
        <div className="aura-stat">
          <span className="aura-stat__label">CCMI</span>
          <span className="aura-stat__value app-num">
            {summary ? formatCents(summary.ccmiCents) : "—"}
          </span>
          <span className="aura-stat__hint">appels de fonds</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Avenants</span>
          <span className="aura-stat__value app-num">
            {summary ? formatCents(summary.changeOrdersCents) : "—"}
          </span>
          <span className="aura-stat__hint">+/- values</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Achats</span>
          <span className="aura-stat__value app-num">
            {summary ? formatCents(summary.invoiceCents) : "—"}
          </span>
          <span className="aura-stat__hint">factures</span>
        </div>
        <div className="aura-stat">
          <span className="aura-stat__label">Reste</span>
          <span className={`aura-stat__value app-num ${summary && summary.remainingCents < 0 ? "app-danger-text" : ""}`}>
            {summary ? formatCents(summary.remainingCents) : "—"}
          </span>
          <span className="aura-stat__hint">à payer</span>
        </div>
      </div>

      <RoleNotice>
        Le budget est tenu par l'admin. Tu peux ajouter des photos, des notes et
        signaler des réserves depuis l'onglet Chantier.
      </RoleNotice>

      {isAdmin ? (
        <div className="app-entry-actions">
          <Button
            block
            size="lg"
            icon={<PlusIcon size={18} />}
            onClick={() => setCreating(true)}
          >
            Ajouter un mouvement
          </Button>
          <div className="app-entry-actions__pair">
            <Button
              variant="outline"
              size="lg"
              icon={<CalendarCheckIcon size={18} />}
              onClick={() => setScheduleOpen(true)}
            >
              Échéancier CCMI
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={<TableIcon size={18} />}
              onClick={() => setPasteOpen(true)}
            >
              Coller un tableau
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<DownloadIcon size={18} />}
            onClick={() => void exportCsv()}
          >
            Export CSV
          </Button>
        </div>
      ) : null}

      {budget.data?.items.length ? (
        <Card flush>
          <div className="app-list">
            {budget.data.items.map((item) => (
              <ListRow
                key={item.id}
                icon={<WalletIcon size={18} />}
                title={
                  <span className="aura-row-flex" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span>{item.label}</span>
                    {item.amountCents === null ? (
                      <span className="app-budget-row__amount app-budget-row__amount--pending">
                        À compléter
                      </span>
                    ) : (
                      <span
                        className={`app-budget-row__amount ${item.amountCents < 0 ? "app-budget-row__amount--negative" : ""}`}
                      >
                        {formatCents(item.amountCents)}
                      </span>
                    )}
                  </span>
                }
                subtitle={`${item.kind === "ccmi_call" ? "Appel CCMI" : item.kind === "invoice" ? "Facture" : "Avenant"}${item.reference ? ` · ${item.reference}` : ""}${item.dueDate ? ` · ${formatDate(item.dueDate)}` : ""}`}
                meta={<Badge tone={STATUS_LABEL[item.status].tone}>{STATUS_LABEL[item.status].label}</Badge>}
                onClick={isAdmin ? () => setSelected(item) : undefined}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card variant="soft">
          <p className="aura-h3">Rien à suivre pour l'instant</p>
          <p className="app-small" style={{ marginTop: 4 }}>
            {isAdmin
              ? "Le plus rapide : saisis le montant total du CCMI, l'app crée les appels de fonds. Tu peux aussi coller l'échéancier de ton constructeur."
              : "L'admin n'a pas encore saisi les appels de fonds."}
          </p>
          {isAdmin ? (
            <div className="app-chip-row" style={{ marginTop: 10 }}>
              <Button size="sm" variant="soft" onClick={() => setScheduleOpen(true)}>
                Créer l'échéancier CCMI
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)}>
                Coller un tableau
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {isAdmin ? (
        <p className="app-tiny">
          Laisse un montant vide pour enregistrer une ligne « à compléter » : elle reste
          visible sans fausser les totaux.
        </p>
      ) : null}

      {creating ? (
        <BudgetItemSheet
          key="new"
          open={creating}
          onClose={() => setCreating(false)}
          item={null}
          isNew
        />
      ) : null}
      {selected ? (
        <BudgetItemSheet
          key={selected.id}
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          item={selected}
          isNew={false}
        />
      ) : null}
      <CemiScheduleSheet
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        existingCcmiCount={existingCcmiCount}
      />
      <PasteBudgetSheet open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </div>
  )
}
