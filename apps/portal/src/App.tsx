import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { NotifyProvider } from "@/aura/notify/react"
import { Skeleton, ThemeProvider } from "@/aura/react"
import { AuthProvider, useAuth } from "@/auth/AuthProvider"
import { AuthScreen } from "@/auth/AuthScreen"
import { AppShell } from "@/components/AppShell"
import { AmenagementScreen } from "@/screens/AmenagementScreen"
import { persistOptions, queryClient } from "@/lib/query-client"
import { BudgetScreen } from "@/screens/BudgetScreen"
import { ChantierScreen } from "@/screens/ChantierScreen"
import { PiazzaScreen } from "@/screens/PiazzaScreen"
import { PlanningScreen } from "@/screens/PlanningScreen"
import { ViewerScreen } from "@/screens/ViewerScreen"

function Splash() {
  return (
    <div className="aura-app">
      <div className="aura-frame">
        <main className="app-auth">
          <div className="app-auth__shell aura-stack">
            <Skeleton height={120} />
            <Skeleton height={44} />
            <Skeleton height={44} />
            <p className="aura-hint" style={{ textAlign: "center" }}>
              Ouverture du carnet…
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

function Gate() {
  const { status } = useAuth()
  if (status === "loading") return <Splash />
  if (status === "anonymous") return <AuthScreen />

  return (
    <Routes>
      <Route path="amenagement" element={<AmenagementScreen />} />
      <Route element={<AppShell />}>
        <Route index element={<PiazzaScreen />} />
        <Route path="3d" element={<ViewerScreen />} />
        <Route path="planning" element={<PlanningScreen />} />
        <Route path="chantier" element={<ChantierScreen />} />
        <Route path="budget" element={<BudgetScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system" defaultAccent="terracotta" storageKey="casarenous">
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <NotifyProvider appName="CasaRenous" style="auto">
          <AuthProvider>
            <BrowserRouter>
              <Gate />
            </BrowserRouter>
          </AuthProvider>
        </NotifyProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  )
}
