import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { opzioniMisureGiorno, opzioniMisurePianta, opzioniRuolo } from '@/api/query'
import type { ConfigEsperimento } from '@/domain/tipi'

/**
 * La lettura in anticipo del giro (Piano E, Task E7, correzione): con la rete, aprendo la home di un esperimento o la
 * scelta dello strumento, si leggono le misure del giorno di rilievo e quelle di ogni pianta. Finiscono nella cache e
 * quindi nella copia sul telefono (`cachePersistente.ts`: sono due chiavi del suo elenco chiuso, con il suo limite di
 * 2 MB), così più tardi, in serra senza rete, la misura sequenziale funziona anche sulle piante mai aperte.
 * - Una pianta per richiesta, al massimo 4 insieme; ci si ferma se la rete cade.
 * - Le piante di un esperimento si rileggono al massimo ogni 30 minuti, e una lettura più giovane di 30 minuti non si
 *   ripete.
 * - Oltre 300 piante solo le prime 300 nell'ordine del giro: tutte insieme non starebbero comunque nei 2 MB della
 *   copia, e sarebbero troppe richieste a ogni apertura.
 * - Anche il ruolo (Piano E, Task E10): senza rete e senza copia l'interfaccia non conosce il ruolo e non nasconde
 *   "Nuova misura" (la guardia vera è il database); letto in anticipo finisce nella copia sul telefono, dove il
 *   lettore resta lettore. Si rilegge con la stessa finestra delle piante.
 * - Un fallimento non si mostra: è solo un anticipo, la pagina che serve rilegge da sé.
 */

export const FINESTRA_ANTICIPO_MS = 30 * 60 * 1000
export const CONCORRENZA_ANTICIPO = 4
export const MASSIMO_PIANTE_ANTICIPO = 300

/** Quando sono state lette in anticipo le piante di ogni esperimento, in questa sessione dell'app. */
const ultimaLettura = new Map<string, number>()

const conRete = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false

/** Dimentica le letture fatte (per i test). */
export function dimenticaLettureInAnticipo(): void {
  ultimaLettura.clear()
}

/** Legge in anticipo misure del giorno `data` e misure delle piante di `config`. Non lancia mai. */
export async function leggiInAnticipo(queryClient: QueryClient, espId: string, config: ConfigEsperimento, data: string): Promise<void> {
  if (!conRete()) return
  const giorno = queryClient.prefetchQuery({ ...opzioniMisureGiorno(espId, data), staleTime: FINESTRA_ANTICIPO_MS })
  const ruolo = queryClient.prefetchQuery({ ...opzioniRuolo(espId), staleTime: FINESTRA_ANTICIPO_MS })

  const adesso = Date.now()
  const prima = ultimaLettura.get(espId)
  if (prima !== undefined && adesso - prima < FINESTRA_ANTICIPO_MS) {
    await Promise.all([giorno, ruolo])
    return
  }
  ultimaLettura.set(espId, adesso)

  const piante = [...config.piante].sort((a, b) => a.ordine - b.ordine).slice(0, MASSIMO_PIANTE_ANTICIPO)
  let prossima = 0
  // Ognuno dei 4 prende la pianta seguente finché ce ne sono e c'è rete. `prefetchQuery` non lancia mai.
  const lettore = async () => {
    while (prossima < piante.length && conRete()) {
      const pianta = piante[prossima++]
      await queryClient.prefetchQuery({ ...opzioniMisurePianta(pianta.id), staleTime: FINESTRA_ANTICIPO_MS })
    }
  }
  await Promise.all([giorno, ruolo, ...Array.from({ length: CONCORRENZA_ANTICIPO }, lettore)])
}

/**
 * Legge in anticipo il giro di un esperimento quando la configurazione c'è, e di nuovo al ritorno della rete (la
 * finestra di 30 minuti evita le ripetizioni). Per la home dell'esperimento e la scelta dello strumento.
 */
export function useLetturaInAnticipo(espId: string, config: ConfigEsperimento | undefined, data: string): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!config) return
    const leggi = () => { void leggiInAnticipo(queryClient, espId, config, data) }
    leggi()
    window.addEventListener('online', leggi)
    return () => window.removeEventListener('online', leggi)
  }, [queryClient, espId, config, data])
}
