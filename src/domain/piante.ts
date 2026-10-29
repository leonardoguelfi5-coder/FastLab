import { nuovoId } from '@/lib/id'
import type { Pianta } from './tipi'

const SOLO_CIFRE = /^\d+$/

/** Crea `n` piante per ogni riga, con etichette numeriche in sequenza a partire da `inizio`. */
export function generaPiante(righe: { trattamento_id: string; n: number }[], inizio = 1): Pianta[] {
  const piante: Pianta[] = []
  for (const { trattamento_id, n } of righe) {
    for (let k = 0; k < n; k++) {
      const i = piante.length
      piante.push({
        id: nuovoId(),
        trattamento_id,
        etichetta: String(inizio + i),
        blocco: null,
        ordine: i,
      })
    }
  }
  return piante
}

const normalizza = (s: string) => s.trim().toLowerCase()

/**
 * Cerca una pianta dall'etichetta digitata: confronto esatto senza spazi ai bordi e senza
 * distinzione tra maiuscole e minuscole. Se non c'è nessuna corrispondenza e l'input è
 * numerico, confronta il valore numerico con le etichette numeriche ("035" trova "35").
 */
export function trovaPianta(piante: Pianta[], input: string): Pianta | null {
  const cercata = normalizza(input)
  if (cercata === '') return null
  const esatta = piante.find(p => normalizza(p.etichetta) === cercata)
  if (esatta) return esatta
  if (!SOLO_CIFRE.test(cercata)) return null
  const valore = Number(cercata)
  return piante.find(p => SOLO_CIFRE.test(p.etichetta.trim()) && Number(p.etichetta.trim()) === valore) ?? null
}

/** La pianta che segue `piantaId` secondo `ordine`, oppure null se è l'ultima (o non esiste). */
export function piantaSuccessiva(piante: Pianta[], piantaId: string): Pianta | null {
  const ordinate = [...piante].sort((a, b) => a.ordine - b.ordine)
  const i = ordinate.findIndex(p => p.id === piantaId)
  return i === -1 ? null : (ordinate[i + 1] ?? null)
}

/** Vero se tutte le etichette sono numeri interi senza segno (gli spazi attorno non contano, come cercando). */
export function etichetteNumeriche(piante: Pianta[]): boolean {
  return piante.every(p => SOLO_CIFRE.test(p.etichetta.trim()))
}

/** Il massimo tra le etichette numeriche più uno (1 se non ce ne sono). */
export function prossimaEtichetta(piante: Pianta[]): number {
  const numeri = piante.map(p => p.etichetta.trim()).filter(e => SOLO_CIFRE.test(e)).map(Number)
  return numeri.length === 0 ? 1 : Math.max(...numeri) + 1
}
