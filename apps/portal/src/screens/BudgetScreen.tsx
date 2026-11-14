import { useState } from "react"
import type { BudgetItem } from "@casarenous/shared"
import { formatCents } from "@casarenous/shared"
import { Badge, Button, Card, ListRow, Skeleton } from "@/aura/react"
import { useNotify } from "@/aura/notify/react"
import { useAuth } from "@/auth/AuthProvider"
import { DownloadIcon, PlusIcon, WalletIcon } from "@/components/icons"
import { BudgetItemSheet } from "@/features/budget/BudgetItemSheet"
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

  const summary = budget.data?.summary
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
          <span className="aura-stat__label">Reste</span>
          <span className={`aura-stat__value app-num ${summary && summary.remainingCents < 0 ? "app-danger-text" : ""}`}>
            {summary ? formatCents(summary.remainingCents) : "—"}
          </span>
          <span className="aura-stat__hint">à payer</span>
        </div>
      </div>

      <div className="app-inline-actions">
        {isAdmin ? (
          <Button
            block
            size="lg"
            icon={<PlusIcon size={18} />}
            onClick={() => setCreating(true)}
          >
            Ajouter un mouvement
          </Button>
        ) : (
          <Card variant="soft" style={{ width: "100%" }}>
            <p className="app-small">
              Le budget est en lecture seule pour les invités. Les montants sont tenus par
              l'admin.
            </p>
          </Card>
        )}
        {isAdmin ? (
          <Button
            variant="outline"
            size="lg"
            icon={<DownloadIcon size={18} />}
            onClick={() => void exportCsv()}
          >
            Export CSV
          </Button>
        ) : null}
      </div>

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
                    <span
                      className={`app-budget-row__amount ${item.amountCents < 0 ? "app-budget-row__amount--negative" : ""}`}
                    >
                      {formatCents(item.amountCents)}
                    </span>
                  </span>
                }
                subtitle={`${item.kind === "ccmi_call" ? "Appel CCMI" : "Avenant"}${item.reference ? ` · ${item.reference}` : ""}${item.dueDate ? ` · ${formatDate(item.dueDate)}` : ""}`}
                meta={<Badge tone={STATUS_LABEL[item.status].tone}>{STATUS_LABEL[item.status].label}</Badge>}
                onClick={isAdmin ? () => setSelected(item) : undefined}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card variant="soft">
          <p className="aura-h3">Budget vide</p>
          <p className="app-small" style={{ marginTop: 4 }}>
            {isAdmin
              ? "Ajoute le premier appel de fonds CCMI ou un avenant pour démarrer le suivi."
              : "L'admin n'a pas encore saisi les appels de fonds."}
          </p>
        </Card>
      )}

      <p className="app-tiny">
        Montants stockés en centimes entiers et calculés côté serveur. Aucun flottant.
      </p>

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
    </div>
  )
}
