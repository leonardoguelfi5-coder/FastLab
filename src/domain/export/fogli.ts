import { dataLocaleDa } from '@/lib/date'
import { arrotondaDecimali } from '@/lib/numeri'
import {
  fineDelleSettimane, intervalloDelPeriodo, nelPeriodo, noteDelGrafico, parametriDelloStrumento, serieTrattamenti, strumentiPerScelta,
  type Intervallo, type NoteDellaData, type PuntoSerie, type ScalaGrafico, type SerieTrattamento,
} from '../dataset'
import { descriviCollegamento } from '../note'
import {
  decimaliParametro, ordinati, ultimoTestoDelGiorno, valoreNumerico, valoriGiornalieri, valoriGiornalieriSiNo,
} from '../statistiche'
import type { ConfigEsperimento, ElementoLista, Misura, Nota, Parametro, Pianta, Strumento, Trattamento } from '../tipi'
import { nomeFileExcel } from './riepilogo'
import { applicaAllaConfigurazione, descriviPeriodo, descriviPiante, leggiSceltaExport, type SceltaExport } from './scelte'

/**
 * Il modello puro della cartella Excel: i fogli, le loro colonne e righe, i grafici da disegnare. Niente exceljs né
 * rete: lo scrittore (`src/lib/excel/scriviXlsx.ts`, Task D8) trasforma questa descrizione in un file, e il riepilogo
 * di Esporta conta le sue righe, così "Dati: 896 righe" è vero per costruzione.
 *
 * La statistica è quella del Dataset: l'unità è la pianta. Il foglio Dati ha il valore del giorno di ogni pianta
 * (`valoriGiornalieri`, l'ultimo testo e l'ultimo sì/no del giorno); Medie e Grafici usano `serieTrattamenti`, la stessa
 * funzione del grafico e di "Mostra i valori", così i numeri non possono divergere.
 *
 * I valori delle celle:
 * - `{ data }` è una data AAAA-MM-GG (lo scrittore ne fa una data vera di Excel, in UTC), `{ ora }` un'ora HH:MM,
 *   `{ istante }` un istante ISO (data e ora locali nel file);
 * - i numeri restano numeri a precisione piena, i sì/no booleani, le etichette delle piante testo ("035" resta "035");
 * - **ogni stringa è testo puro**: lo scrittore la scrive sempre come testo, mai come formula né come numero. Una nota
 *   che comincia con `=`, `+`, `-` o `@` resta com'è (niente apice davanti, come invece nel CSV del Piano C: in un
 *   .xlsx l'apice si vedrebbe nella cella). Il modello toglie solo i caratteri che un .xlsx non può contenere e taglia
 *   i testi oltre il limite di Excel.
 */

export type Cella = number | string | boolean | null | { data: string } | { ora: string } | { istante: string }
export type TipoColonna = 'testo' | 'numero' | 'data' | 'ora' | 'istante' | 'booleano' | 'misto'
export interface Colonna { titolo: string; tipo: TipoColonna; larghezza: number }
export type TipoFoglio = 'dati' | 'medie' | 'misure' | 'lista' | 'grafici' | 'diario' | 'info'
export interface Foglio {
  nome: string
  tipo: TipoFoglio
  /**
   * Vero: la prima riga del file è l'intestazione (i titoli delle colonne), in grassetto, bloccata e con il filtro.
   * Falso (Grafici e Info): nessuna intestazione, i titoli delle colonne non si scrivono e valgono solo le larghezze.
   */
  intestazione: boolean
  colonne: Colonna[]
  /** Le righe di dati, senza l'intestazione. Una riga vuota (`[]`) separa i blocchi di Info e fa spazio ai grafici. */
  righe: Cella[][]
  /** Gli indici (in `righe`) delle righe in grassetto: i titoli dei blocchi di Info. */
  titoliDiBlocco: number[]
}
/** Un grafico per il foglio Grafici: lo disegna `impagina` + `GraficoSvg perImmagine` (Task D8). */
export interface GraficoDaDisegnare {
  parametroId: string
  titolo: string
  scala: ScalaGrafico
  /** L'unità sulla tacca alta dell'asse Y: quella del parametro, `%` per i sì/no, nessuna per le liste. */
  unita: string | null
  serie: SerieTrattamento[]
  note: NoteDellaData[]
  /** L'indice (in `righe` del foglio Grafici) della riga del titolo: l'immagine va sotto, nelle `RIGHE_IMMAGINE` seguenti. */
  riga: number
}
/** Uno strumento nel file, con i nomi dei suoi parametri (per la riga dei contenuti del riepilogo). */
export interface StrumentoEsportato { id: string; nome: string; parametri: string[] }
export interface Cartella {
  nomeFile: string
  fogli: Foglio[]
  grafici: GraficoDaDisegnare[]
  strumenti: StrumentoEsportato[]
  /** Gli estremi compresi del periodo, già risolti ("ultime 4 settimane" → date vere). */
  intervallo: Intervallo
}
export interface DatiCartella {
  config: ConfigEsperimento
  /** Le misure degli strumenti scelti (altre misure si ignorano). */
  misure: Misura[]
  note: Nota[]
  scelta: SceltaExport
  /** La data locale di oggi (`useOggi`), per il nome del file e per "ultime N settimane". */
  oggi: string
  /** L'istante dell'export (ISO), per Info. */
  adesso: string
  /** La data più recente con misure tra TUTTI gli strumenti (`useUltimaData`): per le settimane di un esperimento concluso. */
  ultimaData: string | null
}

/** Quante righe libere ha ogni grafico sotto il suo titolo: lo spazio dell'immagine (800 × 450 px: 23 righe da 20 px, una in più di margine). */
export const RIGHE_IMMAGINE = 24
export const TESTO_GRAFICI = 'Media per trattamento ± errore standard. Unità: la pianta (prima la media del giorno di ogni pianta).'
export const REGOLA_DELLE_MEDIE = 'Unità: la pianta. Prima il valore del giorno di ogni pianta (per un numero la media delle letture '
  + 'non vuote di ogni misura, poi la media delle misure del giorno; per una lista il numero di elementi; per testo e sì/no '
  + 'l\'ultima misura del giorno), poi tra le piante del trattamento media, errore standard (deviazione standard campionaria '
  + 'divisa per la radice di n) e n. Per i sì/no la percentuale di sì, senza errore standard.'
/** I fogli con un nome fisso: una lista con lo stesso nome prende ` (2)`. */
export const NOMI_FISSI = ['Dati', 'Medie', 'Misure', 'Grafici', 'Diario', 'Info'] as const
/** Excel tiene al più 32 767 caratteri in una cella: oltre si taglia, con `…`, a 32 000. */
export const MASSIMO_CARATTERI_CELLA = 32_000
const MASSIMO_NOME_FOGLIO = 31
const LARGHEZZA_MINIMA = 8
const LARGHEZZA_MASSIMA = 40
/** Excel mostra un numero in formato generale con al più 11 cifre: una media lunga non allarga la colonna oltre. */
const LARGHEZZA_NUMERO = 12

const TIPI_A_PAROLE: Record<Parametro['tipo'], string> = { numero: 'numero', testo: 'testo', sino: 'sì/no', lista: 'lista' }

// ---- testo, nomi e larghezze ----

/** Caratteri che XML 1.0 (quindi un .xlsx) non ammette: controllo tranne tab e a capo, surrogati spaiati, U+FFFE e U+FFFF. */
// eslint-disable-next-line no-control-regex -- sono proprio i caratteri di controllo da togliere
const NON_AMMESSI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Taglia a `massimo` unità UTF-16 senza lasciare a metà un carattere fuori dal piano di base (un'emoji). */
function taglia(testo: string, massimo: number): string {
  const pezzo = testo.slice(0, massimo)
  return /[\uD800-\uDBFF]$/.test(pezzo) ? pezzo.slice(0, -1) : pezzo
}

/** Un controllo veloce: quasi tutti i testi non hanno niente da togliere e non passano dalla sostituzione. */
// eslint-disable-next-line no-control-regex -- come sopra
const FORSE_NON_AMMESSI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/

/** Un testo come entra nel file: senza i caratteri non ammessi e, oltre 32 000 caratteri, tagliato con `…`. */
export function testoPerCella(testo: string): string {
  const pulito = FORSE_NON_AMMESSI.test(testo) ? testo.replace(NON_AMMESSI, '') : testo
  return pulito.length <= MASSIMO_CARATTERI_CELLA ? pulito : `${taglia(pulito, MASSIMO_CARATTERI_CELLA - 1)}…`
}

/**
 * I nomi dei fogli delle liste, validi per Excel: al più 31 caratteri, senza `[ ] : * ? / \` (diventano spazi) né
 * caratteri di controllo, senza apostrofo ai bordi, mai vuoti (`Lista`), mai `History` (riservato da Excel), unici
 * senza badare alle maiuscole (come li confronta Excel) anche rispetto ai fogli fissi: un doppione prende ` (2)`, ` (3)`,
 * tagliando il nome perché il suffisso stia nei 31 caratteri.
 */
export function nomiFogli(nomi: string[], riservati: readonly string[] = NOMI_FISSI): string[] {
  const usati = new Set([...riservati, 'History'].map(n => n.toLowerCase()))
  return nomi.map(nome => {
    const pulito = nome.replace(NON_AMMESSI, '').replace(/[[\]:*?/\\\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^'+|'+$/g, '').trim()
    const base = taglia(pulito, MASSIMO_NOME_FOGLIO).trim() || 'Lista'
    let scelto = base
    for (let k = 2; usati.has(scelto.toLowerCase()); k++) {
      const suffisso = ` (${k})`
      scelto = `${taglia(base, MASSIMO_NOME_FOGLIO - suffisso.length).trimEnd()}${suffisso}`
    }
    usati.add(scelto.toLowerCase())
    return scelto
  })
}

/** Quanti caratteri occupa una cella nel file (per la larghezza della colonna); per un testo, la sua riga più lunga. */
function caratteri(x: Cella): number {
  if (x === null) return 0
  if (typeof x === 'string') {
    if (!x.includes('\n')) return x.length
    return x.split('\n').reduce((m, riga) => Math.max(m, riga.length), 0)
  }
  if (typeof x === 'number') return Math.min(String(x).length, LARGHEZZA_NUMERO)
  if (typeof x === 'boolean') return 5   // FALSO, nell'Excel italiano
  if ('data' in x) return 10
  if ('ora' in x) return 5
  return 16   // dd/mm/yyyy hh:mm
}

/**
 * La larghezza di una colonna: la cella più lunga (intestazione compresa) più 2 di margine, tra 8 e 40 caratteri.
 * `valori` sono le righe e `i` la colonna. Una cella che non può superare il massimo trovato non si misura: con 50 000
 * righe scrivere ogni numero come testo costerebbe più di tutto il resto.
 */
export function larghezzaColonna(titolo: string | null, righe: readonly (readonly Cella[])[], i = 0): number {
  const tetto = LARGHEZZA_MASSIMA - 2
  let massimo = titolo === null ? 0 : caratteri(titolo)
  for (let r = 0; r < righe.length && massimo < tetto; r++) {
    const x = righe[r][i] ?? null
    if (x === null || (typeof x === 'number' && massimo >= LARGHEZZA_NUMERO) || (typeof x === 'string' && x.length <= massimo)) continue
    massimo = Math.max(massimo, caratteri(x))
  }
  return Math.min(LARGHEZZA_MASSIMA, Math.max(LARGHEZZA_MINIMA, massimo + 2))
}

/** Titoli unici nel foglio, senza badare alle maiuscole (un parametro chiamato "Data" non si confonde con la colonna Data). */
function titoliUnici(titoli: string[]): string[] {
  const usati = new Set<string>()
  return titoli.map(t => {
    let scelto = t
    for (let k = 2; usati.has(scelto.toLowerCase()); k++) scelto = `${t} (${k})`
    usati.add(scelto.toLowerCase())
    return scelto
  })
}

interface ColonnaGrezza { titolo: string; tipo: TipoColonna }

/** Il foglio finito: testo pulito in ogni cella, titoli unici, larghezze. */
function foglio(nome: string, tipo: TipoFoglio, colonne: ColonnaGrezza[], righe: Cella[][], extra: Partial<Foglio> = {}): Foglio {
  const intestazione = extra.intestazione ?? true
  for (const riga of righe) {
    for (let i = 0; i < riga.length; i++) {
      const x = riga[i]
      if (typeof x === 'string') riga[i] = testoPerCella(x)
    }
  }
  const puliti = colonne.map(c => testoPerCella(c.titolo))
  const titoli = intestazione ? titoliUnici(puliti) : puliti
  return {
    nome, tipo, intestazione, titoliDiBlocco: extra.titoliDiBlocco ?? [], righe,
    colonne: colonne.map((c, i) => ({
      titolo: titoli[i], tipo: c.tipo,
      larghezza: larghezzaColonna(intestazione ? titoli[i] : null, righe, i),
    })),
  }
}

// ---- il contesto: piante, strumenti, parametri e misure della scelta ----

/** Un parametro di uno strumento scelto, con la sua intestazione nel file. */
interface Voce { parametro: Parametro; strumento: Strumento; intestazione: string }

interface Contesto {
  config: ConfigEsperimento
  piante: Pianta[]
  strumenti: Strumento[]
  voci: Voce[]
  intervallo: Intervallo
  /** Le misure delle piante e degli strumenti scelti, nel periodo, ordinate per data, ora, pianta e strumento. */
  misure: Misura[]
  perStrumento: Map<string, Misura[]>
  trattamenti: Map<string, Trattamento>
  fattori: ConfigEsperimento['fattori']
  conBlocco: boolean
  rangoPianta: Map<string, number>
  rangoTrattamento: Map<string, number>
}

/**
 * Le intestazioni dei parametri: `Nome (unità)` o `Nome`; due uguali (senza badare a maiuscole e spazi, come Altezza nel
 * Metro e nella tabella fenologica) diventano `Altezza (cm) · Metro` e `Altezza (cm) · Fenologici`. Non prendono il
 * nome di una colonna fissa (`riservati`: Pianta, Data, i fattori...): un parametro chiamato "Data" diventa `Data (2)`,
 * lo stesso nome in Dati, Medie, Grafici e Info.
 */
function intestazioni(voci: Omit<Voce, 'intestazione'>[], riservati: string[]): string[] {
  const base = voci.map(({ parametro: p }) => (p.unita?.trim() ? `${p.nome.trim()} (${p.unita.trim()})` : p.nome.trim()))
  const quante = new Map<string, number>()
  for (const b of base) quante.set(b.toLowerCase(), (quante.get(b.toLowerCase()) ?? 0) + 1)
  const conStrumento = base.map((b, i) => ((quante.get(b.toLowerCase()) ?? 0) > 1 ? `${b} · ${voci[i].strumento.nome.trim()}` : b))
  return titoliUnici([...riservati, ...conStrumento]).slice(riservati.length)
}

function contesto(dati: DatiCartella, scelta: SceltaExport): Contesto {
  const { config } = dati
  const tuttePiante = ordinati(config.piante)
  const { piante: sceltaPiante, strumenti: sceltaStrumenti } = scelta
  let piante = tuttePiante
  if (sceltaPiante.modo === 'trattamenti') {
    const ids = new Set(sceltaPiante.ids)
    piante = tuttePiante.filter(p => ids.has(p.trattamento_id))
  } else if (sceltaPiante.modo === 'piante') {
    const ids = new Set(sceltaPiante.ids)
    piante = tuttePiante.filter(p => ids.has(p.id))
  }
  const sceltiIds = sceltaStrumenti.modo === 'scelti' ? new Set(sceltaStrumenti.ids) : null
  const strumenti = strumentiPerScelta(config).filter(s => sceltiIds === null || sceltiIds.has(s.id))

  // un parametro sta in un solo strumento; se per un dato vecchio fosse in due, vale il primo
  const visti = new Set<string>()
  const senzaTitolo = strumenti.flatMap(strumento => parametriDelloStrumento(config, strumento.id).flatMap(({ parametro }) => {
    if (visti.has(parametro.id)) return []
    visti.add(parametro.id)
    return [{ parametro, strumento }]
  }))
  const fattori = ordinati(config.fattori)
  const titoli = intestazioni(senzaTitolo, ['Esperimento', 'Pianta', 'Trattamento', 'Blocco', 'Data', ...fattori.map(f => f.nome)])
  const voci = senzaTitolo.map((v, i) => ({ ...v, intestazione: titoli[i] }))

  const intervallo = intervalloDelPeriodo(scelta.periodo, fineDelleSettimane(config.esperimento.stato, dati.oggi, dati.ultimaData))
  const rangoPianta = new Map(tuttePiante.map((p, i) => [p.id, i]))
  const rangoStrumento = new Map(strumenti.map((s, i) => [s.id, i]))
  const idsPiante = new Set(piante.map(p => p.id))
  const misure = dati.misure
    .filter(m => idsPiante.has(m.pianta_id) && rangoStrumento.has(m.strumento_id) && nelPeriodo(m.data_rilievo, intervallo))
    // `sort` è stabile: a parità di tutto resta l'ordine di lettura (data, ora, creazione, id, dal Task D3)
    .sort((a, b) => (a.data_rilievo < b.data_rilievo ? -1 : a.data_rilievo > b.data_rilievo ? 1 : 0)
      || (a.ora < b.ora ? -1 : a.ora > b.ora ? 1 : 0)
      || (rangoPianta.get(a.pianta_id) ?? 0) - (rangoPianta.get(b.pianta_id) ?? 0)
      || (rangoStrumento.get(a.strumento_id) ?? 0) - (rangoStrumento.get(b.strumento_id) ?? 0))
  const perStrumento = new Map<string, Misura[]>(strumenti.map(s => [s.id, []]))
  for (const m of misure) perStrumento.get(m.strumento_id)?.push(m)

  return {
    config, piante, strumenti, voci, intervallo, misure, perStrumento,
    trattamenti: new Map(config.trattamenti.map(t => [t.id, t])),
    fattori,
    conBlocco: piante.some(p => (p.blocco ?? '').trim() !== ''),
    rangoPianta,
    rangoTrattamento: new Map(ordinati(config.trattamenti).map((t, i) => [t.id, i])),
  }
}

/** Il livello del trattamento in un fattore, o `null`. */
function livello(fattore: ConfigEsperimento['fattori'][number], t: Trattamento | undefined): string | null {
  return (t && fattore.livelli.find(l => t.livello_ids.includes(l.id))?.nome) ?? null
}

/** Le colonne comuni a Dati, Misure e liste: Esperimento, Pianta, un fattore per colonna, Trattamento, Blocco (se usato). */
function colonneComuni(c: Contesto): ColonnaGrezza[] {
  return [
    { titolo: 'Esperimento', tipo: 'testo' }, { titolo: 'Pianta', tipo: 'testo' },
    ...c.fattori.map((f): ColonnaGrezza => ({ titolo: f.nome, tipo: 'testo' })),
    { titolo: 'Trattamento', tipo: 'testo' },
    ...(c.conBlocco ? [{ titolo: 'Blocco', tipo: 'testo' } as ColonnaGrezza] : []),
  ]
}

function celleComuni(c: Contesto, pianta: Pianta): Cella[] {
  const t = c.trattamenti.get(pianta.trattamento_id)
  const blocco = (pianta.blocco ?? '').trim()
  return [
    c.config.esperimento.nome, pianta.etichetta, ...c.fattori.map(f => livello(f, t)), t?.etichetta ?? null,
    ...(c.conBlocco ? [blocco === '' ? null : pianta.blocco] : []),
  ]
}

// ---- Dati ----

/** pianta → data → valore, come le mappe di `statistiche.ts`. */
type PerPiantaEData<T> = Map<string, Map<string, T>>

/** Le colonne di Dati per una voce: il valore e, per un numero con un giorno a più misure, `N_<intestazione>`. */
interface ColonneVoce { parametroId: string; titoli: ColonnaGrezza[]; celle: (piantaId: string, data: string) => Cella[] }

/** Segna in `righe` ogni pianta e data che ha un valore: sono le righe del foglio. */
function segnaRighe(righe: PerPiantaEData<true>, valori: PerPiantaEData<unknown>): void {
  for (const [piantaId, perData] of valori) {
    const date = righe.get(piantaId) ?? new Map<string, true>()
    for (const data of perData.keys()) date.set(data, true)
    righe.set(piantaId, date)
  }
}

function colonneDellaVoce(c: Contesto, voce: Voce, righe: PerPiantaEData<true>): ColonneVoce | null {
  const { parametro } = voce
  const misure = c.perStrumento.get(voce.strumento.id) ?? []
  const semplice = (valori: PerPiantaEData<Cella>, tipo: TipoColonna): ColonneVoce => {
    segnaRighe(righe, valori)
    return { parametroId: parametro.id, titoli: [{ titolo: voce.intestazione, tipo }], celle: (p, d) => [valori.get(p)?.get(d) ?? null] }
  }
  switch (parametro.tipo) {
    case 'lista': return null
    case 'testo': return semplice(ultimoTestoDelGiorno(parametro, misure), 'testo')
    case 'sino': return semplice(valoriGiornalieriSiNo(parametro, misure), 'booleano')
    case 'numero': {
      // il valore del giorno (media delle letture) con i decimali dei dati del parametro, come nell'app
      const decimali = decimaliParametro(parametro, misure)
      const valori = new Map([...valoriGiornalieri(parametro, misure)].map(([pianta, perData]) =>
        [pianta, new Map([...perData].map(([data, x]) => [data, arrotondaDecimali(x, decimali)]))]))
      segnaRighe(righe, valori)
      // quante misure del giorno hanno dato il valore (le letture ripetute di una misura contano una volta)
      const quante: PerPiantaEData<number> = new Map()
      let conN = false
      for (const m of misure) {
        if (valoreNumerico(parametro, m.valori[parametro.id]) === null) continue
        const perData = quante.get(m.pianta_id) ?? new Map<string, number>()
        const n = (perData.get(m.data_rilievo) ?? 0) + 1
        if (n > 1) conN = true
        perData.set(m.data_rilievo, n)
        quante.set(m.pianta_id, perData)
      }
      const titoli: ColonnaGrezza[] = [{ titolo: voce.intestazione, tipo: 'numero' }]
      if (!conN) return { parametroId: parametro.id, titoli, celle: (p, d) => [valori.get(p)?.get(d) ?? null] }
      titoli.push({ titolo: `N_${voce.intestazione}`, tipo: 'numero' })
      return {
        parametroId: parametro.id,
        titoli,
        celle: (p, d) => {
          const x = valori.get(p)?.get(d)
          return x === undefined ? [null, null] : [x, quante.get(p)?.get(d) ?? null]
        },
      }
    }
  }
}

/** Il foglio Dati e, per Info, il titolo della colonna di ogni parametro nel foglio (dopo `titoliUnici`). */
function foglioDati(c: Contesto): { foglio: Foglio; colonne: Map<string, string> } | null {
  const conValori: PerPiantaEData<true> = new Map()
  const perVoce = c.voci.flatMap(v => {
    const colonne = colonneDellaVoce(c, v, conValori)
    return colonne ? [colonne] : []
  })
  const piante = new Map(c.piante.map(p => [p.id, p]))
  const righe = [...conValori].flatMap(([piantaId, date]) => {
    const pianta = piante.get(piantaId) as Pianta
    const rango = c.rangoTrattamento.get(pianta.trattamento_id) ?? Infinity
    return [...date.keys()].map(data => ({ pianta, data, rango }))
  })
  if (righe.length === 0) return null
  righe.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) || a.rango - b.rango
    || (c.rangoPianta.get(a.pianta.id) ?? 0) - (c.rangoPianta.get(b.pianta.id) ?? 0))
  const prime = [...colonneComuni(c), { titolo: 'Data', tipo: 'data' } as ColonnaGrezza]
  const f = foglio('Dati', 'dati', [...prime, ...perVoce.flatMap(v => v.titoli)],
    righe.map(({ pianta, data }): Cella[] => [...celleComuni(c, pianta), { data }, ...perVoce.flatMap(v => v.celle(pianta.id, data))]))
  const colonne = new Map<string, string>()
  let indice = prime.length
  for (const v of perVoce) {
    colonne.set(v.parametroId, f.colonne[indice].titolo)
    indice += v.titoli.length
  }
  return { foglio: f, colonne }
}

// ---- Misure e liste ----

function foglioMisure(c: Contesto): Foglio | null {
  const piante = new Map(c.piante.map(p => [p.id, p]))
  const vociPerStrumento = new Map(c.strumenti.map(s => [s.id, c.voci.filter(v => v.strumento.id === s.id && v.parametro.tipo !== 'lista')]))
  const righe: Cella[][] = []
  for (const m of c.misure) {
    const comuni = celleComuni(c, piante.get(m.pianta_id) as Pianta)
    const riga = (v: Voce, lettura: number | null, valore: Cella): Cella[] =>
      [...comuni, { data: m.data_rilievo }, { ora: m.ora }, v.strumento.nome, v.parametro.nome, v.parametro.unita?.trim() || null, lettura, valore, m.id]
    for (const v of vociPerStrumento.get(m.strumento_id) ?? []) {
      const x = m.valori[v.parametro.id]
      if (v.parametro.tipo === 'numero') {
        if (!Array.isArray(x)) continue
        x.forEach((lettura, i) => {
          if (typeof lettura === 'number' && Number.isFinite(lettura)) righe.push(riga(v, i + 1, lettura))
        })
      } else if (v.parametro.tipo === 'testo') {
        if (typeof x === 'string' && x.trim() !== '') righe.push(riga(v, null, x))
      } else if (typeof x === 'boolean') righe.push(riga(v, null, x))
    }
  }
  if (righe.length === 0) return null
  return foglio('Misure', 'misure', [
    ...colonneComuni(c), { titolo: 'Data', tipo: 'data' }, { titolo: 'Ora', tipo: 'ora' }, { titolo: 'Strumento', tipo: 'testo' },
    { titolo: 'Parametro', tipo: 'testo' }, { titolo: 'Unità', tipo: 'testo' }, { titolo: 'N. lettura', tipo: 'numero' },
    { titolo: 'Valore', tipo: 'misto' }, { titolo: 'Id misura', tipo: 'testo' },
  ], righe)
}

/** I fogli delle liste, uno per lista con almeno un elemento, con il nome del parametro reso valido da `nomiFogli`. */
function fogliListe(c: Contesto): Foglio[] {
  const piante = new Map(c.piante.map(p => [p.id, p]))
  const costruiti = c.voci.filter(v => v.parametro.tipo === 'lista').flatMap(v => {
    const sotto = v.parametro.sotto_campi
    const righe: Cella[][] = []
    for (const m of c.perStrumento.get(v.strumento.id) ?? []) {
      const x = m.valori[v.parametro.id]
      if (!Array.isArray(x)) continue
      const comuni = celleComuni(c, piante.get(m.pianta_id) as Pianta)
      for (const elemento of x as ElementoLista[]) {
        if (elemento === null || typeof elemento !== 'object') continue
        righe.push([
          ...comuni, { data: m.data_rilievo }, { ora: m.ora }, v.strumento.nome, elemento.n,
          ...sotto.map(s => {
            const valore = elemento.valori?.[s.chiave]
            return typeof valore === 'number' && Number.isFinite(valore) ? valore : null
          }),
          m.id,
        ])
      }
    }
    if (righe.length === 0) return []
    const colonne: ColonnaGrezza[] = [
      ...colonneComuni(c), { titolo: 'Data', tipo: 'data' }, { titolo: 'Ora', tipo: 'ora' }, { titolo: 'Strumento', tipo: 'testo' },
      { titolo: 'N. elemento', tipo: 'numero' },
      ...sotto.map((s): ColonnaGrezza => ({ titolo: s.unita?.trim() ? `${s.nome} (${s.unita.trim()})` : s.nome, tipo: 'numero' })),
      { titolo: 'Id misura', tipo: 'testo' },
    ]
    return [{ nome: v.parametro.nome, colonne, righe }]
  })
  const nomi = nomiFogli(costruiti.map(f => f.nome))
  return costruiti.map((f, i) => foglio(nomi[i], 'lista', f.colonne, f.righe))
}

// ---- Medie e Grafici ----

interface SerieDellaVoce { voce: Voce; serie: SerieTrattamento[] }

/** Le serie del grafico di ogni parametro disegnabile (numero, lista, sì/no), con `serieTrattamenti` come nel Dataset. */
function serieDelleVoci(c: Contesto): SerieDellaVoce[] {
  return c.voci.filter(v => v.parametro.tipo !== 'testo').map(voce => ({
    voce, serie: serieTrattamenti(c.config, voce.parametro, c.perStrumento.get(voce.strumento.id) ?? [], c.piante, c.intervallo),
  }))
}

function foglioMedie(c: Contesto, tutte: SerieDellaVoce[]): Foglio | null {
  const colonne: ColonnaGrezza[] = [
    { titolo: 'Esperimento', tipo: 'testo' }, { titolo: 'Trattamento', tipo: 'testo' },
    ...c.fattori.map((f): ColonnaGrezza => ({ titolo: f.nome, tipo: 'testo' })), { titolo: 'Data', tipo: 'data' },
  ]
  // trattamento → data → un punto per voce
  const punti = new Map<string, Map<string, Map<number, PuntoSerie>>>()
  tutte.forEach(({ voce, serie }, i) => {
    const h = voce.intestazione
    if (voce.parametro.tipo === 'sino') colonne.push({ titolo: `${h} % sì`, tipo: 'numero' }, { titolo: `${h} n`, tipo: 'numero' })
    else {
      const t = voce.parametro.tipo === 'lista' ? `${h} (n. elementi)` : h
      colonne.push({ titolo: `${t} media`, tipo: 'numero' }, { titolo: `${t} ES`, tipo: 'numero' }, { titolo: `${t} n`, tipo: 'numero' })
    }
    for (const s of serie) {
      const perData = punti.get(s.trattamento.id) ?? new Map<string, Map<number, PuntoSerie>>()
      for (const p of s.punti) {
        const perVoce = perData.get(p.data) ?? new Map<number, PuntoSerie>()
        perVoce.set(i, p)
        perData.set(p.data, perVoce)
      }
      punti.set(s.trattamento.id, perData)
    }
  })
  const righe = [...punti].flatMap(([tId, perData]) => [...perData].map(([data, perVoce]) => ({ tId, data, perVoce })))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)
      || (c.rangoTrattamento.get(a.tId) ?? 0) - (c.rangoTrattamento.get(b.tId) ?? 0))
    .map(({ tId, data, perVoce }): Cella[] => {
      const t = c.trattamenti.get(tId)
      return [
        c.config.esperimento.nome, t?.etichetta ?? null, ...c.fattori.map(f => livello(f, t)), { data },
        ...tutte.flatMap(({ voce }, i): Cella[] => {
          const p = perVoce.get(i)
          if (voce.parametro.tipo === 'sino') return [p?.media ?? null, p?.n ?? 0]
          // media ed errore standard con i decimali dei dati del parametro, come nell'app
          const conDecimali = (x: number | null | undefined) =>
            x === null || x === undefined ? null : p?.decimali === undefined ? x : arrotondaDecimali(x, p.decimali)
          return [conDecimali(p?.media), conDecimali(p?.es), p?.n ?? 0]
        }),
      ]
    })
  return righe.length === 0 ? null : foglio('Medie', 'medie', colonne, righe)
}

function titoloGrafico(voce: Voce): string {
  if (voce.parametro.tipo === 'lista') return `${voce.intestazione} (n. elementi)`
  if (voce.parametro.tipo === 'sino') return `${voce.intestazione} (% sì)`
  return voce.intestazione
}

function graficiEFoglio(c: Contesto, tutte: SerieDellaVoce[], note: Nota[]): { grafici: GraficoDaDisegnare[]; foglio: Foglio | null } {
  const noteDelleDate = noteDelGrafico(note, c.piante, c.intervallo)
  const conPunti = tutte.filter(({ serie }) => serie.some(s => s.punti.length > 0))
  if (conPunti.length === 0) return { grafici: [], foglio: null }
  const righe: Cella[][] = [[TESTO_GRAFICI], []]
  const grafici = conPunti.map(({ voce, serie }): GraficoDaDisegnare => {
    const titolo = testoPerCella(titoloGrafico(voce))
    const riga = righe.length
    righe.push([titolo], ...Array.from({ length: RIGHE_IMMAGINE }, (): Cella[] => []))
    const scala = voce.parametro.tipo === 'sino' ? 'percentuale' : voce.parametro.tipo === 'lista' ? 'conteggio' : 'valore'
    const unita = scala === 'percentuale' ? '%' : scala === 'conteggio' ? null : voce.parametro.unita?.trim() || null
    return { parametroId: voce.parametro.id, titolo, scala, unita, serie, note: noteDelleDate, riga }
  })
  return { grafici, foglio: foglio('Grafici', 'grafici', [{ titolo: 'Grafici', tipo: 'testo' }], righe, { intestazione: false }) }
}

// ---- Diario ----

function foglioDiario(c: Contesto, note: Nota[]): Foglio | null {
  const righe = noteDelGrafico(note, c.piante, c.intervallo).flatMap(({ note: delGiorno }) => delGiorno.map((n): Cella[] => [
    { data: n.data }, n.testo, descriviCollegamento(n, c.config), n.promemoria, n.fatto_il ? { data: dataLocaleDa(n.fatto_il) } : null,
  ]))
  if (righe.length === 0) return null
  return foglio('Diario', 'diario', [
    { titolo: 'Data', tipo: 'data' }, { titolo: 'Testo', tipo: 'testo' }, { titolo: 'Collegata a', tipo: 'testo' },
    { titolo: 'Promemoria', tipo: 'booleano' }, { titolo: 'Fatto il', tipo: 'data' },
  ], righe)
}

// ---- Info ----

function periodoInParole(scelta: SceltaExport, intervallo: Intervallo): string {
  const { periodo } = scelta
  if (periodo.modo !== 'settimane' || intervallo.da === null || intervallo.a === null) return descriviPeriodo(periodo)
  return `${descriviPeriodo(periodo)}: ${descriviPeriodo({ modo: 'intervallo', da: intervallo.da, a: intervallo.a })}`
}

function foglioInfo(c: Contesto, scelta: SceltaExport, adesso: string, colonneInDati: Map<string, string>): Foglio {
  const { esperimento } = c.config
  const righe: Cella[][] = []
  const titoli: number[] = []
  const blocco = (titolo: Cella[], corpo: Cella[][]) => {
    if (righe.length > 0) righe.push([])
    titoli.push(righe.length)
    righe.push(titolo, ...corpo)
  }
  const n = c.piante.length
  blocco(['Voce', 'Valore'], [
    ['Esperimento', esperimento.nome],
    ['Data di inizio', esperimento.data_inizio ? { data: esperimento.data_inizio } : null],
    ['Stato', esperimento.stato === 'concluso' ? 'concluso' : 'in corso'],
    ['Note', esperimento.note.trim() === '' ? null : esperimento.note],
    ['Esportato il', { istante: adesso }],
    ['Strumenti', c.strumenti.map(s => s.nome).join(', ')],
    ['Piante', `${descriviPiante(scelta, c.config)} (${n} ${n === 1 ? 'pianta' : 'piante'})`],
    ['Periodo', periodoInParole(scelta, c.intervallo)],
    ['Regola delle medie', REGOLA_DELLE_MEDIE],
  ])
  const trattamenti = ordinati(c.config.trattamenti)
  blocco(['Trattamento', ...c.fattori.map(f => f.nome), 'Piante'], trattamenti.map(t => [
    t.etichetta, ...c.fattori.map(f => livello(f, t)), c.config.piante.filter(p => p.trattamento_id === t.id).length,
  ]))
  blocco(['Pianta', 'Trattamento', 'Blocco'], ordinati(c.config.piante).map(p => [
    p.etichetta, c.trattamenti.get(p.trattamento_id)?.etichetta ?? null, (p.blocco ?? '').trim() === '' ? null : p.blocco,
  ]))
  blocco(
    ['Strumento', 'Parametro', 'Tipo', 'Unità', 'Letture', 'Minimo', 'Massimo', 'Obbligatorio', 'Archiviato', 'Colonna in Dati'],
    strumentiPerScelta(c.config).flatMap(s => parametriDelloStrumento(c.config, s.id).map(({ parametro: p }): Cella[] => [
      s.nome, p.nome, TIPI_A_PAROLE[p.tipo], p.unita?.trim() || null, p.tipo === 'numero' ? p.n_letture : null,
      p.valore_min, p.valore_max, s.parametri.find(x => x.parametro_id === p.id)?.obbligatorio ?? false,
      p.archiviato || s.archiviato, colonneInDati.get(p.id) ?? null,
    ])),
  )
  const larghe = Math.max(...righe.map(r => r.length))
  const colonne = Array.from({ length: larghe }, (): ColonnaGrezza => ({ titolo: '', tipo: 'misto' }))
  return foglio('Info', 'info', colonne, righe, { intestazione: false, titoliDiBlocco: titoli })
}

// ---- la cartella ----

/**
 * La cartella Excel delle scelte: i fogli nell'ordine Dati, Medie, Misure, uno per ogni lista, Grafici, Diario, Info;
 * ognuno solo se le scelte lo chiedono e se ha almeno una riga, tranne Info che c'è sempre se chiesto. Le piante sono
 * quelle della scelta, le misure quelle degli strumenti scelti nel periodo ("ultime N settimane" fino a oggi, o
 * all'ultima data con misure per un esperimento concluso). Gli ids della scelta che non ci sono più si scartano come
 * in `applicaAllaConfigurazione`. Una scelta non valida lancia: meglio nessun file che un file sbagliato.
 */
export function costruisciCartella(dati: DatiCartella): Cartella {
  const letta = leggiSceltaExport(dati.scelta)
  if (!letta) throw new Error('Le scelte dell\'export non sono valide.')
  const { scelta } = applicaAllaConfigurazione(letta, dati.config)
  const c = contesto(dati, scelta)
  const { come } = scelta
  const serie = come.medie || come.grafici ? serieDelleVoci(c) : []
  const dati_ = come.valori ? foglioDati(c) : null
  const grafici = come.grafici ? graficiEFoglio(c, serie, dati.note) : { grafici: [], foglio: null }
  const fogli = [
    dati_?.foglio ?? null,
    come.medie ? foglioMedie(c, serie) : null,
    come.valori ? foglioMisure(c) : null,
    ...(come.valori ? fogliListe(c) : []),
    grafici.foglio,
    come.diario ? foglioDiario(c, dati.note) : null,
    come.info ? foglioInfo(c, scelta, dati.adesso, dati_?.colonne ?? new Map()) : null,
  ].filter((f): f is Foglio => f !== null)

  return {
    nomeFile: nomeFileExcel(dati.config.esperimento.nome, dati.oggi),
    fogli,
    grafici: grafici.grafici,
    strumenti: c.strumenti.map(s => ({
      id: s.id, nome: s.nome, parametri: c.voci.filter(v => v.strumento.id === s.id).map(v => v.parametro.nome),
    })),
    intervallo: c.intervallo,
  }
}
