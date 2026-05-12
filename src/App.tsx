import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ListaRilevazioni } from './pages/ListaRilevazioni'
import { NuovaRilevazione } from './pages/NuovaRilevazione'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ListaRilevazioni />} />
        <Route path="/nuova" element={<NuovaRilevazione />} />
      </Routes>
    </BrowserRouter>
  )
}
