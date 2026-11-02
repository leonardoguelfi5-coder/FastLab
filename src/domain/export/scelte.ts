import { eDataValida, formattaData } from '@/lib/date'
import { filtriDaRicerca, pianteDelFiltro, strumentiPerScelta, type FiltriDataset, type Periodo } from '../dataset'
import type { ConfigEsperimento } from '../tipi'

/**
 * Le scelte di Esporta Excel: cosa, quali piante, periodo e come. Hanno la forma del jsonb di `export_salvati.scelte`
 * (versione 1, migration 0014), così una scelta della pagina si salva com'è e un export salvato si riapre com'era. Un
 * periodo relativo ("ultime 4 settimane") resta relativo: lo stesso export, scaricato fra un mese, dà le ultime 4
 * settimane di allora.
 */

export type SceltaStrumenti = { modo: 'tutti' } | { modo: 'scelti'; ids: string[] }
export type SceltaPiante = { modo: 'tutte' } | { modo: 'trattamenti'; ids: string[] } | { modo: 'piante'; ids: string[] }
/** I fogli da mettere nel file: almeno uno vero. */
export interface ComeExport { valori: boolean; medie: boolean; grafici: boolean; diario: boolean; info: boolean }
export interface SceltaExport { v: 1; strumenti: SceltaStrumenti; piante: SceltaPiante; periodo: Periodo; come: ComeExport }

/** I limiti di `scelte_export_valide`: gli stessi qui, perché le due funzioni diano la stessa risposta. */
export const MASSIMO_STRUMENTI = 200
export const MASSIMO_IDS = 2000
export const MASSIMO_SETTIMANE = 104
export const MASSIMO_BYTE = 100_000

/** "📌 Tutto l'esperimento": tutti gli strumenti, tutte le piante, tutto il periodo, tutti i fogli. Congelata. */
export const SCELTA_TUTTO: SceltaExport = Object.freeze({
  v: 1 as const,
  strumenti: Object.freeze({ modo: 'tutti' as const }),
  piante: Object.freeze({ modo: 'tutte' as const }),
  periodo: Object.freeze({ modo: 'tutto' as const }),
  come: Object.freeze({ valori: true, medie: true, grafici: true, diario: true, info: true }),
})

const CHIAVI_COME = ['diario', 'grafici', 'info', 'medie', 'valori'] as const
/** Come in SQL: solo minuscole (le scrivono così Postgres e `nuovoId()`). `eUuid` di percorsi accetta anche le maiuscole. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Oggetto = Record<string, unknown>
const eOggetto = (x: unknown): x is Oggetto => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Vero se l'oggetto ha esattamente queste chiavi (in ordine alfabetico), come `array(select jsonb_object_keys(..) order by 1)`. */
function haChiavi(o: Oggetto, chiavi: readonly string[]): boolean {
  const sue = Object.keys(o).sort()
  return sue.length === chiavi.length && sue.every((c, i) => c === chiavi[i])
}

/**
 * I byte di `s::text` in Postgres: il JSON in UTF-8 con lo spazio dopo ogni `:` e ogni `,` (jsonb scrive `{"a": 1, "b": 2}`).
 * Si conta prima di leggere chiave per chiave, come nel database. I numeri sono scritti come li scrive JavaScript: un
 * `1.0` del testo originale qui è già `1` (differenza di qualche byte, solo su forme che non si usano).
 */
function byteDelTestoJsonb(x: unknown): number {
  const json = JSON.stringify(x)
  let separatori = 0
  let inTesto = false
  for (let i = 0; i < json.length; i++) {
    const c = json[i]
    if (inTesto) {
      if (c === '\\') i++
      else if (c === '"') inTesto = false
    } else if (c === '"') inTesto = true
    else if (c === ',' || c === ':') separatori++
  }
  return new TextEncoder().encode(json).length + separatori
}

/** Gli ids: array di uuid minuscoli, da 1 a `massimo`, senza doppioni. */
function leggiIds(x: unknown, massimo: number): string[] | null {
  if (!Array.isArray(x) || x.length < 1 || x.length > massimo) return null
  if (!x.every(e => typeof e === 'string' && UUID.test(e))) return null
  return new Set(x).size === x.length ? [...(x as string[])] : null
}

function leggiStrumenti(x: unknown): SceltaStrumenti | null {
  if (!eOggetto(x) || typeof x.modo !== 'string') return null
  if (x.modo === 'tutti') return haChiavi(x, ['modo']) ? { modo: 'tutti' } : null
  if (x.modo !== 'scelti' || !haChiavi(x, ['ids', 'modo'])) return null
  const ids = leggiIds(x.ids, MASSIMO_STRUMENTI)
  return ids ? { modo: 'scelti', ids } : null
}

function leggiPiante(x: unknown): SceltaPiante | null {
  if (!eOggetto(x) || typeof x.modo !== 'string') return null
  if (x.modo === 'tutte') return haChiavi(x, ['modo']) ? { modo: 'tutte' } : null
  if ((x.modo !== 'trattamenti' && x.modo !== 'piante') || !haChiavi(x, ['ids', 'modo'])) return null
  const ids = leggiIds(x.ids, MASSIMO_IDS)
  return ids ? { modo: x.modo, ids } : null
}

/** Il periodo. Le date si controllano con `eDataValida` (anni 0001-9999, giorni veri) prima di ogni conto sulle date. */
function leggiPeriodo(x: unknown): Periodo | null {
  if (!eOggetto(x) || typeof x.modo !== 'string') return null
  switch (x.modo) {
    case 'tutto': return haChiavi(x, ['modo']) ? { modo: 'tutto' } : null
    case 'settimane': {
      if (!haChiavi(x, ['modo', 'n']) || typeof x.n !== 'number') return null
      return Number.isInteger(x.n) && x.n >= 1 && x.n <= MASSIMO_SETTIMANE ? { modo: 'settimane', n: x.n } : null
    }
    case 'intervallo': {
      if (!haChiavi(x, ['a', 'da', 'modo']) || typeof x.da !== 'string' || typeof x.a !== 'string') return null
      return eDataValida(x.da) && eDataValida(x.a) && x.da <= x.a ? { modo: 'intervallo', da: x.da, a: x.a } : null
    }
    default: return null
  }
}

function leggiCome(x: unknown): ComeExport | null {
  if (!eOggetto(x) || !haChiavi(x, CHIAVI_COME)) return null
  if (!CHIAVI_COME.every(c => typeof x[c] === 'boolean') || !CHIAVI_COME.some(c => x[c] === true)) return null
  return { valori: x.valori as boolean, medie: x.medie as boolean, grafici: x.grafici as boolean, diario: x.diario as boolean, info: x.info as boolean }
}

/**
 * Le scelte di un export dal json del database (o da qualunque cosa): la scelta, copiata, se ha la forma della
 * versione 1, altrimenti `null`. Le regole sono quelle di `scelte_export_valide` (migration 0014) e i casi di prova sono
 * gli stessi (`scelte.casi.ts` li legge dal pgTAP): chiavi esatte, `v` = 1, ids uuid minuscoli senza doppioni (da 1 a
 * 200 strumenti, da 1 a 2000 trattamenti o piante), `n` intero da 1 a 104, date vere con `da` ≤ `a`, i cinque booleani
 * di `come` con almeno uno vero, al più 100 000 byte. Non lancia mai. Gli ids non si confrontano con l'esperimento:
 * quelli che non ci sono più li toglie `applicaAllaConfigurazione`.
 */
export function leggiSceltaExport(x: unknown): SceltaExport | null {
  try {
    if (!eOggetto(x) || byteDelTestoJsonb(x) > MASSIMO_BYTE) return null
    if (!haChiavi(x, ['come', 'periodo', 'piante', 'strumenti', 'v']) || x.v !== 1) return null
    const strumenti = leggiStrumenti(x.strumenti)
    const piante = leggiPiante(x.piante)
    const periodo = leggiPeriodo(x.periodo)
    const come = leggiCome(x.come)
    return strumenti && piante && periodo && come ? { v: 1, strumenti, piante, periodo, come } : null
  } catch {
    // JSON.stringify lancia su un ciclo o su un BigInt: non è una scelta
    return null
  }
}

const nonCiSonoPiu = (n: number, uno: string, molti: string): string =>
  n === 1 ? `1 ${uno} non c'è più` : `${n} ${molti} non ci sono più`

/**
 * La scelta senza gli ids che nella configurazione non ci sono più (strumenti, trattamenti o piante eliminati dopo
 * averla salvata), con una riga per ogni gruppo scartato: `1 strumento non c'è più`, `2 piante non ci sono più`. Un
 * elenco che resta vuoto torna a "tutti" o "tutte": non si può esportare un elenco vuoto, e la riga lo dice.
 */
export function applicaAllaConfigurazione(scelta: SceltaExport, config: ConfigEsperimento): { scelta: SceltaExport; scartati: string[] } {
  const scartati: string[] = []
  let strumenti: SceltaStrumenti = scelta.strumenti
  if (strumenti.modo === 'scelti') {
    const esistono = new Set(config.strumenti.map(s => s.id))
    const restano = strumenti.ids.filter(id => esistono.has(id))
    if (restano.length < strumenti.ids.length) scartati.push(nonCiSonoPiu(strumenti.ids.length - restano.length, 'strumento', 'strumenti'))
    strumenti = restano.length === 0 ? { modo: 'tutti' } : { modo: 'scelti', ids: restano }
  }
  let piante: SceltaPiante = scelta.piante
  if (piante.modo !== 'tutte') {
    const trattamenti = piante.modo === 'trattamenti'
    const esistono = new Set((trattamenti ? config.trattamenti : config.piante).map(x => x.id))
    const restano = piante.ids.filter(id => esistono.has(id))
    if (restano.length < piante.ids.length) {
      const via = piante.ids.length - restano.length
      scartati.push(trattamenti ? nonCiSonoPiu(via, 'trattamento', 'trattamenti') : nonCiSonoPiu(via, 'pianta', 'piante'))
    }
    piante = restano.length === 0 ? { modo: 'tutte' } : { modo: piante.modo, ids: restano }
  }
  return { scelta: { ...scelta, strumenti, piante, come: { ...scelta.come } }, scartati }
}

/**
 * Da Dataset a Esporta ("Scarica questa vista"): lo strumento del filtro (senza, tutti); le piante cercate e trovate
 * (tutte quelle trovate, anche oltre le 8 che il grafico disegna), altrimenti, con un filtro di trattamenti o livelli,
 * i trattamenti che lo passano, altrimenti tutte; lo stesso periodo; tutti i fogli. Se il filtro non lascia passare
 * nessun trattamento si torna a tutte le piante: una scelta con un elenco vuoto non è valida.
 */
export function sceltaDaFiltri(filtri: FiltriDataset, config: ConfigEsperimento): SceltaExport {
  const strumenti: SceltaStrumenti = filtri.strumentoId !== null && config.strumenti.some(s => s.id === filtri.strumentoId)
    ? { modo: 'scelti', ids: [filtri.strumentoId] }
    : { modo: 'tutti' }
  const { modo, piante: delFiltro } = pianteDelFiltro(config, filtri)
  let piante: SceltaPiante = { modo: 'tutte' }
  if (modo === 'piante') piante = { modo: 'piante', ids: delFiltro.map(p => p.id).slice(0, MASSIMO_IDS) }
  else if (filtri.trattamentoIds.length > 0 || filtri.livelloIds.length > 0) {
    // la regola di `pianteDelFiltro`, sui trattamenti: anche uno senza piante passa il filtro
    const scelti = new Set(filtri.trattamentoIds)
    const ids = [...config.trattamenti].sort((a, b) => a.ordine - b.ordine)
      .filter(t => (scelti.size === 0 || scelti.has(t.id)) && filtri.livelloIds.every(l => t.livello_ids.includes(l)))
      .map(t => t.id)
      .slice(0, MASSIMO_IDS)
    if (ids.length > 0) piante = { modo: 'trattamenti', ids }
  }
  return { v: 1, strumenti, piante, periodo: { ...filtri.periodo }, come: { ...SCELTA_TUTTO.come } }
}

/**
 * La scelta dai parametri della URL di Dataset: gli stessi filtri di `filtriDaRicerca` (con `limitaCerca` e solo `2s`,
 * `4s`, `8s`), senza un secondo parser. Un export salvato con altre settimane si apre dalla lista degli export.
 */
export function sceltaDaRicerca(params: URLSearchParams, config: ConfigEsperimento): SceltaExport {
  return sceltaDaFiltri(filtriDaRicerca(params, config), config)
}

/** Quante etichette si scrivono al più in una descrizione: oltre, "e altre N". */
const MASSIMO_ETICHETTE = 6

function elenco(etichette: string[]): string {
  if (etichette.length <= MASSIMO_ETICHETTE) return etichette.join(', ')
  return `${etichette.slice(0, MASSIMO_ETICHETTE).join(', ')} e altre ${etichette.length - MASSIMO_ETICHETTE}`
}

/** Gli strumenti della scelta a parole: i nomi nell'ordine della configurazione, o "tutti gli strumenti". */
export function descriviStrumenti(scelta: SceltaExport, config: ConfigEsperimento): string {
  const { strumenti } = applicaAllaConfigurazione(scelta, config).scelta
  if (strumenti.modo === 'tutti') return 'tutti gli strumenti'
  const scelti = new Set(strumenti.ids)
  return strumentiPerScelta(config).filter(s => scelti.has(s.id)).map(s => s.nome).join(', ')
}

/** Le piante della scelta a parole: "tutte le piante", "trattamento S1 + Sì", "piante 35, 36". */
export function descriviPiante(scelta: SceltaExport, config: ConfigEsperimento): string {
  const { piante } = applicaAllaConfigurazione(scelta, config).scelta
  if (piante.modo === 'tutte') return 'tutte le piante'
  const scelti = new Set(piante.ids)
  const perOrdine = <T extends { id: string; ordine: number }>(xs: T[]) => [...xs].filter(x => scelti.has(x.id)).sort((a, b) => a.ordine - b.ordine)
  if (piante.modo === 'trattamenti') {
    const etichette = perOrdine(config.trattamenti).map(t => t.etichetta)
    return `${etichette.length === 1 ? 'trattamento' : 'trattamenti'} ${elenco(etichette)}`
  }
  const etichette = perOrdine(config.piante).map(p => p.etichetta)
  return `${etichette.length === 1 ? 'pianta' : 'piante'} ${elenco(etichette)}`
}

/** Il periodo a parole, come si sceglie: "tutto il periodo", "ultime 4 settimane", "dal 06/10/2026 al 02/11/2026". */
export function descriviPeriodo(periodo: Periodo): string {
  switch (periodo.modo) {
    case 'tutto': return 'tutto il periodo'
    case 'settimane': return periodo.n === 1 ? 'ultima settimana' : `ultime ${periodo.n} settimane`
    case 'intervallo': return periodo.da === periodo.a
      ? `il ${formattaData(periodo.da)}`
      : `dal ${formattaData(periodo.da)} al ${formattaData(periodo.a)}`
  }
}

/** Una scelta in una riga, sotto il nome di un export salvato: `SPAD, Ciras · tutte le piante · ultime 4 settimane · valori, medie, grafici`. */
export function descriviScelta(scelta: SceltaExport, config: ConfigEsperimento): string {
  const come = (['valori', 'medie', 'grafici', 'diario', 'info'] as const).filter(c => scelta.come[c])
  return [descriviStrumenti(scelta, config), descriviPiante(scelta, config), descriviPeriodo(scelta.periodo), come.join(', ')].join(' · ')
}
