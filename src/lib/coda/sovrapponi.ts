import type { Misura } from '@/domain/tipi'
import type { VoceCoda } from './codaMisure'

/**
 * Le misure lette dal server con sopra quelle ancora in coda (Piano E, Task E6): una misura in coda si vede come
 * salvata in tutta l'app, così una rilettura del server (che ancora non l'ha) non la fa sparire né rende "da fare" una
 * pianta appena misurata.
 * - Stesso id: vince la coda (è la versione più recente: una correzione non ancora partita).
 * - Una voce che non passa il filtro toglie la sua misura dall'elenco (una correzione che sposta la misura a un altro
 *   giorno); quelle che lo passano e mancano si aggiungono.
 * - Con `ordine` l'elenco si riordina (stabile: le misure del server tengono il loro ordine fra pari).
 * Le voci arrivano già scelte per esperimento da chi chiama. Senza voci che toccano l'elenco restituisce lo stesso array.
 */
export function conCoda(
  misure: Misura[], voci: readonly VoceCoda[], filtro: (m: Misura) => boolean, ordine?: (a: Misura, b: Misura) => number,
): Misura[] {
  const inCoda = new Map(voci.map(v => [v.misura.id, v.misura]))
  const toccate = misure.some(m => inCoda.has(m.id))
  const aggiunte = [...inCoda.values()].filter(filtro)
  if (!toccate && aggiunte.length === 0) return misure
  const risultato = [...misure.filter(m => !inCoda.has(m.id)), ...aggiunte]
  return ordine ? risultato.sort(ordine) : risultato
}

const confronta = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** L'ordine delle misure di un giorno (`misureDelGiorno`): dalla più vecchia. */
export const perOraCrescente = (a: Misura, b: Misura): number => confronta(a.ora, b.ora)

/** L'ordine delle misure di una pianta (`misurePianta`): dalla più recente, per data e ora. */
export const piuRecentiPrima = (a: Misura, b: Misura): number =>
  confronta(b.data_rilievo, a.data_rilievo) || confronta(b.ora, a.ora)
