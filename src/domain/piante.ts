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

/** Vero se tutte le etichette sono numeri interi senza segno (gli spazi attorno non contano, come cercando). */
export function etichetteNumeriche(piante: Pianta[]): boolean {
  return piante.every(p => SOLO_CIFRE.test(p.etichetta.trim()))
}

/** Il massimo tra le etichette numeriche più uno (1 se non ce ne sono). */
export function prossimaEtichetta(piante: Pianta[]): number {
  const numeri = piante.map(p => p.etichetta.trim()).filter(e => SOLO_CIFRE.test(e)).map(Number)
  return numeri.length === 0 ? 1 : Math.max(...numeri) + 1
}

/**
 * Le piante il cui `ordine` cambia quando si riordina l'elenco: `idInOrdine` è l'elenco completo degli id nel nuovo
 * ordine. Il nuovo ordine riusa gli `ordine` che le piante hanno già (dal più piccolo al più grande), così un
 * riordino non inventa numeri e, con buchi lasciati da piante rimosse, non li sposta. Restano fuori le piante che
 * mantengono il loro `ordine`. Con un elenco che non è esattamente quello delle piante (mancano o avanzano id) non si
 * cambia niente: scrivere un ordine a metà confonderebbe il giro.
 */
export function riordinaPiante(piante: Pianta[], idInOrdine: string[]): Pianta[] {
  const perId = new Map(piante.map(p => [p.id, p]))
  if (idInOrdine.length !== piante.length || new Set(idInOrdine).size !== piante.length || idInOrdine.some(id => !perId.has(id))) return []
  const ordini = piante.map(p => p.ordine).sort((a, b) => a - b)
  return idInOrdine.flatMap((id, i) => {
    const p = perId.get(id)!
    return p.ordine === ordini[i] ? [] : [{ ...p, ordine: ordini[i] }]
  })
}
