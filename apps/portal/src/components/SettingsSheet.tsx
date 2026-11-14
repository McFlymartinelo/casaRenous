import { useState, type ReactNode } from "react"
import {
  Badge,
  Button,
  Card,
  Input,
  ListRow,
  Segmented,
  Sheet,
  useTheme,
} from "@/aura/react"
import { PushCard } from "@/aura/notify/react"
import type { ThemeMode } from "@/aura/react"
import { useAuth } from "@/auth/AuthProvider"
import { BrandLogo } from "@/components/BrandLogo"
import { apiFetch } from "@/lib/api-client"
import {
  useCalendarToken,
  useInvitations,
  useRevokeCalendarToken,
  useRevokeSession,
  useRotateCalendarToken,
  useSessions,
} from "@/hooks/useApi"
import { formatDateTime } from "@/lib/dates"
import {
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  LockIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  ShieldIcon,
  SunIcon,
} from "@/components/icons"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

/** « Chrome · macOS », lisible sans exposer le user-agent brut. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu"
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Navigateur"
  const system = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null
  return system ? `${browser} · ${system}` : browser
}

function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string
  icon?: ReactNode
  description?: string
  children: ReactNode
}) {
  return (
    <section className="app-settings-section">
      <p className="app-kicker">
        {icon ? <span className="app-settings-section__icon">{icon}</span> : null}
        {title}
      </p>
      {description ? <p className="app-small">{description}</p> : null}
      {children}
    </section>
  )
}

export function SettingsSheet({
  open,
  onClose,
  onChangePassword,
  onInvite,
  onManageCategories,
}: {
  open: boolean
  onClose: () => void
  onChangePassword: () => void
  onInvite: () => void
  onManageCategories: () => void
}) {
  const { user, logout, busy } = useAuth()
  const isAdmin = user?.role === "admin"
  const { theme, setTheme } = useTheme()
  const sessions = useSessions()
  const revoke = useRevokeSession()
  const invitations = useInvitations(isAdmin)
  const calendarToken = useCalendarToken()
  const rotate = useRotateCalendarToken()
  const revokeToken = useRevokeCalendarToken()
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const pendingInvites = (invitations.data ?? []).filter(
    (invitation) =>
      !invitation.usedAt &&
      !invitation.revokedAt &&
      new Date(invitation.expiresAt).getTime() > Date.now(),
  ).length

  async function handleRotate() {
    setFeedback(null)
    try {
      const result = await rotate.mutateAsync()
      setFeedUrl(result.url)
      setCopied(false)
    } catch {
      setFeedback("Génération du lien impossible.")
    }
  }

  async function handleCopy() {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
    } catch {
      setFeedback("Copie impossible : sélectionne le lien manuellement.")
    }
  }

  async function handleRevokeToken() {
    await revokeToken.mutateAsync()
    setFeedUrl(null)
    setFeedback("Lien de calendrier révoqué.")
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Réglages"
      description={user ? `${user.displayName} · ${isAdmin ? "Admin" : "Invité"}` : undefined}
    >
      <div className="app-settings">
        {user ? (
          <Card variant="soft">
            <div className="app-settings-profile">
              <span className="app-settings-avatar" aria-hidden>
                {initials(user.displayName)}
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="aura-h3">{user.displayName}</p>
                <p className="app-small app-settings-email">{user.email}</p>
                <Badge tone={isAdmin ? "accent" : "neutral"}>
                  {isAdmin ? "Administrateur" : "Invité"}
                </Badge>
              </div>
            </div>
          </Card>
        ) : null}

        <Section title="Apparence" icon={<SunIcon size={13} />}>
          <Segmented<ThemeMode>
            label="Thème"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Clair" },
              { value: "system", label: "Auto" },
              { value: "dark", label: "Sombre" },
            ]}
          />
          <p className="aura-hint">
            <SunIcon size={13} /> <MoonIcon size={13} /> En mode Auto, le thème suit celui du
            téléphone ou de l'ordinateur.
          </p>
        </Section>

        <Section
          title="Notifications"
          icon={<BellIcon size={13} />}
          description="Rappels des jalons et alertes du chantier, même application fermée."
        >
          <PushCard appName="CasaRenous" apiBase="/api" fetch={apiFetch} showDiagnostics />
        </Section>

        <Section
          title="Agenda externe"
          icon={<CalendarIcon size={13} />}
          description="Abonne ton calendrier (iPhone, Google, Outlook) au rétroplanning. Le lien est personnel et révocable."
        >
          <div className="app-settings-status">
            <span className="app-small">Abonnement calendrier</span>
            {calendarToken.data?.exists ? (
              <Badge tone="success">Lien actif</Badge>
            ) : (
              <Badge tone="neutral">Aucun lien</Badge>
            )}
          </div>
          {feedUrl ? (
            <div className="aura-stack" style={{ gap: 8 }}>
              <Input readOnly value={feedUrl} label="Lien du calendrier" />
              <div className="app-inline-actions">
                <Button size="sm" variant="soft" onClick={() => void handleCopy()}>
                  {copied ? "Copié" : "Copier"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleRevokeToken()}
                  loading={revokeToken.isPending}
                >
                  Révoquer
                </Button>
              </div>
            </div>
          ) : (
            <div className="app-inline-actions">
              <Button
                size="sm"
                variant="soft"
                icon={<DownloadIcon size={15} />}
                loading={rotate.isPending}
                onClick={() => void handleRotate()}
              >
                {calendarToken.data?.exists ? "Régénérer le lien" : "Créer le lien"}
              </Button>
              {calendarToken.data?.exists ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleRevokeToken()}
                  loading={revokeToken.isPending}
                >
                  Révoquer
                </Button>
              ) : null}
            </div>
          )}
          {feedback ? (
            <p className="aura-hint" role="status">
              {feedback}
            </p>
          ) : null}
        </Section>

        <Section
          title="Sécurité"
          icon={<ShieldIcon size={13} />}
          description="Une session expire après 24 h d'inactivité et 14 jours au maximum."
        >
          <div className="app-list">
            {sessions.data?.map((session) => (
              <ListRow
                key={session.id}
                icon={<MonitorIcon size={18} />}
                title={session.current ? "Cet appareil" : deviceLabel(session.userAgent)}
                subtitle={formatDateTime(session.lastSeenAt)}
                meta={
                  session.current ? (
                    <Badge tone="accent">Courant</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={revoke.isPending}
                      onClick={() => void revoke.mutateAsync(session.id)}
                    >
                      Révoquer
                    </Button>
                  )
                }
              />
            ))}
          </div>
          <Button
            variant="outline"
            block
            icon={<LockIcon size={17} />}
            onClick={onChangePassword}
          >
            Changer de mot de passe
          </Button>
        </Section>

        {isAdmin ? (
          <Section
            title="Accès"
            icon={<PlusIcon size={13} />}
            description="Invitations, rôles et organisation du coffre-fort."
          >
            <Button
              variant="soft"
              block
              icon={<PlusIcon size={17} />}
              onClick={onInvite}
            >
              Inviter une personne
            </Button>
            <div className="app-list">
              <ListRow
                icon={<ShieldIcon size={18} />}
                title="Invitations"
                subtitle={
                  pendingInvites > 0
                    ? `${pendingInvites} invitation${pendingInvites > 1 ? "s" : ""} en attente`
                    : "Aucune invitation en attente"
                }
                meta={<ChevronRightIcon size={16} />}
                onClick={onInvite}
              />
              <ListRow
                icon={<FolderIcon size={18} />}
                title="Catégories de documents"
                subtitle="Créer, renommer ou supprimer"
                meta={<ChevronRightIcon size={16} />}
                onClick={onManageCategories}
              />
            </div>
          </Section>
        ) : null}

        <Section title="À propos">
          <BrandLogo variant="horizontal" width={160} />
          <p className="aura-hint">
            CasaRenous 1.0 · PWA offline-first · hébergée sur Oracle Cloud Infrastructure.
            Les données du chantier restent privées.
          </p>
          <Button
            variant="ghost"
            block
            icon={<LogOutIcon size={17} />}
            loading={busy}
            onClick={() => void logout()}
          >
            Se déconnecter
          </Button>
        </Section>
      </div>
    </Sheet>
  )
}

export function PasswordSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { changePassword, error, busy } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  async function submit() {
    setLocalError(null)
    if (newPassword !== confirm) {
      setLocalError("Les deux mots de passe ne correspondent pas.")
      return
    }
    try {
      await changePassword({ currentPassword, newPassword })
    } catch {
      // Erreur du provider.
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nouveau mot de passe"
      description="Toutes les sessions seront révoquées. Tu te reconnecteras avec un code OTP."
      footer={
        <Button block loading={busy} onClick={() => void submit()}>
          Enregistrer
        </Button>
      }
    >
      <div className="aura-stack">
        <Input
          label="Mot de passe actuel"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <Input
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          hint="12 caractères minimum, 3 familles de caractères."
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Input
          label="Confirmer"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {localError || error ? (
          <p className="aura-error-text" role="alert">
            {localError ?? error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
