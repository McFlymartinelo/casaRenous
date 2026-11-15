import { Button, useOnlineStatus } from "@/aura/react"
import { useOutbox } from "@/lib/outbox"
import { AlertIcon, RefreshIcon, WifiOffIcon } from "./icons"

export function SyncBanner() {
  const online = useOnlineStatus()
  const { pending, errors, busy, flush } = useOutbox()

  if (online && pending === 0 && errors === 0) return null

  const tone = !online ? "app-sync-bar--offline" : errors > 0 ? "app-sync-bar--warn" : ""

  return (
    <div className={`app-sync-bar ${tone}`} role="status" aria-live="polite">
      {!online ? <WifiOffIcon size={18} /> : <AlertIcon size={18} />}
      <span className="app-sync-bar__text">
        {!online
          ? "Hors ligne — photos, notes et réserves sont conservées sur cet appareil."
          : errors > 0
            ? `${errors} élément(s) n'ont pas pu être envoyés. Ouvre le journal pour voir pourquoi.`
            : `${pending} élément(s) en attente de synchronisation.`}
      </span>
      {online && pending > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          loading={busy}
          icon={<RefreshIcon size={15} />}
          onClick={() => void flush()}
        >
          Synchroniser
        </Button>
      ) : null}
    </div>
  )
}
