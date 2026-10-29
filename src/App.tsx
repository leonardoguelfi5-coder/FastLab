import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/RequireAuth'
import { Accedi } from '@/pages/Accedi'
import { AdminInviti } from '@/pages/AdminInviti'
import { Campo } from '@/pages/Campo'
import { Catalogo } from '@/pages/Catalogo'
import { ElencoPiante } from '@/pages/ElencoPiante'
import { Esperimenti } from '@/pages/Esperimenti'
import { HomeEsperimento } from '@/pages/HomeEsperimento'
import { Impostazioni } from '@/pages/Impostazioni'
import { InArrivo } from '@/pages/InArrivo'
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
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/esperimenti/nuovo" element={<NuovoEsperimento />} />
        <Route path="/esperimenti/:espId" element={<HomeEsperimento />} />
        {/* Per ora la vecchia schermata di campo: il Task 11 la sostituisce con la scelta dello strumento. */}
        <Route path="/esperimenti/:espId/misura" element={<Campo />} />
        <Route path="/esperimenti/:espId/piante" element={<ElencoPiante />} />
        <Route path="/esperimenti/:espId/piante/:piantaId" element={<SchedaPianta />} />
        <Route path="/esperimenti/:espId/misure/:misuraId" element={<ModificaMisura />} />
        <Route path="/esperimenti/:espId/impostazioni" element={<Impostazioni />} />
        <Route path="/esperimenti/:espId/oggi" element={<InArrivo titolo="Oggi" />} />
        <Route path="/esperimenti/:espId/dataset" element={<InArrivo titolo="Dataset" />} />
        <Route path="/esperimenti/:espId/esporta" element={<InArrivo titolo="Esporta Excel" />} />
        <Route path="/esperimenti/:espId/diario" element={<InArrivo titolo="Diario" />} />
        <Route path="/esperimenti/:espId/foto" element={<InArrivo titolo="Foto" />} />
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
