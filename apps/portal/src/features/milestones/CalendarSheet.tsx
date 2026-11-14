import { useState } from "react"
import { Badge, Button, Input, Sheet } from "@/aura/react"
import {
  useCalendarToken,
  useRevokeCalendarToken,
  useRotateCalendarToken,
} from "@/hooks/useApi"
import { api } from "@/lib/api-client"
import { downloadBlob } from "@/lib/media"
import { CalendarIcon, DownloadIcon, ExternalIcon } from "@/components/icons"

export function CalendarSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const token = useCalendarToken()
  const rotate = useRotateCalendarToken()
  const revoke = useRevokeCalendarToken()
  const [url, setUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function generate() {
    setFeedback(null)
    try {
      const result = await rotate.mutateAsync()
      setUrl(result.url)
    } catch {
      setFeedback("Génération impossible.")
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setFeedback("Lien copié. Colle-le dans ton agenda.")
    } catch {
      setFeedback("Copie impossible : sélectionne le lien manuellement.")
    }
  }

  async function revokeLink() {
    await revoke.mutateAsync()
    setUrl(null)
    setFeedback("Lien révoqué.")
  }

  async function download() {
    setBusy(true)
    setFeedback(null)
    try {
      const text = await api.milestones.calendar()
      downloadBlob(new Blob([text], { type: "text/calendar;charset=utf-8" }), "casarenous.ics")
    } catch {
      setFeedback("Téléchargement impossible.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Synchroniser l'agenda"
      description="Un flux ICS privé, à ajouter à ton calendrier."
    >
      <div className="aura-stack" style={{ gap: 18 }}>
        <div className="aura-row-flex" style={{ gap: 8 }}>
          <CalendarIcon size={20} />
          <p className="app-small">
            Les jalons sont exportés en événements journée entière, avec des rappels
            J-7 et J-1.
          </p>
        </div>

        {token.data?.exists && !url ? <Badge tone="success">Flux actif</Badge> : null}

        {url ? (
          <div className="aura-stack" style={{ gap: 8 }}>
            <Input readOnly label="Lien du flux" value={url} />
            <div className="app-inline-actions">
              <Button size="sm" variant="soft" onClick={() => void copy()}>
                Copier
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void revokeLink()}>
                Révoquer
              </Button>
            </div>
          </div>
        ) : (
          <div className="app-inline-actions">
            <Button
              size="sm"
              icon={<ExternalIcon size={15} />}
              loading={rotate.isPending}
              onClick={() => void generate()}
            >
              {token.data?.exists ? "Régénérer le lien" : "Créer le lien privé"}
            </Button>
            {token.data?.exists ? (
              <Button size="sm" variant="ghost" onClick={() => void revokeLink()}>
                Révoquer
              </Button>
            ) : null}
          </div>
        )}

        <Button
          variant="outline"
          block
          icon={<DownloadIcon size={16} />}
          loading={busy}
          onClick={() => void download()}
        >
          Télécharger le fichier .ics
        </Button>

        <section>
          <p className="app-kicker" style={{ marginBottom: 6 }}>
            Ajouter à ton agenda
          </p>
          <ul className="app-small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>iPhone :</strong> Réglages → Calendrier → Comptes → Ajouter un compte
              → Autre → Ajouter un calendrier avec abonnement.
            </li>
            <li>
              <strong>Google Calendar :</strong> Autres calendriers → À partir de l'URL.
            </li>
            <li>
              <strong>Outlook :</strong> Ajouter un calendrier → S'abonner depuis le Web.
            </li>
          </ul>
        </section>

        {feedback ? (
          <p className="aura-hint" role="status">
            {feedback}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
