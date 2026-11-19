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

/** Nei vasi ogni peso ha la lettura dello strumento, tranne il secco: la chiedono la capacità di campo e l'asciugatura. */
export function chiedeLettura(tipo: TipoAnalisi, fase: FasePesata): boolean {
  return tipo === 'vasi' && (fase === 'capacita_campo' || fase === 'asciugatura')
}

/** Un peso è completo quando c'è e, se la fase chiede la lettura, ha anche quella (le sessioni vecchie possono non averla). */
export function pesoCompleto(peso: Peso | null, tipo: TipoAnalisi, fase: FasePesata): boolean {
  return peso !== null && (!chiedeLettura(tipo, fase) || peso.lettura !== null)
}

const conPeso = (p: Peso | null): boolean => p !== null

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

/** L'indice del primo passo il cui peso non è completo (di norma: senza peso); `passi.length` se lo sono tutti. */
export function primoPassoMancante(passi: Passo[], completo: (p: Peso | null) => boolean = conPeso): number {
  const i = passi.findIndex(p => !completo(p.peso))
  return i === -1 ? passi.length : i
}

/**
 * Il passo di un campione e di una replica (in asciugatura la replica è sempre 1); `null` se non c'è. Serve per
 * aprire la pesata da una riga del riepilogo.
 */
export function indiceDelPasso(passi: Passo[], campioneId: string, replica: number): number | null {
  const i = passi.findIndex(p => p.campione.id === campioneId && p.replica === replica)
  return i === -1 ? null : i
}

/**
 * La fase da aprire toccando un campione nel riepilogo: la prima in cui a quel campione e a quella replica manca il
 * peso (o la sua lettura, dove serve). Se li ha tutti: per i vasi l'asciugatura (si aggiunge un punto), per gli altri la prima fase (per correggere).
 */
export function faseDaAprire(s: SessionePesatura, campioneId: string, replica: number, pesi: Peso[]): FasePesata {
  const fasi = FASI[s.tipo].filter(f => f !== 'asciugatura')
  const mancante = fasi.find(f => !pesi.some(p => p.campione_id === campioneId && p.replica === replica && p.tipo === f && pesoCompleto(p, s.tipo, f)))
  if (mancante) return mancante
  return s.tipo === 'vasi' ? 'asciugatura' : FASI[s.tipo][0]
}

export interface Avanzamento { pesati: number; totali: number }

export function avanzamentoFase(passi: Passo[], completo: (p: Peso | null) => boolean = conPeso): Avanzamento {
  return { pesati: passi.filter(p => completo(p.peso)).length, totali: passi.length }
}

/**
 * Lo stato di una pesata. "Conclusa" vale solo per i vasi, la cui asciugatura non ha una fine: la segna l'utente. Gli
 * altri tipi sono completi quando hanno tutti i pesi (una pesata vecchia segnata conclusa con dei pesi mancanti torna
 * a dire che mancano).
 */
export function statoSessione(s: SessionePesatura, campioni: CampionePesatura[], pesi: Peso[]): 'conclusa' | 'completa' | 'mancano' {
  if (s.conclusa && s.tipo === 'vasi') return 'conclusa'
  if (campioni.length === 0) return 'mancano'
  for (const fase of FASI[s.tipo]) {
    if (fase === 'asciugatura') continue
    if (passiDellaFase(s, campioni, pesi, fase).some(p => !pesoCompleto(p.peso, s.tipo, fase))) return 'mancano'
  }
  if (s.tipo === 'vasi') {
    for (const c of campioni) {
      if (!pesi.some(p => p.campione_id === c.id && p.tipo === 'asciugatura')) return 'mancano'
    }
  }
  return 'completa'
}

/** Le fasi con un peso per campione (non l'asciugatura), con quanti pesi hanno sul totale. */
export function avanzamentoFasi(s: SessionePesatura, campioni: CampionePesatura[], pesi: Peso[]): (Avanzamento & { fase: FasePesata })[] {
  return FASI[s.tipo].filter(f => f !== 'asciugatura').map(fase => ({ fase, ...avanzamentoFase(passiDellaFase(s, campioni, pesi, fase), p => pesoCompleto(p, s.tipo, fase)) }))
}

/** Una pesata è fra le completate quando ha tutti i pesi; i vasi solo quando l'utente la segna conclusa. */
export function eCompletata(s: SessionePesatura, campioni: CampionePesatura[], pesi: Peso[]): boolean {
  return s.tipo === 'vasi' ? s.conclusa : statoSessione(s, campioni, pesi) === 'completa'
}
