/** La sequenza delle fasi di pesata e la completezza di una sessione. Funzioni pure, senza React. */
import type { Pianta } from '../tipi'
import type { CampionePesatura, Peso, SessionePesatura, TipoAnalisi, TipoPeso } from './tipi'

export type FasePesata = TipoPeso

export const FASI: Record<TipoAnalisi, FasePesata[]> = {
  aliquota: ['aliquota'],
  rwc: ['fresco', 'turgido', 'secco'],
  sostanza_secca: ['fresco', 'secco'],
  vasi: ['secco', 'capacita_campo', 'asciugatura'],
}

export const NOMI_FASE: Record<FasePesata, string> = {
  aliquota: 'Aliquota',
  fresco: 'Fresco',
  turgido: 'Turgido',
  secco: 'Secco',
  capacita_campo: 'Capacità di campo',
  asciugatura: 'Asciugatura',
}

export interface Passo { campione: CampionePesatura; replica: number; peso: Peso | null }

/** Replica 1 = A, 2 = B, ... */
export function letteraReplica(n: number): string {
  return String.fromCharCode(64 + n)
}

/** Una pianta si chiama `P` + etichetta; una riga libera usa il suo nome. */
export function etichettaCampione(c: CampionePesatura, piante: ReadonlyMap<string, Pianta>): string {
  const p = c.pianta_id ? piante.get(c.pianta_id) : undefined
  if (p) return `P${p.etichetta}`
  return c.nome ?? ''
}

/** Da 1 fino al più grande tra le repliche delle impostazioni e quella più alta già pesata. I vasi ne hanno una sola. */
export function repliche(campione: CampionePesatura, s: SessionePesatura, pesi: Peso[]): number[] {
  if (s.tipo === 'vasi') return [1]
  let max = Math.max(1, s.impostazioni.repliche)
  for (const p of pesi) if (p.campione_id === campione.id && p.replica > max) max = p.replica
  return Array.from({ length: max }, (_, i) => i + 1)
}

export function passiDellaFase(s: SessionePesatura, campioni: CampionePesatura[], pesi: Peso[], fase: FasePesata): Passo[] {
  const ordinati = [...campioni].sort((a, b) => a.ordine - b.ordine)
  const passi: Passo[] = []
  for (const c of ordinati) {
    if (fase === 'asciugatura') {
      passi.push({ campione: c, replica: 1, peso: null })
      continue
    }
    for (const replica of repliche(c, s, pesi)) {
      const peso = pesi.find(p => p.campione_id === c.id && p.replica === replica && p.tipo === fase) ?? null
      passi.push({ campione: c, replica, peso })
    }
  }
  return passi
}

/** L'indice del primo passo senza peso; `passi.length` se sono tutti pesati. */
export function primoPassoMancante(passi: Passo[]): number {
  const i = passi.findIndex(p => p.peso === null)
  return i === -1 ? passi.length : i
}

export interface Avanzamento { pesati: number; totali: number }

export function avanzamentoFase(passi: Passo[]): Avanzamento {
  return { pesati: passi.filter(p => p.peso !== null).length, totali: passi.length }
}

export function statoSessione(s: SessionePesatura, campioni: CampionePesatura[], pesi: Peso[]): 'conclusa' | 'completa' | 'mancano' {
  if (s.conclusa) return 'conclusa'
  if (campioni.length === 0) return 'mancano'
  for (const fase of FASI[s.tipo]) {
    if (fase === 'asciugatura') continue
    if (passiDellaFase(s, campioni, pesi, fase).some(p => p.peso === null)) return 'mancano'
  }
  if (s.tipo === 'vasi') {
    for (const c of campioni) {
      if (!pesi.some(p => p.campione_id === c.id && p.tipo === 'asciugatura')) return 'mancano'
    }
  }
  return 'completa'
}
