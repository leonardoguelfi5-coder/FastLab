import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/atkinson-hyperlegible-next/index.css'
import '@fontsource-variable/atkinson-hyperlegible-mono/index.css'
import './index.css'
import App from './App.tsx'
import { svuotaCacheAlCambioUtente } from '@/api/auth'
import { creaQueryClient } from '@/api/query'
import { pulisciBozzeVecchie, spostaBozzeDallaSessione } from '@/components/scheda/bozza'
import { avviaInvioAutomatico } from '@/lib/coda/invio'
import { Toaster } from '@/components/ui/sonner'

const queryClient = creaQueryClient()
// Prima di sapere chi c'è: l'invio della coda delle misure parte appena la sessione salvata dice l'utente (Piano E,
// Task E6), poi al ritorno della rete, quando l'app torna visibile e dopo l'attesa di un errore.
avviaInvioAutomatico(queryClient)
svuotaCacheAlCambioUtente(queryClient)
// Le bozze stanno nel localStorage (Piano E, Task E5): prima si portano lì quelle lasciate nel sessionStorage dalla
// versione di prima, poi si tolgono quelle non toccate da 14 giorni.
spostaBozzeDallaSessione()
pulisciBozzeVecchie(Date.now())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
