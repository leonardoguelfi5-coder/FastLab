import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/RequireAuth'
import { Accedi } from '@/pages/Accedi'
import { AdminInviti } from '@/pages/AdminInviti'
import { Catalogo } from '@/pages/Catalogo'
import { Dataset } from '@/pages/Dataset'
import { Diario } from '@/pages/Diario'
import { ElencoPiante } from '@/pages/ElencoPiante'
import { Esperimenti } from '@/pages/Esperimenti'
import { Esporta } from '@/pages/Esporta'
import { FineGiro } from '@/pages/FineGiro'
import { Foto } from '@/pages/Foto'
import { Altro } from '@/pages/Altro'
import { Laboratorio } from '@/pages/Laboratorio'
import { EditorAnalisi } from '@/pages/pesatura/EditorAnalisi'
import { Pesatura } from '@/pages/pesatura/Pesatura'
import { HomeEsperimento } from '@/pages/HomeEsperimento'
import { Impostazioni } from '@/pages/impostazioni/IndiceImpostazioni'
import { ImpostazioniSezione } from '@/pages/impostazioni/PaginaSezione'
import { MisuraPianta } from '@/pages/MisuraPianta'
import { ModificaMisura } from '@/pages/ModificaMisura'
import { NuovoEsperimento } from '@/pages/NuovoEsperimento'
import { Oggi } from '@/pages/Oggi'
import { Registrati } from '@/pages/Registrati'
import { SceltaStrumento } from '@/pages/SceltaStrumento'
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
        <Route path="/esperimenti/:espId/misura" element={<SceltaStrumento />} />
        {/* "fine" è un segmento fisso: vince sempre su `:piantaId` (e gli id delle piante sono uuid). */}
        <Route path="/esperimenti/:espId/misura/:strumentoId/fine" element={<FineGiro />} />
        <Route path="/esperimenti/:espId/misura/:strumentoId/:piantaId" element={<MisuraPianta />} />
        <Route path="/esperimenti/:espId/piante" element={<ElencoPiante />} />
        <Route path="/esperimenti/:espId/piante/:piantaId" element={<SchedaPianta />} />
        <Route path="/esperimenti/:espId/misure/:misuraId" element={<ModificaMisura />} />
        <Route path="/esperimenti/:espId/impostazioni" element={<Impostazioni />} />
        <Route path="/esperimenti/:espId/impostazioni/:sezione" element={<ImpostazioniSezione />} />
        <Route path="/esperimenti/:espId/oggi" element={<Oggi />} />
        <Route path="/esperimenti/:espId/dataset" element={<Dataset />} />
        <Route path="/esperimenti/:espId/esporta" element={<Esporta />} />
        <Route path="/esperimenti/:espId/diario" element={<Diario />} />
        <Route path="/esperimenti/:espId/foto" element={<Foto />} />
        <Route path="/esperimenti/:espId/altro" element={<Altro />} />
        <Route path="/esperimenti/:espId/laboratorio" element={<Laboratorio />} />
        <Route path="/esperimenti/:espId/laboratorio/pesatura" element={<Pesatura />} />
        {/* "analisi" è un segmento fisso: va dichiarato prima di `:sessioneId` (le altre pagine della Pesatura) e vince su di esso. */}
        <Route path="/esperimenti/:espId/laboratorio/pesatura/analisi" element={<EditorAnalisi />} />
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
