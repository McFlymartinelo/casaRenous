import type { InvoiceField } from "@casarenous/shared"
import { Badge, Button, Card, ListRow, Sheet, Skeleton } from "@/aura/react"
import { useAnalysisQuality } from "@/hooks/useApi"
import { formatDateTime } from "@/lib/dates"

const FIELD_LABEL: Record<InvoiceField, string> = {
  supplierName: "Fournisseur",
  supplierTaxId: "SIRET / TVA",
  invoiceNumber: "Numéro de facture",
  issuedOn: "Date de facture",
  dueDate: "Échéance",
  totalCents: "Total TTC",
  vatCents: "TVA",
}

const STATUS: Record<
  "ready" | "unsupported" | "failed" | "pending",
  { label: string; tone: "success" | "warn" | "danger" | "neutral" }
> = {
  ready: { label: "Lue", tone: "success" },
  unsupported: { label: "Non lue", tone: "warn" },
  failed: { label: "Échec", tone: "danger" },
  pending: { label: "En attente", tone: "neutral" },
}

export function AnalysisQualitySheet({ onClose }: { onClose: () => void }) {
  const quality = useAnalysisQuality()
  const data = quality.data
  const total = data?.total ?? 0
  const percent = (value: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0
  const fields = (data?.fields ?? [])
    .filter((field) => field.missing + field.low > 0)
    .sort((a, b) => b.missing + b.low - (a.missing + a.low))

  return (
    <Sheet
      open
      onClose={onClose}
      title="Qualité de lecture"
      description="Ce que le moteur déterministe lit bien, et ce qu'il rate encore."
      footer={
        <Button block variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="app-stack">
        {quality.isLoading && !data ? <Skeleton height={180} /> : null}

        {data && data.total === 0 ? (
          <Card variant="soft">
            <p className="app-small">
              Aucune facture analysée pour l'instant. Le journal se remplit à chaque
              lecture depuis la fiche d'un document.
            </p>
          </Card>
        ) : null}

        {data && data.total > 0 ? (
          <>
            <div className="app-stat-grid">
              <div className="aura-stat">
                <span className="aura-stat__label">Analyses</span>
                <span className="aura-stat__value app-num">{data.ready}</span>
                <span className="aura-stat__hint">
                  lues sur {data.total}
                </span>
              </div>
              <div className="aura-stat">
                <span className="aura-stat__label">Sans montant</span>
                <span className="aura-stat__value app-num">{percent(data.missingAmount)} %</span>
                <span className="aura-stat__hint">{data.missingAmount} facture(s)</span>
              </div>
              <div className="aura-stat">
                <span className="aura-stat__label">Sans échéance</span>
                <span className="aura-stat__value app-num">{percent(data.missingDueDate)} %</span>
                <span className="aura-stat__hint">{data.missingDueDate} facture(s)</span>
              </div>
              <div className="aura-stat">
                <span className="aura-stat__label">Corrigées</span>
                <span className="aura-stat__value app-num">{data.corrected}</span>
                <span className="aura-stat__hint">à la main</span>
              </div>
            </div>

            <div>
              <p className="app-kicker" style={{ marginBottom: 6 }}>
                Champs fragiles
              </p>
              {fields.length ? (
                <Card flush>
                  <div className="app-list">
                    {fields.map((field) => (
                      <ListRow
                        key={field.field}
                        title={FIELD_LABEL[field.field]}
                        subtitle={`${field.missing} manquant(s) · ${field.low} incertain(s)`}
                        meta={
                          <Badge tone={field.missing > 0 ? "warn" : "neutral"}>
                            {field.missing + field.low}
                          </Badge>
                        }
                      />
                    ))}
                  </div>
                </Card>
              ) : (
                <Card variant="soft">
                  <p className="app-small">
                    Aucun champ fragile : toutes les factures lues ont été reconnues
                    avec une confiance correcte.
                  </p>
                </Card>
              )}
            </div>

            <div>
              <p className="app-kicker" style={{ marginBottom: 6 }}>
                Dernières analyses
              </p>
              <Card flush>
                <div className="app-list">
                  {data.recent.map((item) => {
                    const status = STATUS[item.status]
                    return (
                      <ListRow
                        key={item.documentId}
                        title={item.title}
                        subtitle={`${formatDateTime(item.analyzedAt)}${
                          item.missingFields.length
                            ? ` · ${item.missingFields.length} champ(s) manquant(s)`
                            : ""
                        }`}
                        meta={
                          item.corrected ? (
                            <Badge tone="accent">Corrigée</Badge>
                          ) : (
                            <Badge tone={status.tone}>{status.label}</Badge>
                          )
                        }
                      />
                    )
                  })}
                </div>
              </Card>
            </div>

            <p className="app-tiny">
              Mesure 100 % locale. Si « sans montant » dépasse ~20 % sur tes prochaines
              factures, une couche OCR puis un LLM local deviennent rentables.
            </p>
          </>
        ) : null}

        {quality.isError ? (
          <p className="aura-error-text" role="alert">
            Impossible de charger le journal qualité.
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
