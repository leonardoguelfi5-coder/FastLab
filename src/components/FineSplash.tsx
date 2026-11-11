import { useEffect } from 'react'
import { chiudiSplash } from '@/lib/splash'

/** Chiude la schermata d'avvio dopo il primo disegno dell'app (l'effetto parte quando React ha già scritto la pagina). */
export function FineSplash() {
  useEffect(() => {
    chiudiSplash()
  }, [])
  return null
}
