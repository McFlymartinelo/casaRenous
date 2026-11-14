import "@fontsource-variable/fraunces"
import "@fontsource-variable/inter"
import "./aura/aura.css"
import "./aura/notify/notify.css"
import "./styles/tokens.css"
import "./styles/app.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { registerServiceWorker } from "./aura/react"
import { App } from "./App"

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD) {
  void registerServiceWorker("/sw.js", { autoReload: true, checkUpdate: true })
}
