import { useEffect, useRef, useState } from "react"
import { BudgetCreateInput, MAX_BULK_BUDGET_ITEMS } from "@casarenous/shared"
import { useNotify } from "@/aura/notify/react"
import { useAuth } from "@/auth/AuthProvider"
import { useCreateBudgetItems } from "@/hooks/useApi"

const DEV_PLANNER_PORT = 5180

function defaultPlannerUrl(): string {
  if (import.meta.env.DEV) {
    const host = window.location.hostname || "localhost"
    return `${window.location.protocol}//${host}:${DEV_PLANNER_PORT}/`
  }
  const home = new URL(import.meta.env.BASE_URL, window.location.origin)
  return new URL("amenagement-app/", home).href
}

/**
 * Le planificateur est une application statique autonome (Vite + R3F).
 * On l'ouvre en plein écran dans un iframe pour isoler complètement son CSS
 * et son canvas de la PWA CasaRenous.
 *
 * Le planificateur peut envoyer des lignes de budget via postMessage
 * (`casarenous-planner` / `budget:add`) : elles sont créées ici, dans le
 * portail, avec ses droits et son client API.
 */
export function AmenagementScreen() {
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const createMany = useCreateBudgetItems()
  const { notify } = useNotify()
  const { user } = useAuth()

  useEffect(() => {
    const previous = document.title
    document.title = "Aménagement · CasaRenous"
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000)
    return () => window.clearTimeout(timer)
  }, [])

  const configured = import.meta.env.VITE_PLANNER_URL as string | undefined
  const base = configured || defaultPlannerUrl()
  const separator = base.includes("?") ? "&" : "?"
  let previous: string | null = null
  try {
    previous = window.sessionStorage.getItem("casarenous:from")
  } catch {
    /* stockage indisponible */
  }
  const returnPath =
    previous && previous.startsWith("/") && previous !== "/amenagement" ? previous : "/"
  const returnTo = new URL(returnPath, window.location.origin).href
  const src = `${base}${separator}embed=1&returnTo=${encodeURIComponent(returnTo)}`

  useEffect(() => {
    let busy = false

    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return

      const allowed = new Set([window.location.origin])
      try {
        allowed.add(new URL(base).origin)
      } catch {
        /* URL configurée invalide : seule l'origine du portail est acceptée */
      }
      if (!allowed.has(event.origin)) return

      const data = event.data as
        | { source?: unknown; type?: unknown; items?: unknown }
        | null
        | undefined
      if (!data || data.source !== "casarenous-planner" || data.type !== "budget:add") return
      if (!Array.isArray(data.items) || busy) return

      const items = data.items.flatMap((raw) => {
        const parsed = BudgetCreateInput.safeParse(raw)
        return parsed.success ? [parsed.data] : []
      })
      if (!items.length) return

      if (user?.role !== "admin") {
        notify({
          title: "Budget non modifiable",
          message: "L'ajout au budget est réservé aux administrateurs.",
          tone: "danger",
        })
        return
      }

      busy = true
      void (async () => {
        try {
          for (let index = 0; index < items.length; index += MAX_BULK_BUDGET_ITEMS) {
            await createMany.mutateAsync(items.slice(index, index + MAX_BULK_BUDGET_ITEMS))
          }
          notify({
            title: "Budget mis à jour",
            message: `${items.length} ligne${items.length > 1 ? "s" : ""} ajoutée${items.length > 1 ? "s" : ""} depuis le planificateur.`,
            tone: "success",
          })
        } catch {
          notify({
            title: "Ajout au budget impossible",
            message: "Vérifie tes droits et réessaie.",
            tone: "danger",
          })
        } finally {
          busy = false
        }
      })()
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [base, createMany, notify, user?.role])

  return (
    <div className="app-amenagement" role="main">
      {!loaded ? (
        <div className="app-amenagement__status">
          <p>Chargement du planificateur…</p>
          {slow ? (
            <>
              <p className="app-amenagement__hint">Le planificateur ne répond pas sur le port 5180.</p>
              <p className="app-amenagement__hint">
                Lance <code>npm run dev:planner</code>, puis recharge cette page.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        src={src}
        title="Planificateur d'aménagement 3D"
        allow="fullscreen; pointer-lock"
        allowFullScreen
        onLoad={() => {
          setLoaded(true)
          setSlow(false)
        }}
      />
      <a className="app-amenagement__open" href={base} target="_blank" rel="noreferrer">
        Ouvrir dans un nouvel onglet
      </a>
    </div>
  )
}
