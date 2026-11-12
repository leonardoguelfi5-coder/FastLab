import type { Pianta } from '../tipi'
import {
  MAX_CARATTERI_UNITA, UNITA_COMUNI, type CampionePesatura, type ImpostazioniAnalisi, type SessionePesatura, type TipoAnalisi,
  type TipoSensore,
} from './tipi'

/**
 * Il modulo di una nuova pesata, tutto puro: i campi come li scrive la persona, i problemi che impediscono di
 * iniziare, le impostazioni da salvare e "Ripeti" (il modulo già compilato come una pesata fatta).
 */

export const MIN_REPLICHE = 1
export const MAX_REPLICHE = 10

/** Una delle unità del menu, oppure `altra`: l'unità la scrive l'utente. */
export type SceltaUnita = (typeof UNITA_COMUNI)[number] | 'altra'

export interface BozzaPesata {
  titolo: string
  data: string
  tipo: TipoAnalisi
  sceltaUnita: SceltaUnita
  unitaLibera: string
  repliche: number | null
  calcolaTampone: boolean
  rapportoTampone: number | null
  sensore: TipoSensore
  unitaSensore: string
  nota: string
}

export const SENSORI: { valore: TipoSensore; testo: string; unita: string }[] = [
  { valore: 'umidita', testo: 'Umidità', unita: '%' },
  { valore: 'tensione', testo: 'Tensione', unita: 'kPa' },
]

/** Cosa farà l'app con ogni tipo, in una riga sotto al menu. */
export const DESCRIZIONI_TIPO: Record<TipoAnalisi, string> = {
  aliquota: 'Un peso per campione. Se vuoi, l\'app calcola i mL di tampone da aggiungere.',
  rwc: 'Tre pesi in momenti diversi: fresco, turgido e secco. L\'app calcola l\'RWC.',
  sostanza_secca: 'Due pesi: fresco e secco. L\'app calcola la % di sostanza secca.',
  vasi: 'Taratura dei vasi: peso secco, capacità di campo e asciugatura con il sensore.',
}

export function bozzaVuota(oggi: string): BozzaPesata {
  return {
    titolo: '', data: oggi, tipo: 'aliquota', sceltaUnita: 'g', unitaLibera: '', repliche: 1,
    calcolaTampone: false, rapportoTampone: null, sensore: 'umidita', unitaSensore: '%', nota: '',
  }
}

const eComune = (u: string): u is (typeof UNITA_COMUNI)[number] => (UNITA_COMUNI as readonly string[]).includes(u)

/** "Ripeti": titolo, tipo, unità, impostazioni e nota di una pesata fatta; la data riparte da oggi. */
export function bozzaDa(s: SessionePesatura, oggi: string): BozzaPesata {
  const i = s.impostazioni
  const unita = s.unita.trim()
  return {
    titolo: s.titolo,
    data: oggi,
    tipo: s.tipo,
    sceltaUnita: eComune(unita) ? unita : 'altra',
    unitaLibera: eComune(unita) ? '' : unita,
    repliche: s.tipo === 'vasi' ? 1 : i.repliche,
    calcolaTampone: i.rapportoTampone !== null,
    rapportoTampone: i.rapportoTampone,
    sensore: i.sensore?.tipo ?? 'umidita',
    unitaSensore: i.sensore?.unita ?? '%',
    nota: s.nota ?? '',
  }
}

/** L'unità da salvare: quella del menu o quella scritta, senza spazi ai lati. */
export function unitaDi(b: BozzaPesata): string {
  return b.sceltaUnita === 'altra' ? b.unitaLibera.trim() : b.sceltaUnita
}

/** Ciò che impedisce di iniziare la pesata, in parole; vuoto se si può iniziare. Le piante le controlla la pagina. */
export function problemiDi(b: BozzaPesata): string[] {
  const p: string[] = []
  if (b.titolo.trim() === '') p.push('Scrivi un titolo.')
  if (b.sceltaUnita === 'altra') {
    const u = b.unitaLibera.trim()
    if (u === '') p.push('Scrivi l\'unità di misura.')
    else if (u.length > MAX_CARATTERI_UNITA) p.push(`L'unità di misura può avere al massimo ${MAX_CARATTERI_UNITA} caratteri.`)
  }
  if (b.tipo !== 'vasi' && (b.repliche === null || !Number.isInteger(b.repliche) || b.repliche < MIN_REPLICHE || b.repliche > MAX_REPLICHE)) {
    p.push(`Le repliche vanno da ${MIN_REPLICHE} a ${MAX_REPLICHE}.`)
  }
  if (b.tipo === 'aliquota' && b.calcolaTampone) {
    if (b.rapportoTampone === null || !Number.isFinite(b.rapportoTampone) || !(b.rapportoTampone > 0)) {
      p.push('Scrivi quanti mL di tampone per ogni g.')
    }
    if (b.sceltaUnita === 'altra') p.push('Il tampone si calcola solo con g, mg o kg: cambia unità o togli il calcolo del tampone.')
  }
  if (b.tipo === 'vasi' && b.unitaSensore.trim() === '') p.push('Scrivi l\'unità del sensore.')
  return p
}

export function impostazioniDi(b: BozzaPesata): ImpostazioniAnalisi {
  return {
    repliche: b.tipo === 'vasi' ? 1 : (b.repliche as number),
    rapportoTampone: b.tipo === 'aliquota' && b.calcolaTampone ? b.rapportoTampone : null,
    sensore: b.tipo === 'vasi' ? { tipo: b.sensore, unita: b.unitaSensore.trim() } : null,
  }
}

export type ModoPiante = 'tutte' | 'trattamento' | 'mano'

export interface SceltaCampioni {
  modo: ModoPiante
  piante: string[]
  /** Le righe che non sono piante: nome e substrato (per i vasi). */
  righe: { nome: string; substrato: string }[]
}

/**
 * I campioni di "Ripeti": le stesse piante (tutte, se erano tutte quelle che l'esperimento ha ora; altrimenti scelte
 * a mano, solo quelle che esistono ancora) e le stesse righe libere o gli stessi vasi, in ordine.
 */
export function campioniDa(campioni: CampionePesatura[], piante: Pianta[]): SceltaCampioni {
  const ordinati = [...campioni].sort((a, b) => a.ordine - b.ordine)
  const esistenti = new Set(piante.map(p => p.id))
  const scelte = ordinati.flatMap(c => (c.pianta_id && esistenti.has(c.pianta_id) ? [c.pianta_id] : []))
  const righe = ordinati.flatMap(c => (c.pianta_id === null ? [{ nome: c.nome ?? '', substrato: c.substrato ?? '' }] : []))
  const tutte = piante.length > 0 && scelte.length === piante.length
  // Una pesata fatta solo di righe libere si ripete senza piante: "a mano", con nessuna spuntata.
  return { modo: tutte ? 'tutte' : 'mano', piante: tutte ? [] : scelte, righe }
}
