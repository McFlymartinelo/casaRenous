import { useState } from "react"
import {
  Badge,
  Button,
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
  useRevokeCalendarToken,
  useRevokeSession,
  useRotateCalendarToken,
  useSessions,
} from "@/hooks/useApi"
import {
  BellIcon,
  CalendarIcon,
  DownloadIcon,
  LockIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  ShieldIcon,
  SunIcon,
} from "@/components/icons"

export function SettingsSheet({
  open,
  onClose,
  onChangePassword,
  onInvite,
}: {
  open: boolean
  onClose: () => void
  onChangePassword: () => void
  onInvite: () => void
}) {
  const { user, logout, busy } = useAuth()
  const isAdmin = user?.role === "admin"
  const { theme, setTheme } = useTheme()
  const sessions = useSessions()
  const revoke = useRevokeSession()
  const calendarToken = useCalendarToken()
  const rotate = useRotateCalendarToken()
  const revokeToken = useRevokeCalendarToken()
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

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
      description={user ? `${user.displayName} · ${user.role === "admin" ? "Admin" : "Invité"}` : undefined}
    >
      <div className="aura-stack" style={{ gap: 20 }}>
        <section>
          <p className="app-kicker" style={{ marginBottom: 8 }}>
            Apparence
          </p>
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
          <p className="aura-hint" style={{ marginTop: 6 }}>
            <SunIcon size={13} /> <MoonIcon size={13} /> Le thème suit le système en mode Auto.
          </p>
        </section>

        <section>
          <p className="app-kicker" style={{ marginBottom: 8 }}>
            <BellIcon size={13} /> Notifications
          </p>
          <PushCard
            appName="CasaRenous"
            apiBase="/api"
            fetch={apiFetch}
            showDiagnostics
          />
        </section>

        <section>
          <p className="app-kicker" style={{ marginBottom: 8 }}>
            <CalendarIcon size={13} /> Agenda externe
          </p>
          <p className="app-small" style={{ marginBottom: 8 }}>
            Abonne ton calendrier (iPhone, Google, Outlook) au rétroplanning. Le lien est
            personnel et révocable.
          </p>
          {calendarToken.data?.exists && !feedUrl ? (
            <Badge tone="success">Lien actif</Badge>
          ) : null}
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
            <p className="aura-hint" role="status" style={{ marginTop: 8 }}>
              {feedback}
            </p>
          ) : null}
        </section>

        <section>
          <p className="app-kicker" style={{ marginBottom: 8 }}>
            <ShieldIcon size={13} /> Sessions actives
          </p>
          <div className="app-list">
            {sessions.data?.map((session) => (
              <ListRow
                key={session.id}
                icon={<MonitorIcon size={18} />}
                title={session.current ? "Cet appareil" : "Autre appareil"}
                subtitle={new Date(session.lastSeenAt).toLocaleString("fr-FR")}
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
          <p className="aura-hint" style={{ marginTop: 6 }}>
            Une session expire après 24 h d'inactivité et 14 jours au maximum.
          </p>
        </section>

        {isAdmin ? (
          <section>
            <p className="app-kicker" style={{ marginBottom: 8 }}>
              Accès
            </p>
            <Button
              variant="soft"
              block
              icon={<PlusIcon size={17} />}
              onClick={onInvite}
            >
              Inviter une personne
            </Button>
            <p className="aura-hint" style={{ marginTop: 6 }}>
              Crée un accès nominatif avec rôle et code à usage unique.
            </p>
          </section>
        ) : null}

        <section className="aura-stack" style={{ gap: 8 }}>
          <Button
            variant="outline"
            block
            icon={<LockIcon size={17} />}
            onClick={onChangePassword}
          >
            Changer de mot de passe
          </Button>
          <Button
            variant="ghost"
            block
            icon={<LogOutIcon size={17} />}
            loading={busy}
            onClick={() => void logout()}
          >
            Se déconnecter
          </Button>
        </section>

        <section>
          <p className="app-kicker" style={{ marginBottom: 8 }}>
            À propos
          </p>
          <BrandLogo variant="horizontal" width={160} />
          <p className="aura-hint" style={{ marginTop: 8 }}>
            CasaRenous 1.0 · PWA offline-first · hébergée sur Oracle Cloud Infrastructure.
            Les données du chantier restent privées.
          </p>
        </section>
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
