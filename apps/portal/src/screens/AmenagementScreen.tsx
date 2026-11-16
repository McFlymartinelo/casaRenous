import { useEffect, useState } from "react"

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
 */
export function AmenagementScreen() {
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)

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
    previous && previous.startsWith("/") && previous !== "/amenagement"
      ? previous
      : "/"
  const returnTo = new URL(returnPath, window.location.origin).href
  const src = `${base}${separator}embed=1&returnTo=${encodeURIComponent(returnTo)}`

  return (
    <div className="app-amenagement" role="main">
      {!loaded ? (
        <div className="app-amenagement__status">
          <p>Chargement du planificateur…</p>
          {slow ? (
            <>
              <p className="app-amenagement__hint">
                Le planificateur ne répond pas sur le port 5180.
              </p>
              <p className="app-amenagement__hint">
                Lance <code>npm run dev:planner</code>, puis recharge cette page.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      <iframe
        src={src}
        title="Planificateur d'aménagement 3D"
        allow="fullscreen; pointer-lock"
        allowFullScreen
        onLoad={() => {
          setLoaded(true)
          setSlow(false)
        }}
      />
      <a
        className="app-amenagement__open"
        href={base}
        target="_blank"
        rel="noreferrer"
      >
        Ouvrir dans un nouvel onglet
      </a>
    </div>
  )
}
