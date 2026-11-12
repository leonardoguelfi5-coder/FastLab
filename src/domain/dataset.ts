import { eDataValida, spostaGiorni } from '@/lib/date'
import { eUuid } from '@/lib/percorsi'
import { trovaPianta } from './piante'
import { decimaliParametro, mediaEsN, ordinati, ultimoTestoDelGiorno, valoriGiornalieri, valoriGiornalieriSiNo } from './statistiche'
import type { ConfigEsperimento, Esperimento, Misura, Nota, Parametro, Pianta, Strumento, Trattamento } from './tipi'

/**
 * Il dominio della sezione Dataset: periodo, filtri, ricerca delle piante, serie del grafico, righe di "Mostra i
 * valori", note del grafico e filtri nella URL. Funzioni pure, senza date "di sistema" (`oggi` arriva dal chiamante);
 * le date sono AAAA-MM-GG locali confrontate come testo (con gli zeri a sinistra l'ordine alfabetico è quello del
 * calendario). La statistica è quella di `statistiche.ts`: l'unità è la pianta, prima il valore del giorno di ogni
 * pianta e solo dopo media, errore standard e n tra le piante. Il grafico, la tabella e l'export usano queste stesse
 * serie, così i numeri non possono divergere.
 */

/** Il periodo scelto, con la stessa forma delle scelte salvate dell'export (`export_salvati.scelte.periodo`). */
export type Periodo = { modo: 'tutto' } | { modo: 'settimane'; n: number } | { modo: 'intervallo'; da: string; a: string }
/** Gli estremi del periodo, compresi; `null` = nessun limite da quel lato. */
export interface Intervallo { da: string | null; a: string | null }

/** Le settimane che il Dataset offre (e legge dalla URL come `2s`, `4s`, `8s`). */
export const SETTIMANE_DEL_DATASET = [2, 4, 8] as const
/** Quanti trattamenti hanno un colore della tavolozza dei dati: dal nono in poi il posto è `null` (grafite tratteggiata). */
export const POSTI_COLORE = 8
/** Quante piante cercate si disegnano al più: oltre, il grafico non si legge più. */
export const MASSIMO_PIANTE = 8

/**
 * Il giorno a cui finiscono le "ultime N settimane": oggi per un esperimento in corso; per uno concluso l'ultima data
 * con misure dell'esperimento (`ultimaData`), altrimenti le ultime settimane di un esperimento finito da mesi sarebbero
 * sempre vuote. Senza misure non c'è niente da mostrare e resta oggi. `ultimaData` è la più recente fra tutti gli
 * strumenti, così Dataset ed Esporta contano le stesse settimane.
 */
export function fineDelleSettimane(stato: Esperimento['stato'], oggi: string, ultimaData: string | null): string {
  return stato === 'concluso' && ultimaData !== null ? ultimaData : oggi
}

/**
 * Gli estremi compresi del periodo. "Ultime N settimane" sono 7N giorni di calendario che finiscono a `fine` compreso
 * (4 settimane = 28 giorni, da `fine - 27`); `fine` viene da `fineDelleSettimane`. "Tutto" non ha estremi: comprende
 * anche le date nel futuro (un rilievo con l'orologio del telefono avanti).
 */
export function intervalloDelPeriodo(periodo: Periodo, fine: string): Intervallo {
  switch (periodo.modo) {
    case 'tutto': return { da: null, a: null }
    case 'settimane': return { da: spostaGiorni(fine, -(7 * periodo.n - 1)), a: fine }
    case 'intervallo': return { da: periodo.da, a: periodo.a }
  }
}

/** L'intervallo di un solo giorno (estremi inclusi). */
export function intervalloDelGiorno(data: string): Intervallo {
  return { da: data, a: data }
}

/** Vero se la data è nel periodo, estremi compresi. */
export function nelPeriodo(data: string, intervallo: Intervallo): boolean {
  return (intervallo.da === null || data >= intervallo.da) && (intervallo.a === null || data <= intervallo.a)
}

/**
 * "Cerca piante": le etichette separate da virgola (`3, 12, A4`), ogni pezzo con `trovaPianta`, cioè corrispondenza
 * esatta senza maiuscole né spazi ai bordi, e `035` = `35`. `3` non trova la `13`: chi cerca la pianta 3 non deve
 * vedersi la 13 nel grafico. Le trovate seguono l'ordine di `piante`, senza doppioni; i pezzi senza pianta restano
 * nell'ordine scritto, una volta sola (senza badare a maiuscole), per dirli sotto il campo.
 */
export function cercaPiante(piante: Pianta[], testo: string): { trovate: Pianta[]; nonTrovate: string[] } {
  const trovate = new Set<string>()
  const nonTrovate = new Map<string, string>()
  for (const pezzo of testo.split(',').map(x => x.trim()).filter(x => x !== '')) {
    const pianta = trovaPianta(piante, pezzo)
    if (pianta) trovate.add(pianta.id)
    else if (!nonTrovate.has(pezzo.toLowerCase())) nonTrovate.set(pezzo.toLowerCase(), pezzo)
  }
  return { trovate: piante.filter(p => trovate.has(p.id)), nonTrovate: [...nonTrovate.values()] }
}

/** I filtri del Dataset (anche nella URL, vedi `filtriDaRicerca`). */
export interface FiltriDataset {
  strumentoId: string | null
  parametroId: string | null
  /** Vuoto = tutti i trattamenti. */
  trattamentoIds: string[]
  /** Al più un livello per fattore; più fattori si combinano con "e". */
  livelloIds: string[]
  periodo: Periodo
  /** Il testo di "Cerca piante", così come è scritto. */
  cercato: string
}

/** Vero se c'è un filtro diverso da quello di partenza: trattamenti, livelli, periodo o piante cercate (non strumento e parametro). */
export function haFiltriAttivi(filtri: FiltriDataset): boolean {
  return filtri.trattamentoIds.length > 0 || filtri.livelloIds.length > 0 || filtri.periodo.modo !== 'tutto' || filtri.cercato.trim() !== ''
}

/** I filtri di partenza (tutti i trattamenti, nessun livello, tutto il periodo, nessuna ricerca) con lo stesso strumento e parametro. */
export function senzaFiltri(filtri: FiltriDataset): FiltriDataset {
  return { ...filtri, trattamentoIds: [], livelloIds: [], periodo: { modo: 'tutto' }, cercato: '' }
}

/**
 * Le piante del grafico. Se la ricerca trova almeno una pianta valgono solo quelle (`modo: 'piante'`): trattamenti e
 * livelli restano visibili ma non contano, altrimenti cercare una pianta di un altro trattamento darebbe un grafico
 * vuoto senza capire perché. Senza piante trovate valgono trattamenti e livelli insieme: un trattamento passa se è tra
 * quelli scelti (nessuno = tutti) e contiene il livello scelto di ogni fattore filtrato. `nonTrovate` c'è in tutti e
 * due i modi, per dirlo sotto il campo.
 */
export function pianteDelFiltro(
  config: ConfigEsperimento, filtri: FiltriDataset,
): { piante: Pianta[]; modo: 'trattamenti' | 'piante'; nonTrovate: string[] } {
  const tutte = ordinati(config.piante)
  const { trovate, nonTrovate } = cercaPiante(tutte, filtri.cercato)
  if (trovate.length > 0) return { piante: trovate, modo: 'piante', nonTrovate }
  const scelti = new Set(filtri.trattamentoIds)
  const passano = new Set(config.trattamenti
    .filter(t => (scelti.size === 0 || scelti.has(t.id)) && filtri.livelloIds.every(l => t.livello_ids.includes(l)))
    .map(t => t.id))
  return { piante: tutte.filter(p => passano.has(p.trattamento_id)), modo: 'trattamenti', nonTrovate }
}

/** Gli strumenti nell'ordine della configurazione, con gli archiviati in fondo (hanno ancora dati da guardare). */
export function strumentiPerScelta(config: ConfigEsperimento): Strumento[] {
  const tutti = ordinati(config.strumenti)
  return [...tutti.filter(s => !s.archiviato), ...tutti.filter(s => s.archiviato)]
}

/** Come si disegna un parametro: il valore (numero), il numero di elementi (lista), la percentuale di sì (sì/no). */
export type ScalaGrafico = 'valore' | 'conteggio' | 'percentuale'
export interface ParametroDelDataset { parametro: Parametro; disegnabile: boolean; scala: ScalaGrafico | null }

const SCALE: Record<Parametro['tipo'], ScalaGrafico | null> = { numero: 'valore', lista: 'conteggio', sino: 'percentuale', testo: null }

/**
 * I parametri di uno strumento per la scelta del Dataset, nell'ordine dello strumento, con gli archiviati in fondo
 * (si riconoscono da `parametro.archiviato`): hanno ancora dati da guardare. Il testo non si disegna
 * (`disegnabile: false`) ma si sceglie lo stesso, per la sua tabella.
 */
export function parametriDelloStrumento(config: ConfigEsperimento, strumentoId: string): ParametroDelDataset[] {
  const strumento = config.strumenti.find(s => s.id === strumentoId)
  if (!strumento) return []
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  const parametri = ordinati(strumento.parametri)
    .map(sp => perId.get(sp.parametro_id))
    .filter((p): p is Parametro => p !== undefined)
  return [...parametri.filter(p => !p.archiviato), ...parametri.filter(p => p.archiviato)]
    .map(parametro => ({ parametro, disegnabile: parametro.tipo !== 'testo', scala: SCALE[parametro.tipo] }))
}

/** Un punto di una serie: media, errore standard (`null` con n = 1 e per i sì/no) e n = piante con un valore. */
/** `decimali`: quelli dei dati del parametro, con cui scrivere media ed errore standard (assente per i sì/no in %). */
export interface PuntoSerie { data: string; media: number; es: number | null; n: number; decimali?: number }
/**
 * La media di un trattamento nel tempo. `posto` = indice del trattamento nell'ordine di tutta la configurazione (il
 * colore e il marcatore della tavolozza), `null` dal nono in poi. `riferimento`: la media tenue di tutte le piante del
 * trattamento accanto alle piante cercate.
 */
export interface SerieTrattamento { tipo: 'trattamento'; trattamento: Trattamento; posto: number | null; riferimento: boolean; punti: PuntoSerie[] }
/** Una pianta cercata nel tempo, con il posto del suo trattamento; ogni punto ha n = 1 ed errore standard `null`. */
export interface SeriePianta { tipo: 'pianta'; pianta: Pianta; trattamento: Trattamento; posto: number | null; riferimento: false; punti: PuntoSerie[] }
export type Serie = SerieTrattamento | SeriePianta

/** Il posto del colore di ogni trattamento: l'indice nell'ordine della configurazione, non nel filtro. */
function postiDeiTrattamenti(config: ConfigEsperimento): Map<string, number | null> {
  return new Map(ordinati(config.trattamenti).map((t, i) => [t.id, i < POSTI_COLORE ? i : null]))
}

/**
 * Il valore del giorno di ogni pianta, come numero da disegnare: pianta → data → valore. Numero e lista con
 * `valoriGiornalieri` (media delle letture non nulle di ogni misura, poi media delle misure del giorno; una lista conta
 * i suoi elementi); sì/no con l'ultima misura del giorno, 100 per sì e 0 per no, così la media tra piante è la
 * percentuale di sì. Il testo non si disegna: `null`. Contano solo le misure delle piante date e nel periodo.
 */
function valoriDaDisegnare(
  parametro: Parametro, misure: Misura[], piante: Pianta[], intervallo: Intervallo,
): Map<string, Map<string, number>> | null {
  const ids = new Set(piante.map(p => p.id))
  const scelte = misure.filter(m => ids.has(m.pianta_id) && nelPeriodo(m.data_rilievo, intervallo))
  switch (parametro.tipo) {
    case 'numero':
    case 'lista': return valoriGiornalieri(parametro, scelte)
    case 'sino': return new Map([...valoriGiornalieriSiNo(parametro, scelte)]
      .map(([pianta, perData]) => [pianta, new Map([...perData].map(([data, si]) => [data, si ? 100 : 0]))]))
    case 'testo': return null
  }
}

/**
 * I decimali di medie ed errori standard del grafico: quelli dei dati del parametro (`decimaliParametro`). Un sì/no si
 * disegna come percentuale di sì, che non viene da dati con decimali: nessuno, e si scrive come prima.
 */
function decimaliDelGrafico(parametro: Parametro, misure: Misura[]): number | undefined {
  return parametro.tipo === 'sino' ? undefined : decimaliParametro(parametro, misure)
}

/** I punti di un gruppo di piante, in ordine di data: `mediaEsN` dei valori del giorno delle piante che ne hanno uno. */
function puntiDelGruppo(
  piantaIds: Set<string>, valori: Map<string, Map<string, number>>, senzaEs: boolean, decimali: number | undefined,
): PuntoSerie[] {
  const perData = new Map<string, number[]>()
  for (const id of piantaIds) {
    for (const [data, x] of valori.get(id) ?? []) perData.set(data, [...(perData.get(data) ?? []), x])
  }
  return [...perData.keys()].sort().flatMap(data => {
    const r = mediaEsN(perData.get(data) ?? [])
    // una percentuale di sì non ha un errore standard da disegnare (spec §6.3): niente barre
    return r ? [{ data, media: r.media, es: senzaEs ? null : r.es, n: r.n, ...(decimali === undefined ? {} : { decimali }) }] : []
  })
}

/**
 * La media per trattamento nel tempo ± errore standard: una serie per ogni trattamento che ha almeno una pianta tra
 * `piante`, in ordine di configurazione (anche senza punti, per dirlo nella legenda). Numero e lista: media, ES e n dei
 * valori del giorno delle piante; sì/no: la percentuale di sì (0 a 100) tra le piante con un valore, senza ES. Il testo
 * non ha serie (vedi `righeTesto`).
 */
export function serieTrattamenti(
  config: ConfigEsperimento, parametro: Parametro, misure: Misura[], piante: Pianta[], intervallo: Intervallo,
): SerieTrattamento[] {
  const valori = valoriDaDisegnare(parametro, misure, piante, intervallo)
  if (!valori) return []
  const posti = postiDeiTrattamenti(config)
  return ordinati(config.trattamenti).flatMap((trattamento): SerieTrattamento[] => {
    const sue = new Set(piante.filter(p => p.trattamento_id === trattamento.id).map(p => p.id))
    if (sue.size === 0) return []
    return [{
      tipo: 'trattamento', trattamento, posto: posti.get(trattamento.id) ?? null, riferimento: false,
      punti: puntiDelGruppo(sue, valori, parametro.tipo === 'sino', decimaliDelGrafico(parametro, misure)),
    }]
  })
}

/**
 * Le piante cercate nel tempo: una serie per pianta (al più `MASSIMO_PIANTE`, nell'ordine dato; `oltre` dice quante
 * sono rimaste fuori), ognuna con il posto del suo trattamento, poi, per ogni trattamento di quelle piante, la media di
 * TUTTE le sue piante come riferimento tenue (`riferimento: true`), calcolata con `serieTrattamenti`. Il testo non ha
 * serie.
 */
export function seriePiante(
  config: ConfigEsperimento, parametro: Parametro, misure: Misura[], piante: Pianta[], intervallo: Intervallo,
): { serie: Serie[]; oltre: number } {
  const valori = valoriDaDisegnare(parametro, misure, piante, intervallo)
  if (!valori) return { serie: [], oltre: 0 }
  const uniche = piante.filter((p, i) => piante.findIndex(q => q.id === p.id) === i)
  const disegnate = uniche.slice(0, MASSIMO_PIANTE)
  const posti = postiDeiTrattamenti(config)
  const trattamenti = new Map(config.trattamenti.map(t => [t.id, t]))
  const dellePiante = disegnate.flatMap((pianta): SeriePianta[] => {
    const trattamento = trattamenti.get(pianta.trattamento_id)
    if (!trattamento) return []
    return [{
      tipo: 'pianta', pianta, trattamento, posto: posti.get(trattamento.id) ?? null, riferimento: false,
      punti: puntiDelGruppo(new Set([pianta.id]), valori, true, decimaliDelGrafico(parametro, misure)),
    }]
  })
  const coinvolti = new Set(disegnate.map(p => p.trattamento_id))
  const riferimenti = serieTrattamenti(config, parametro, misure, config.piante.filter(p => coinvolti.has(p.trattamento_id)), intervallo)
    .map(s => ({ ...s, riferimento: true }))
  return { serie: [...dellePiante, ...riferimenti], oltre: uniche.length - disegnate.length }
}

/** Una riga di "Mostra i valori": un punto di una serie del grafico. */
export interface RigaTabella { data: string; serie: Serie; media: number; es: number | null; n: number; decimali?: number }

/**
 * Le righe di "Mostra i valori", prese dai punti delle serie del grafico (gli stessi numeri, non ricalcolati): per
 * data, dalla più recente, una riga per ogni serie che ha un punto quel giorno, nell'ordine delle serie.
 */
export function righeTabella(serie: Serie[]): RigaTabella[] {
  const date = [...new Set(serie.flatMap(s => s.punti.map(p => p.data)))].sort().reverse()
  const perSerie = serie.map(s => new Map(s.punti.map(p => [p.data, p])))
  return date.flatMap(data => serie.flatMap((s, i): RigaTabella[] => {
    const p = perSerie[i].get(data)
    return p ? [{ data, serie: s, media: p.media, es: p.es, n: p.n, ...(p.decimali === undefined ? {} : { decimali: p.decimali }) }] : []
  }))
}

/** Una riga della tabella di un parametro di testo. */
export interface RigaTesto { pianta: Pianta; trattamento: Trattamento | null; data: string; testo: string }

/**
 * La tabella di un parametro di testo, che non si disegna: per ogni pianta e data l'ultimo testo del giorno
 * (`ultimoTestoDelGiorno`), dalla data più recente e, nella stessa data, nell'ordine delle piante date.
 */
export function righeTesto(
  config: ConfigEsperimento, parametro: Parametro, misure: Misura[], piante: Pianta[], intervallo: Intervallo,
): RigaTesto[] {
  const ids = new Set(piante.map(p => p.id))
  const testi = ultimoTestoDelGiorno(parametro, misure.filter(m => ids.has(m.pianta_id) && nelPeriodo(m.data_rilievo, intervallo)))
  const trattamenti = new Map(config.trattamenti.map(t => [t.id, t]))
  const uniche = piante.filter((p, i) => piante.findIndex(q => q.id === p.id) === i)
  const righe = uniche.flatMap(pianta => [...(testi.get(pianta.id) ?? [])].map(([data, testo]): RigaTesto =>
    ({ pianta, trattamento: trattamenti.get(pianta.trattamento_id) ?? null, data, testo })))
  // `sort` è stabile: nella stessa data resta l'ordine delle piante
  return righe.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
}

/** Le note del Diario di una data, per un solo segno verticale nel grafico. */
export interface NoteDellaData { data: string; note: Nota[] }

/**
 * Le note da segnare sul grafico: nel periodo, di tutto l'esperimento (nessun collegamento) o collegate a una delle
 * piante o a uno dei loro trattamenti (la regola di `noteDellaPianta`, sull'insieme delle piante). Raggruppate per
 * data in ordine di calendario; nella stessa data resta l'ordine dell'elenco.
 */
export function noteDelGrafico(note: Nota[], piante: Pianta[], intervallo: Intervallo): NoteDellaData[] {
  const pianteIds = new Set(piante.map(p => p.id))
  const trattamentiIds = new Set(piante.map(p => p.trattamento_id))
  const perData = new Map<string, Nota[]>()
  for (const nota of note) {
    if (!nelPeriodo(nota.data, intervallo)) continue
    const aTutto = nota.pianta_ids.length === 0 && nota.trattamento_ids.length === 0
    if (!aTutto && !nota.pianta_ids.some(id => pianteIds.has(id)) && !nota.trattamento_ids.some(id => trattamentiIds.has(id))) continue
    perData.set(nota.data, [...(perData.get(nota.data) ?? []), nota])
  }
  return [...perData.keys()].sort().map(data => ({ data, note: perData.get(data) ?? [] }))
}

/** Quanti caratteri e quanti pezzi (separati da virgola) di "Cerca piante" si leggono al più dalla URL. */
export const MASSIMO_CARATTERI_CERCA = 2000
export const MASSIMO_PEZZI_CERCA = 200

/**
 * Il testo di "Cerca piante" entro i limiti. Una URL condivisa o manomessa può portare un testo enorme, e ogni pezzo
 * si confronta con tutte le piante a ogni disegno: oltre 200 pezzi o 2000 caratteri non si legge altro. Un pezzo
 * tagliato a metà non resta: `12` tagliato in `1` cercherebbe un'altra pianta.
 */
export function limitaCerca(testo: string): string {
  let limitato = testo
  if (limitato.length > MASSIMO_CARATTERI_CERCA) {
    const taglio = limitato.slice(0, MASSIMO_CARATTERI_CERCA)
    limitato = limitato[MASSIMO_CARATTERI_CERCA] === ',' ? taglio : taglio.slice(0, Math.max(0, taglio.lastIndexOf(',')))
  }
  const pezzi = limitato.split(',')
  return pezzi.length > MASSIMO_PEZZI_CERCA ? pezzi.slice(0, MASSIMO_PEZZI_CERCA).join(',') : limitato
}

const SETTIMANE_URL = /^(\d+)s$/
const INTERVALLO_URL = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/

/** `per` della URL: `tutto`, `2s`, `4s`, `8s` o `AAAA-MM-GG_AAAA-MM-GG` (date vere, `da` ≤ `a`); il resto vale "Tutto". */
function periodoDaRicerca(per: string | null): Periodo {
  const settimane = SETTIMANE_URL.exec(per ?? '')
  if (settimane && (SETTIMANE_DEL_DATASET as readonly number[]).includes(Number(settimane[1]))) {
    return { modo: 'settimane', n: Number(settimane[1]) }
  }
  const intervallo = INTERVALLO_URL.exec(per ?? '')
  if (intervallo && eDataValida(intervallo[1]) && eDataValida(intervallo[2]) && intervallo[1] <= intervallo[2]) {
    return { modo: 'intervallo', da: intervallo[1], a: intervallo[2] }
  }
  return { modo: 'tutto' }
}

/** Gli ids di una lista con virgole: solo uuid che `esiste` accetta, una volta sola, nell'ordine scritto. */
function idsDaRicerca(valore: string | null, esiste: (id: string) => boolean): string[] {
  const ids = (valore ?? '').split(',').filter(id => eUuid(id) && esiste(id))
  return ids.filter((id, i) => ids.indexOf(id) === i)
}

/**
 * I filtri del Dataset dalla URL: `s` strumento, `p` parametro, `t` trattamenti e `f` livelli (ids con virgola), `per`
 * periodo, `cerca` testo (entro i limiti di `limitaCerca`). Un id che non è un uuid o non c'è nella configurazione si scarta in silenzio (vale il
 * default); di due livelli dello stesso fattore vale il primo; `per` illeggibile vale "Tutto". Un parametro che non è
 * dello strumento (o manca) diventa il primo disegnabile, o il primo se nessuno lo è. Senza strumento valido
 * `strumentoId` e `parametroId` restano `null`: lo strumento di partenza lo sceglie la pagina.
 */
export function filtriDaRicerca(params: URLSearchParams, config: ConfigEsperimento): FiltriDataset {
  const s = params.get('s')
  const strumentoId = s !== null && eUuid(s) && config.strumenti.some(x => x.id === s) ? s : null
  let parametroId: string | null = null
  if (strumentoId !== null) {
    const parametri = parametriDelloStrumento(config, strumentoId)
    const p = params.get('p')
    parametroId = parametri.find(x => x.parametro.id === p)?.parametro.id
      ?? (parametri.find(x => x.disegnabile) ?? parametri[0])?.parametro.id
      ?? null
  }
  const trattamentoIds = idsDaRicerca(params.get('t'), id => config.trattamenti.some(t => t.id === id))
  const fattoreDi = new Map(config.fattori.flatMap(f => f.livelli.map(l => [l.id, f.id] as const)))
  const fattoriUsati = new Set<string>()
  const livelloIds = idsDaRicerca(params.get('f'), id => fattoreDi.has(id)).filter(id => {
    const fattore = fattoreDi.get(id) as string
    if (fattoriUsati.has(fattore)) return false
    fattoriUsati.add(fattore)
    return true
  })
  return { strumentoId, parametroId, trattamentoIds, livelloIds, periodo: periodoDaRicerca(params.get('per')), cercato: limitaCerca(params.get('cerca') ?? '') }
}

/** I filtri come parametri della URL (vedi `filtriDaRicerca`). I valori di default non si scrivono. */
export function ricercaDaFiltri(filtri: FiltriDataset): URLSearchParams {
  const params = new URLSearchParams()
  if (filtri.strumentoId !== null) params.set('s', filtri.strumentoId)
  if (filtri.parametroId !== null) params.set('p', filtri.parametroId)
  if (filtri.trattamentoIds.length > 0) params.set('t', filtri.trattamentoIds.join(','))
  if (filtri.livelloIds.length > 0) params.set('f', filtri.livelloIds.join(','))
  const { periodo } = filtri
  if (periodo.modo === 'settimane') params.set('per', `${periodo.n}s`)
  if (periodo.modo === 'intervallo') params.set('per', `${periodo.da}_${periodo.a}`)
  if (filtri.cercato !== '') params.set('cerca', filtri.cercato)
  return params
}
