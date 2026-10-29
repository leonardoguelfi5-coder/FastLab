import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { oggiLocale } from './date'

/** Dopo la mezzanotte si aspetta un attimo in più: un timer che scatta qualche millisecondo prima la rimanderebbe. */
const MARGINE_MS = 50

/** Millisecondi alla prossima mezzanotte locale (il costruttore di Date gestisce l'ora legale). */
function allaMezzanotte(adesso: Date): number {
  const domani = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + 1)
  return domani.getTime() - adesso.getTime() + MARGINE_MS
}

/**
 * La data di oggi (AAAA-MM-GG, ora locale) che si aggiorna da sola. Un'app lasciata aperta in serra, o ripresa dallo
 * sfondo del telefono, non deve restare sul giorno prima: il componente si ridisegna alla mezzanotte locale
 * (il timer riparte da solo), quando la pagina torna visibile e quando la finestra riprende il focus.
 * Servono tutti e tre: un timer fermo in background può scattare in ritardo o non scattare affatto.
 *
 * `alCambio` si chiama quando il giorno cambia, prima di ridisegnare e nello stesso evento: chi deve reagire
 * (la scheda pianta che tiene il giorno di un modulo non salvato) lo fa senza un disegno intermedio con il giorno nuovo.
 */
export function useOggi(alCambio?: (prima: string, dopo: string) => void): string {
  const [oggi, setOggi] = useState(() => oggiLocale())
  // Il giorno già dato al componente: si confronta nell'evento, non aspettando il disegno.
  const visto = useRef(oggi)
  const avvisa = useRef(alCambio)
  useLayoutEffect(() => { avvisa.current = alCambio })

  useEffect(() => {
    const aggiorna = () => {
      const adesso = oggiLocale()
      // Con lo stesso giorno non si fa nulla: richiamarla di continuo non costa nulla.
      if (adesso === visto.current) return
      const prima = visto.current
      visto.current = adesso
      avvisa.current?.(prima, adesso)
      setOggi(adesso)
    }
    const alRitorno = () => {
      if (document.visibilityState === 'visible') aggiorna()
    }

    let timer: ReturnType<typeof setTimeout>
    const armaTimer = () => {
      timer = setTimeout(() => {
        aggiorna()
        armaTimer()
      }, allaMezzanotte(new Date()))
    }

    armaTimer()
    document.addEventListener('visibilitychange', alRitorno)
    window.addEventListener('focus', aggiorna)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', alRitorno)
      window.removeEventListener('focus', aggiorna)
    }
  }, [])

  return oggi
}
