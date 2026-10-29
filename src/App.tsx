import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/RequireAuth'
import { Accedi } from '@/pages/Accedi'
import { AdminInviti } from '@/pages/AdminInviti'
import { Campo } from '@/pages/Campo'
import { Esperimenti } from '@/pages/Esperimenti'
import { Impostazioni } from '@/pages/Impostazioni'
import { ModificaMisura } from '@/pages/ModificaMisura'
import { NuovoEsperimento } from '@/pages/NuovoEsperimento'
import { Registrati } from '@/pages/Registrati'
import { SchedaPianta } from '@/pages/SchedaPianta'

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
        <Route path="/esperimenti/:espId/impostazioni" element={<Impostazioni />} />
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
