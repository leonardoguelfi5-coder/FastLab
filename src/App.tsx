import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { RequireAuth } from '@/components/RequireAuth'
import { Accedi } from '@/pages/Accedi'
import { AdminInviti } from '@/pages/AdminInviti'
import { Campo } from '@/pages/Campo'
import { Esperimenti } from '@/pages/Esperimenti'
import { ModificaMisura } from '@/pages/ModificaMisura'
import { NuovoEsperimento } from '@/pages/NuovoEsperimento'
import { Registrati } from '@/pages/Registrati'
import { SchedaPianta } from '@/pages/SchedaPianta'

/** Segnaposto delle pagine non ancora scritte: già dentro il guscio, così il menu funziona. */
function InCostruzione({ titolo, indietro }: { titolo: string; indietro?: string }) {
  return (
    <AppShell titolo={titolo} indietro={indietro}>
      <p>In costruzione</p>
    </AppShell>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/accedi" element={<Accedi />} />
      <Route path="/registrati" element={<Registrati />} />

      <Route element={<RequireAuth><Outlet /></RequireAuth>}>
        <Route path="/" element={<Esperimenti />} />
        <Route path="/esperimenti/nuovo" element={<NuovoEsperimento />} />
        <Route path="/esperimenti/:espId" element={<Campo />} />
        <Route path="/esperimenti/:espId/piante/:piantaId" element={<SchedaPianta />} />
        <Route path="/esperimenti/:espId/misure/:misuraId" element={<ModificaMisura />} />
        <Route path="/esperimenti/:espId/impostazioni" element={<InCostruzione titolo="Impostazioni" indietro="/" />} />
        <Route path="/admin/inviti" element={<AdminInviti />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
