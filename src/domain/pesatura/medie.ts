import type { Pianta } from '../tipi'
import { rwc, sostanzaSecca } from './calcoli'
import { repliche } from './sequenza'
import type { CampionePesatura, Peso, SessionePesatura } from './tipi'

/** La media di un trattamento: `n` sono le piante che hanno il valore. */
export interface MediaTrattamento {
  trattamentoId: string
  media: number
  n: number
}

/** Il valore calcolato di una replica (RWC o % di sostanza secca); `null` se mancano dei pesi. */
function valoreReplica(s: SessionePesatura, pesi: Peso[], campioneId: string, replica: number): number | null {
  const peso = (tipo: Peso['tipo']) => pesi.find(p => p.campione_id === campioneId && p.replica === replica && p.tipo === tipo)?.valore
  const fresco = peso('fresco')
  const secco = peso('secco')
  if (s.tipo === 'rwc') {
    const turgido = peso('turgido')
    return fresco !== undefined && turgido !== undefined && secco !== undefined ? rwc(fresco, turgido, secco) : null
  }
  return fresco !== undefined && secco !== undefined ? sostanzaSecca(fresco, secco) : null
}

/**
 * La media per trattamento dell'RWC o della % di sostanza secca. Ogni pianta conta una volta: prima si fa la media
 * delle sue repliche, poi quella delle piante del trattamento. Le righe libere (non sono piante) non entrano. I
 * trattamenti seguono l'ordine dei campioni; quelli senza nessun valore non compaiono. Per gli altri tipi: vuoto.
 */
export function mediePerTrattamento(
  s: SessionePesatura, campioni: CampionePesatura[], pesi: Peso[], piante: ReadonlyMap<string, Pianta>,
): MediaTrattamento[] {
  if (s.tipo !== 'rwc' && s.tipo !== 'sostanza_secca') return []
  const perTrattamento = new Map<string, number[]>()
  for (const c of [...campioni].sort((a, b) => a.ordine - b.ordine)) {
    const pianta = c.pianta_id ? piante.get(c.pianta_id) : undefined
    if (!pianta) continue
    const valori = repliche(c, s, pesi).map(r => valoreReplica(s, pesi, c.id, r)).filter((v): v is number => v !== null)
    if (!perTrattamento.has(pianta.trattamento_id)) perTrattamento.set(pianta.trattamento_id, [])
    if (valori.length > 0) perTrattamento.get(pianta.trattamento_id)!.push(valori.reduce((a, b) => a + b, 0) / valori.length)
  }
  return [...perTrattamento]
    .filter(([, medie]) => medie.length > 0)
    .map(([trattamentoId, medie]) => ({ trattamentoId, media: medie.reduce((a, b) => a + b, 0) / medie.length, n: medie.length }))
}
