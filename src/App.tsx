import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ListaRilevazioni } from './pages/ListaRilevazioni'
import { NuovaRilevazione } from './pages/NuovaRilevazione'
import { SceltaMisurazione } from './pages/SceltaMisurazione'
import { PassoPianta } from './pages/PassoPianta'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ListaRilevazioni />} />
        <Route path="/scegli" element={<SceltaMisurazione />} />
        <Route path="/passo/:tipo" element={<PassoPianta />} />
        <Route path="/nuova" element={<NuovaRilevazione />} />
        <Route path="/modifica/:id" element={<NuovaRilevazione />} />
      </Routes>
    </BrowserRouter>
  )
}
