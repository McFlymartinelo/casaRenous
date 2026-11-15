import { useEffect, useState, type FormEvent } from "react"
import { Button, Input, useOnlineStatus } from "@/aura/react"
import { BrandLogo } from "@/components/BrandLogo"
import { LockIcon, ShieldIcon } from "@/components/icons"
import { useAuth } from "./AuthProvider"

type Step = "credentials" | "register" | "otp"

export function AuthScreen() {
  const {
    login,
    verifyOtp,
    resendOtp,
    registerRequest,
    verifyRegistration,
    resendRegistration,
    cancelOtp,
    pendingEmail,
    pendingMode,
    devCode,
    error,
    busy,
    clearError,
  } = useAuth()
  const online = useOnlineStatus()
  const [step, setStep] = useState<Step>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")

  const [invitationCode, setInvitationCode] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerName, setRegisterName] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")
  const [registerConfirm, setRegisterConfirm] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (pendingEmail) setStep("otp")
  }, [pendingEmail])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  function goTo(next: Step) {
    clearError()
    setLocalError(null)
    setStep(next)
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    clearError()
    setLocalError(null)
    try {
      await login(email, password)
      setPassword("")
      setStep("otp")
    } catch {
      // L'erreur est affichée par le provider.
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault()
    clearError()
    setLocalError(null)
    if (registerPassword !== registerConfirm) {
      setLocalError("Les deux mots de passe ne correspondent pas.")
      return
    }
    try {
      await registerRequest({
        invitationCode: invitationCode.trim(),
        email: registerEmail,
        displayName: registerName,
        password: registerPassword,
      })
      setInvitationCode("")
      setRegisterPassword("")
      setRegisterConfirm("")
      setStep("otp")
    } catch {
      // L'erreur est affichée par le provider.
    }
  }

  async function handleOtp(event: FormEvent) {
    event.preventDefault()
    clearError()
    setLocalError(null)
    try {
      if (pendingMode === "register") {
        await verifyRegistration(code)
      } else {
        await verifyOtp(code)
      }
      setCode("")
    } catch {
      setCode("")
    }
  }

  async function handleResend() {
    try {
      const seconds =
        pendingMode === "register" ? await resendRegistration() : await resendOtp()
      setCooldown(seconds)
    } catch {
      setCooldown(30)
    }
  }

  function backToCredentials() {
    cancelOtp()
    setCode("")
    goTo("credentials")
  }

  return (
    <div className="aura-app">
      <main className="app-auth">
        <div className="app-auth__shell">
          <div className="app-auth__brand-block">
            <p className="app-kicker">Carnet de chantier privé</p>
            <BrandLogo variant="stacked" width={196} priority />
            <p className="app-auth__tagline">
              La maison Sévin–Renous, du premier coup de crayon à la remise des clés.
            </p>
          </div>

          {step === "credentials" ? (
            <form className="app-auth__form" onSubmit={handleLogin}>
              <Input
                label="Adresse email"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vous@exemple.fr"
              />
              <Input
                label="Mot de passe"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {error ? (
                <p className="aura-error-text" role="alert" aria-live="polite">
                  {error}
                </p>
              ) : null}
              <Button type="submit" block size="lg" loading={busy} disabled={!online}>
                Recevoir mon code
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                onClick={() => goTo("register")}
              >
                J'ai une invitation
              </Button>
              <p className="aura-hint" style={{ textAlign: "center" }}>
                Un code à 6 chiffres sera envoyé par email. L'inscription se fait
                uniquement sur invitation.
              </p>
            </form>
          ) : null}

          {step === "register" ? (
            <form className="app-auth__form" onSubmit={handleRegister}>
              <div className="aura-row-flex" style={{ gap: 8 }}>
                <span className="aura-empty__icon" style={{ width: 36, height: 36 }}>
                  <ShieldIcon size={18} />
                </span>
                <div>
                  <p className="aura-h3">Créer mon compte</p>
                  <p className="app-small">Sur invitation de l'administrateur.</p>
                </div>
              </div>
              <Input
                label="Code d'invitation"
                name="invitation"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={invitationCode}
                onChange={(event) => setInvitationCode(event.target.value.trim())}
                placeholder="Code reçu par email"
                hint="Le code est personnel, à usage unique."
              />
              <Input
                label="Adresse email"
                type="email"
                name="register-email"
                autoComplete="email"
                inputMode="email"
                required
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                hint="Doit correspondre à l'adresse invitée."
              />
              <Input
                label="Nom affiché"
                name="register-name"
                autoComplete="name"
                required
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                placeholder="Mme Sévin"
              />
              <Input
                label="Mot de passe"
                type="password"
                name="register-password"
                autoComplete="new-password"
                required
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                hint="12 caractères minimum, 3 familles de caractères."
              />
              <Input
                label="Confirmer le mot de passe"
                type="password"
                name="register-confirm"
                autoComplete="new-password"
                required
                value={registerConfirm}
                onChange={(event) => setRegisterConfirm(event.target.value)}
              />
              {localError || error ? (
                <p className="aura-error-text" role="alert" aria-live="polite">
                  {localError ?? error}
                </p>
              ) : null}
              <Button type="submit" block size="lg" loading={busy} disabled={!online}>
                Recevoir mon code
              </Button>
              <Button type="button" variant="ghost" block onClick={() => goTo("credentials")}>
                J'ai déjà un compte
              </Button>
            </form>
          ) : null}

          {step === "otp" ? (
            <form className="app-auth__form" onSubmit={handleOtp}>
              <div className="aura-row-flex" style={{ gap: 8 }}>
                <span className="aura-empty__icon" style={{ width: 36, height: 36 }}>
                  <ShieldIcon size={18} />
                </span>
                <div>
                  <p className="aura-h3">
                    {pendingMode === "register" ? "Valider mon compte" : "Code de vérification"}
                  </p>
                  <p className="app-small">Envoyé à {pendingEmail ?? "ton adresse"}</p>
                </div>
              </div>
              <Input
                label="Code à 6 chiffres"
                className="app-otp-input"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
              />
              {devCode ? (
                <div className="app-sync-bar app-sync-bar--warn">
                  <span className="app-sync-bar__text">
                    Mode test · code <strong>{devCode}</strong>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setCode(devCode)}>
                    Remplir
                  </Button>
                </div>
              ) : null}
              {localError || error ? (
                <p className="aura-error-text" role="alert" aria-live="polite">
                  {localError ?? error}
                </p>
              ) : null}
              <Button
                type="submit"
                block
                size="lg"
                loading={busy}
                disabled={code.length !== 6 || !online}
              >
                {pendingMode === "register" ? "Créer mon compte" : "Entrer dans la maison"}
              </Button>
              <div className="aura-row-flex" style={{ justifyContent: "space-between" }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={backToCredentials}
                >
                  Changer de compte
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cooldown > 0 || !online}
                  onClick={() => void handleResend()}
                >
                  {cooldown > 0 ? `Renvoyer (${cooldown} s)` : "Renvoyer le code"}
                </Button>
              </div>
            </form>
          ) : null}

          {!online ? (
            <p className="aura-hint" style={{ marginTop: 12, textAlign: "center" }}>
              Hors ligne : la connexion nécessite une première synchronisation.
            </p>
          ) : null}

          <div className="app-auth__footer">
            <p className="aura-row-flex" style={{ justifyContent: "center", gap: 6 }}>
              <LockIcon size={13} />
              Accès privé · code de vérification · session sécurisée
            </p>
            <p style={{ marginTop: 6 }}>Hébergé sur Oracle Cloud · casarenous.martylab.fr</p>
          </div>
        </div>
      </main>
    </div>
  )
}
