# Aura dans CasaRenous

## 1. Importer le CSS

```ts
import "./aura/aura.css"

import "./aura/notify/notify.css"
```

## 2. Envelopper l'application

```tsx
import { ThemeProvider, Screen, AppBar, BottomTabs } from "./aura/react"

export function Root() {
  return (
    <ThemeProvider defaultTheme="system" defaultAccent="terracotta">
      <div className="aura-app">
        <div className="aura-frame">
          <AppBar title="CasaRenous" />
          <Screen>{/* écrans */}</Screen>
        </div>
      </div>
    </ThemeProvider>
  )
}
```

## 3. PWA

- Manifest : voir `src/aura/pwa/README.md` (la config dépend de la stack).
- Icônes : `src/aura/pwa/icons/` + `npx @vite-pwa/assets-generator`.
- Config Vite : voir `src/aura/pwa/vite-plugin-pwa.snippet.ts.txt`.
- Config Next : voir `src/aura/pwa/next-manifest.ts.txt`.


## 5. Notifications

- Styles : `instrument` (Android), `banner` (iOS), `card`, ou `auto`.
- React : `NotifyProvider` + `useNotify`.
- Push : `createPushClient` + `src/aura/notify/sw/push-sw.js`.
- Serveur : `src/aura/notify/server/` + clés VAPID.
- Détails : `src/aura/notify/README.md`.

## Règles

1. Jamais de couleur en dur dans un écran : utiliser les tokens `--aura-*`.
2. Une seule carte héro par écran.
3. Cibles tactiles ≥ 44 px, safe areas respectées.
4. `prefers-reduced-motion` respecté (déjà géré par le CSS).
