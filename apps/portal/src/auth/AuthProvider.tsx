import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type {
  PasswordChangeInput,
  RegisterRequestInput,
  UserPublic,
} from "@casarenous/shared"
import { api, ApiClientError, UNAUTHORIZED_EVENT } from "@/lib/api-client"
import { clearPersistedCache, queryClient } from "@/lib/query-client"
import { idbClear } from "@/lib/idb"

export type AuthStatus = "loading" | "anonymous" | "authenticated"

export type PendingAuthMode = "login" | "register"

interface AuthContextValue {
  status: AuthStatus
  user: UserPublic | null
  pendingEmail: string | null
  pendingMode: PendingAuthMode | null
  devCode: string | null
  error: string | null
  busy: boolean
  login: (email: string, password: string) => Promise<void>
  verifyOtp: (code: string) => Promise<void>
  resendOtp: () => Promise<number>
  registerRequest: (input: RegisterRequestInput) => Promise<void>
  verifyRegistration: (code: string) => Promise<void>
  resendRegistration: () => Promise<number>
  cancelOtp: () => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
  changePassword: (input: PasswordChangeInput) => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const LAST_USER_KEY = "casarenous-last-user"

function readLastUser(): UserPublic | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAST_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserPublic
    if (!parsed?.id || !parsed?.role || !parsed?.displayName) return null
    return parsed
  } catch {
    return null
  }
}

function writeLastUser(user: UserPublic): void {
  try {
    window.localStorage.setItem(LAST_USER_KEY, JSON.stringify(user))
  } catch {
    /* stockage indisponible */
  }
}

function clearLastUser(): void {
  try {
    window.localStorage.removeItem(LAST_USER_KEY)
  } catch {
    /* stockage indisponible */
  }
}

async function clearLocalUserData(): Promise<void> {
  clearLastUser()
  await clearPersistedCache()
  await idbClear("outbox")
  queryClient.clear()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<UserPublic | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<PendingAuthMode | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const response = await api.auth.me()
      writeLastUser(response.user)
      setUser(response.user)
      setStatus("authenticated")
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        clearLastUser()
        setUser(null)
        setStatus("anonymous")
        return
      }
      // Réseau coupé ou serveur indisponible : on restaure le dernier profil
      // connu pour laisser accès au cache hors-ligne. Au retour en ligne, /me
      // tranche définitivement (session valide ou déconnexion).
      const cached = readLastUser()
      if (cached) {
        setUser(cached)
        setStatus("authenticated")
      } else {
        setStatus("anonymous")
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [refresh])

  useEffect(() => {
    const onUnauthorized = () => {
      clearLastUser()
      setUser(null)
      setStatus("anonymous")
      void clearLocalUserData()
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true)
    setError(null)
    try {
      await clearLocalUserData()
      const response = await api.auth.login({ email, password })
      setPendingMode("login")
      setPendingEmail(response.emailMasked)
      setDevCode(response.devCode ?? null)
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Connexion impossible, réessaie.",
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  const verifyOtp = useCallback(async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      const response = await api.auth.verifyOtp(code)
      writeLastUser(response.user)
      setUser(response.user)
      setStatus("authenticated")
      setPendingEmail(null)
      setPendingMode(null)
      setDevCode(null)
      await queryClient.invalidateQueries()
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Code invalide, réessaie.",
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  const resendOtp = useCallback(async () => {
    setError(null)
    try {
      const response = await api.auth.resendOtp()
      setDevCode(response.devCode ?? null)
      return response.retryAfterSeconds
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "otp_cooldown") {
        return 30
      }
      setError(
        cause instanceof ApiClientError ? cause.message : "Renvoi impossible.",
      )
      throw cause
    }
  }, [])

  const registerRequest = useCallback(async (input: RegisterRequestInput) => {
    setBusy(true)
    setError(null)
    try {
      await clearLocalUserData()
      const response = await api.auth.registerRequest(input)
      setPendingMode("register")
      setPendingEmail(response.emailMasked)
      setDevCode(response.devCode ?? null)
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Inscription impossible, vérifie ton invitation.",
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  const verifyRegistration = useCallback(async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      const response = await api.auth.verifyRegistration(code)
      writeLastUser(response.user)
      setUser(response.user)
      setStatus("authenticated")
      setPendingEmail(null)
      setPendingMode(null)
      setDevCode(null)
      await queryClient.invalidateQueries()
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Code invalide, réessaie.",
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  const resendRegistration = useCallback(async () => {
    setError(null)
    try {
      const response = await api.auth.resendRegistration()
      setDevCode(response.devCode ?? null)
      return response.retryAfterSeconds
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "otp_cooldown") return 30
      setError(
        cause instanceof ApiClientError ? cause.message : "Renvoi impossible.",
      )
      throw cause
    }
  }, [])

  const cancelOtp = useCallback(() => {
    setPendingEmail(null)
    setPendingMode(null)
    setDevCode(null)
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    setBusy(true)
    try {
      await api.auth.logout()
    } catch {
      // La session est peut-être déjà expirée : on nettoie quand même.
    } finally {
      await clearLocalUserData()
      setUser(null)
      setStatus("anonymous")
      setPendingEmail(null)
      setPendingMode(null)
      setDevCode(null)
      setBusy(false)
    }
  }, [])

  const changePassword = useCallback(async (input: PasswordChangeInput) => {
    setBusy(true)
    setError(null)
    try {
      await api.auth.changePassword(input)
      await clearLocalUserData()
      setUser(null)
      setStatus("anonymous")
      setPendingEmail(null)
      setPendingMode(null)
      setDevCode(null)
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Changement de mot de passe impossible.",
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      pendingEmail,
      pendingMode,
      devCode,
      error,
      busy,
      login,
      verifyOtp,
      resendOtp,
      registerRequest,
      verifyRegistration,
      resendRegistration,
      cancelOtp,
      logout,
      refresh,
      changePassword,
      clearError: () => setError(null),
    }),
    [
      status,
      user,
      pendingEmail,
      pendingMode,
      devCode,
      error,
      busy,
      login,
      verifyOtp,
      resendOtp,
      registerRequest,
      verifyRegistration,
      resendRegistration,
      cancelOtp,
      logout,
      refresh,
      changePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth doit être utilisé dans <AuthProvider>.")
  return context
}
