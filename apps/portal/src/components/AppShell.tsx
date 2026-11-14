import { useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  AppBar,
  BottomTabs,
  Button,
  IconButton,
  Screen,
  withViewTransition,
  type TabItem,
} from "@/aura/react"
import { useAuth } from "@/auth/AuthProvider"
import { BrandLogo } from "@/components/BrandLogo"
import {
  CalendarIcon,
  CubeIcon,
  FolderIcon,
  HomeIcon,
  SlidersIcon,
  WalletIcon,
} from "@/components/icons"
import { PasswordSheet, SettingsSheet } from "@/components/SettingsSheet"
import { InvitationsSheet } from "@/features/invitations/InvitationsSheet"
import { DocumentCategoriesSheet } from "@/features/documents/DocumentCategoriesSheet"
import { AnalysisQualitySheet } from "@/features/documents/AnalysisQualitySheet"
import { SyncBanner } from "@/components/SyncBanner"

const TABS: TabItem[] = [
  { id: "piazza", label: "Piazza", icon: <HomeIcon size={21} /> },
  { id: "3d", label: "3D", icon: <CubeIcon size={21} /> },
  { id: "planning", label: "Planning", icon: <CalendarIcon size={21} /> },
  { id: "chantier", label: "Chantier", icon: <FolderIcon size={21} /> },
  { id: "budget", label: "Budget", icon: <WalletIcon size={21} /> },
]

const TAB_PATH: Record<string, string> = {
  piazza: "/",
  "3d": "/3d",
  planning: "/planning",
  chantier: "/chantier",
  budget: "/budget",
}

const DESKTOP_NAV = [
  {
    id: "piazza",
    label: "La Piazza",
    description: "Tableau de bord",
    icon: <HomeIcon size={20} />,
  },
  {
    id: "3d",
    label: "3D & Plans",
    description: "La maison en volume",
    icon: <CubeIcon size={20} />,
  },
  {
    id: "planning",
    label: "Rétroplanning",
    description: "Livraison prévue en juin 2028",
    icon: <CalendarIcon size={20} />,
  },
  {
    id: "chantier",
    label: "Docs & Chantier",
    description: "Journal, preuves, réserves",
    icon: <FolderIcon size={20} />,
  },
  {
    id: "budget",
    label: "Budget",
    description: "CCMI et avenants",
    icon: <WalletIcon size={20} />,
  },
]

const DEFAULT_META = { title: "La Piazza", subtitle: "Maison Sévin–Renous" }

const SCREEN_META: Record<string, { title: string; subtitle: string }> = {
  "/": DEFAULT_META,
  "/3d": { title: "3D & Plans", subtitle: "La maison, pièce par pièce" },
  "/planning": { title: "Rétroplanning", subtitle: "Livraison prévue en juin 2028" },
  "/chantier": { title: "Docs & Chantier", subtitle: "Preuves, photos et réserves" },
  "/budget": { title: "Budget", subtitle: "CCMI et avenants" },
}

function tabForPath(pathname: string): string {
  if (pathname.startsWith("/3d")) return "3d"
  if (pathname.startsWith("/planning")) return "planning"
  if (pathname.startsWith("/chantier")) return "chantier"
  if (pathname.startsWith("/budget")) return "budget"
  return "piazza"
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [invitesOpen, setInvitesOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const active = tabForPath(location.pathname)
  const meta = SCREEN_META[location.pathname] ?? DEFAULT_META

  function go(id: string) {
    const path = TAB_PATH[id] ?? "/"
    if (path === location.pathname) return
    withViewTransition(() => navigate(path))
  }

  return (
    <div className="aura-app">
      <div className="aura-frame app-shell">
        <aside className="app-sidebar" aria-label="Navigation principale">
          <div className="app-sidebar__brand">
            <BrandLogo variant="horizontal" width={170} priority />
          </div>
          <nav className="app-sidebar__nav">
            {DESKTOP_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className="app-sidebar__item"
                aria-current={active === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <span className="app-sidebar__icon">{item.icon}</span>
                <span className="app-sidebar__text">
                  <span className="app-sidebar__label">{item.label}</span>
                  <span className="app-sidebar__desc">{item.description}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="app-sidebar__footer">
            <p className="app-sidebar__user">{user?.displayName}</p>
            <p className="app-sidebar__role">
              {user?.role === "admin" ? "Administrateur" : "Invité"}
            </p>
            <Button
              variant="ghost"
              block
              size="sm"
              icon={<SlidersIcon size={16} />}
              onClick={() => setSettingsOpen(true)}
            >
              Réglages
            </Button>
          </div>
        </aside>

        <div className="app-main">
          <AppBar
            leading={
              <BrandLogo
                variant="symbol"
                width={36}
                priority
                className="app-appbar-logo"
              />
            }
            title={meta.title}
            subtitle={user ? `${meta.subtitle} · ${user.displayName}` : meta.subtitle}
            actions={
              <IconButton
                label="Réglages"
                className="app-appbar-settings"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersIcon size={20} />
              </IconButton>
            }
          />
          <Screen tabbar>
            <div className="app-pad" style={{ paddingBottom: 0 }}>
              <SyncBanner />
            </div>
            <Outlet />
          </Screen>
          <BottomTabs
            variant="capsule"
            items={TABS}
            value={active}
            onChange={go}
          />
        </div>
      </div>

      {settingsOpen ? (
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onChangePassword={() => {
            setSettingsOpen(false)
            setPasswordOpen(true)
          }}
          onInvite={() => {
            setSettingsOpen(false)
            setInvitesOpen(true)
          }}
          onManageCategories={() => {
            setSettingsOpen(false)
            setCategoriesOpen(true)
          }}
          onOpenQuality={() => {
            setSettingsOpen(false)
            setQualityOpen(true)
          }}
        />
      ) : null}
      {passwordOpen ? (
        <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      ) : null}
      {invitesOpen ? (
        <InvitationsSheet open={invitesOpen} onClose={() => setInvitesOpen(false)} />
      ) : null}
      {categoriesOpen ? (
        <DocumentCategoriesSheet onClose={() => setCategoriesOpen(false)} />
      ) : null}
      {qualityOpen ? (
        <AnalysisQualitySheet onClose={() => setQualityOpen(false)} />
      ) : null}
    </div>
  )
}
