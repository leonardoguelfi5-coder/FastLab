import type { BozzaEsperimento, Fattore, Pianta, Trattamento } from '@/domain/tipi'
import { generaTrattamenti } from '@/domain/trattamenti'
import { leggiIntero } from '@/lib/numeri'

/**
 * Una riga della tabella dei trattamenti nel passo "Fattori e piante": una combinazione di
 * livelli, inclusa o no nell'esperimento, con il numero di piante come lo ha scritto l'utente.
 * Nella bozza finiscono solo le righe incluse (vedi `trattamentiInclusi`).
 */
export interface RigaTrattamento {
  trattamento: Trattamento
  incluso: boolean
  /** "N piante" così come è scritto nel campo (può essere non valido). */
  n: string
}

/** Piante al massimo per trattamento: un argine contro gli errori di battitura (es. 1000 invece di 10). */
export const MAX_PIANTE = 500
export const N_INIZIALE = '1'

export const MOTIVO_FATTORI_CAMBIATI = 'I fattori sono cambiati: premi «Genera trattamenti» per aggiornare la tabella.'
export const MOTIVO_PIANTE_DA_RIGENERARE =
  'La tabella dei trattamenti è cambiata: premi «Genera piante» per aggiornare l\'elenco.'

const chiave = (livelloIds: string[]) => livelloIds.join('|')

/** Il numero di piante della riga, o `null` se non è un intero da 1 a MAX_PIANTE. */
export function nPiante(riga: RigaTrattamento): number | null {
  return leggiIntero(riga.n, 1, MAX_PIANTE)
}

function contaPerTrattamento(piante: Pianta[]): Map<string, number> {
  const conteggi = new Map<string, number>()
  for (const p of piante) conteggi.set(p.trattamento_id, (conteggi.get(p.trattamento_id) ?? 0) + 1)
  return conteggi
}

/**
 * La tabella di una bozza già pronta (modello o copia): tutte le combinazioni dei fattori;
 * quelle che hanno un trattamento sono incluse, con N uguale alle sue piante, le altre escluse.
 * I trattamenti che non corrispondono a nessuna combinazione restano in fondo, inclusi.
 * Senza trattamenti la tabella è vuota: va ancora generata.
 */
export function righeDaBozza(b: BozzaEsperimento): RigaTrattamento[] {
  if (b.trattamenti.length === 0) return []
  const conteggi = contaPerTrattamento(b.piante)
  const daTrattamento = (t: Trattamento): RigaTrattamento => ({ trattamento: t, incluso: true, n: String(conteggi.get(t.id) ?? 0) })
  const esistenti = new Map(b.trattamenti.map(t => [chiave(t.livello_ids), t]))

  const righe = generaTrattamenti(b.fattori).map(g => {
    const t = esistenti.get(chiave(g.livello_ids))
    return t ? daTrattamento(t) : { trattamento: g, incluso: false, n: N_INIZIALE }
  })
  const usati = new Set(righe.map(r => r.trattamento.id))
  return [...righe, ...b.trattamenti.filter(t => !usati.has(t.id)).map(daTrattamento)]
}

/**
 * "Genera trattamenti": una riga per ogni combinazione dei fattori. Le combinazioni già in tabella
 * restano come sono (etichetta, inclusione, N); quelle nuove entrano incluse, quelle sparite escono.
 */
export function rigeneraRighe(righe: RigaTrattamento[], fattori: Fattore[]): RigaTrattamento[] {
  const vecchie = new Map(righe.map(r => [chiave(r.trattamento.livello_ids), r]))
  return generaTrattamenti(fattori).map(g => vecchie.get(chiave(g.livello_ids)) ?? { trattamento: g, incluso: true, n: N_INIZIALE })
}

/** Vero se la tabella ha esattamente una riga per ogni combinazione dei fattori attuali. */
export function righeAggiornate(righe: RigaTrattamento[], fattori: Fattore[]): boolean {
  const attese = new Set(generaTrattamenti(fattori).map(t => chiave(t.livello_ids)))
  const presenti = new Set(righe.map(r => chiave(r.trattamento.livello_ids)))
  return attese.size === righe.length && presenti.size === righe.length && [...attese].every(k => presenti.has(k))
}

/** Vero se ogni pianta appartiene a un trattamento incluso e ogni trattamento incluso ha N piante. */
export function pianteAggiornate(righe: RigaTrattamento[], piante: Pianta[]): boolean {
  const inclusi = righe.filter(r => r.incluso)
  const ids = new Set(inclusi.map(r => r.trattamento.id))
  if (piante.some(p => !ids.has(p.trattamento_id))) return false
  const conteggi = contaPerTrattamento(piante)
  return inclusi.every(r => nPiante(r) === (conteggi.get(r.trattamento.id) ?? 0))
}

/** I trattamenti della bozza: le righe incluse, con l'ordine della tabella. */
export function trattamentiInclusi(righe: RigaTrattamento[]): Trattamento[] {
  return righe.filter(r => r.incluso).map((r, ordine) => ({ ...r.trattamento, ordine }))
}

/**
 * Perché non si può lasciare il passo "Fattori e piante" (null se si può): trattamenti o piante
 * che non corrispondono più ai fattori o alla tabella finirebbero nel database con riferimenti rotti.
 */
export function motivoBlocco(b: BozzaEsperimento, righe: RigaTrattamento[]): string | null {
  if (righe.length > 0 && !righeAggiornate(righe, b.fattori)) return MOTIVO_FATTORI_CAMBIATI
  if (b.piante.length > 0 && !pianteAggiornate(righe, b.piante)) return MOTIVO_PIANTE_DA_RIGENERARE
  return null
}
