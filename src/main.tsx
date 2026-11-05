import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/atkinson-hyperlegible-next/index.css'
import '@fontsource-variable/atkinson-hyperlegible-mono/index.css'
import './index.css'
import App from './App.tsx'
import { sessioneSalvata, svuotaCacheAlCambioUtente } from '@/api/auth'
import { creaQueryClient } from '@/api/query'
import { pulisciBozzeVecchie, spostaBozzeDallaSessione } from '@/components/scheda/bozza'
import { ascoltaErroriDiCaricamento, avviaAggiornamento } from '@/lib/aggiornamento'
import { avviaCachePersistente, ripristinaCache } from '@/lib/cachePersistente'
import { utenteCoda } from '@/lib/coda/codaMisure'
import { avviaInvioAutomatico } from '@/lib/coda/invio'
import { Toaster } from '@/components/ui/sonner'

const queryClient = creaQueryClient()
// La copia delle letture sul telefono (Piano E, Task E7), prima del primo disegno: senza rete la configurazione e il
// giro si vedono subito. Solo se è dell'utente della sessione salvata e di questa versione dell'app.
const utenteSalvato = sessioneSalvata()?.user.id
if (utenteSalvato) ripristinaCache(queryClient, utenteSalvato, __VERSIONE__, Date.now())
// Prima di sapere chi c'è: l'invio della coda delle misure parte appena la sessione salvata dice l'utente (Piano E,
// Task E6), poi al ritorno della rete, quando l'app torna visibile e dopo l'attesa di un errore.
avviaInvioAutomatico(queryClient)
svuotaCacheAlCambioUtente(queryClient)
// La copia si riscrive per l'utente della sessione (lo stesso della coda): senza nessuno non si scrive.
avviaCachePersistente(queryClient, { utente: utenteCoda, versione: __VERSIONE__ })
// Le bozze stanno nel localStorage (Piano E, Task E5): prima si portano lì quelle lasciate nel sessionStorage dalla
// versione di prima, poi si tolgono quelle non toccate da 14 giorni.
spostaBozzeDallaSessione()
pulisciBozzeVecchie(Date.now())
// Il service worker e l'aggiornamento a richiesta; un pezzo dell'app che non si carica dice di ricaricare.
avviaAggiornamento(registerSW)
ascoltaErroriDiCaricamento()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
