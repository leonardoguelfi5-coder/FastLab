import { giorniTra } from '@/lib/date'
import { eVuoto, formattaValore } from './misure'
import type { ConfigEsperimento, ElementoLista, Misura, Parametro, Strumento, ValoreParametro } from './tipi'

/**
 * Le statistiche di Piante e Oggi. L'unità è la pianta: più misure della stessa pianta nello stesso giorno diventano
 * la media giornaliera della pianta, e solo dopo si fanno le medie tra piante. Funzioni pure, senza date "di sistema":
 * le date sono sempre AAAA-MM-GG locali e arrivano dal chiamante.
 */

/** Quante altre piante servono per giudicare se una è "molto fuori dal gruppo". */
const MINIMO_ALTRE_PIANTE = 3
/** Quante deviazioni standard dalla media delle altre piante rendono un valore "molto lontano". */
const SOGLIA_DS = 5
/** Lo scarto minimo, in frazione della media delle altre piante, perché un valore sia "molto lontano". */
const SCARTO_MINIMO_RELATIVO = 0.2

const media = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Deviazione standard campionaria (n-1) di almeno due valori. Sotto una tolleranza relativa vale 0: valori uguali che
 * escono da medie diverse (0,15 e (0,1 + 0,2) / 2) differiscono per un errore di arrotondamento, non per la misura, e una
 * ds di 1e-17 farebbe sembrare "molto lontano" qualunque altro valore.
 */
function deviazioneStandard(xs: number[], m: number): number {
  const ds = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
  return ds <= 1e-9 * Math.max(1, Math.abs(m)) ? 0 : ds
}

/**
 * Il valore di un parametro in una misura come numero, per le statistiche:
 * - numero: la media delle letture non nulle;
 * - lista: il numero di elementi (es. i palchi);
 * - testo, sì/no e vuoto: `null`, non entrano nelle medie.
 */
export function valoreNumerico(p: Parametro, v: ValoreParametro | undefined): number | null {
  if (eVuoto(p, v)) return null
  switch (p.tipo) {
    case 'numero': {
      const letture = (v as (number | null)[]).filter((x): x is number => x !== null && Number.isFinite(x))
      return letture.length === 0 ? null : media(letture)
    }
    case 'lista': return (v as ElementoLista[]).length
    case 'testo':
    case 'sino': return null
  }
}

/**
 * La media giornaliera di ogni pianta per un parametro: pianta → data → valore. Prima la media delle letture di ogni
 * misura (`valoreNumerico`), poi quella delle misure dello stesso giorno. Le misure senza un valore numerico per il
 * parametro non contano, e non creano né la pianta né il giorno.
 */
export function valoriGiornalieri(parametro: Parametro, misure: Misura[]): Map<string, Map<string, number>> {
  const raccolti = new Map<string, Map<string, number[]>>()
  for (const m of misure) {
    const x = valoreNumerico(parametro, m.valori[parametro.id])
    if (x === null) continue
    const perData = raccolti.get(m.pianta_id) ?? new Map<string, number[]>()
    perData.set(m.data_rilievo, [...(perData.get(m.data_rilievo) ?? []), x])
    raccolti.set(m.pianta_id, perData)
  }
  return new Map([...raccolti].map(([pianta, perData]) => [pianta, new Map([...perData].map(([data, xs]) => [data, media(xs)]))]))
}

/**
 * Media, errore standard e numero di valori tra le piante (un valore per pianta, già media del giorno). L'errore
 * standard è la deviazione standard campionaria (n-1) divisa per la radice di n; con un solo valore non c'è (`null`),
 * con valori uguali è 0. Senza valori: `null`.
 */
export function mediaEsN(xs: number[]): { media: number; es: number | null; n: number } | null {
  if (xs.length === 0) return null
  const m = media(xs)
  return { media: m, es: xs.length < 2 ? null : deviazioneStandard(xs, m) / Math.sqrt(xs.length), n: xs.length }
}

/**
 * Per ogni pianta e data, il valore dell'ultima misura del giorno per `ora` che ne ha uno (`estrai` dà `undefined`
 * per le misure che non contano). A parità di ora vince l'ultima ricevuta, come in `daSistemare`: una misura fatta
 * dopo corregge quella di prima, mentre una media di sì/no o di testi non avrebbe senso.
 */
function ultimoDelGiorno<T>(misure: Misura[], estrai: (m: Misura) => T | undefined): Map<string, Map<string, T>> {
  const migliori = new Map<string, Map<string, { ora: string; valore: T }>>()
  for (const m of misure) {
    const valore = estrai(m)
    if (valore === undefined) continue
    const perData = migliori.get(m.pianta_id) ?? new Map<string, { ora: string; valore: T }>()
    const finora = perData.get(m.data_rilievo)
    if (!finora || m.ora >= finora.ora) perData.set(m.data_rilievo, { ora: m.ora, valore })
    migliori.set(m.pianta_id, perData)
  }
  return new Map([...migliori].map(([pianta, perData]) => [pianta, new Map([...perData].map(([data, x]) => [data, x.valore]))]))
}

/**
 * Il valore giornaliero di un sì/no per pianta: pianta → data → sì o no, dall'ultima misura del giorno per ora. Un
 * sì/no non scelto non conta (vale l'ultima misura che ha scelto). Un parametro che non è sì/no non dà niente.
 */
export function valoriGiornalieriSiNo(parametro: Parametro, misure: Misura[]): Map<string, Map<string, boolean>> {
  if (parametro.tipo !== 'sino') return new Map()
  return ultimoDelGiorno(misure, m => {
    const v = m.valori[parametro.id]
    return typeof v === 'boolean' ? v : undefined
  })
}

/**
 * Il testo del giorno per pianta: pianta → data → testo, dall'ultima misura del giorno per ora con un testo non bianco.
 * Un parametro che non è testo non dà niente.
 */
export function ultimoTestoDelGiorno(parametro: Parametro, misure: Misura[]): Map<string, Map<string, string>> {
  if (parametro.tipo !== 'testo') return new Map()
  return ultimoDelGiorno(misure, m => {
    const v = m.valori[parametro.id]
    return eVuoto(parametro, v) ? undefined : (v as string)
  })
}

/**
 * "Molto fuori dal gruppo": il valore di una pianta contro le ALTRE piante dello stesso trattamento nella stessa data
 * (leave-one-out). Fuori se lo scarto dalla loro media supera 5 deviazioni standard E il 20% della media, con
 * deviazione standard > 0. La soglia è prudente perché un falso allarme costa più di un errore non segnalato: con
 * 3 a 6 piante una soglia di 3 deviazioni standard dava il 4-12% di falsi allarmi per ogni valore (la deviazione
 * standard di pochi valori è molto instabile), e in un gruppo molto compatto (24,5 e 24,6 °C) segnalava scarti
 * di pochi decimi che non sono errori. Il 20% della media evita proprio questi scarti piccoli in valore assoluto.
 * Con la pianta inclusa nel calcolo, su 6 piante lo scarto non supera mai circa 2,04 deviazioni standard e la soglia
 * non scatterebbe mai. Con meno di 3 altre piante non si giudica: `null`.
 */
export function fuoriDalGruppo(valore: number, altri: number[]): { media: number; ds: number; fuori: boolean } | null {
  if (altri.length < MINIMO_ALTRE_PIANTE) return null
  const m = media(altri)
  const ds = deviazioneStandard(altri, m)
  return { media: m, ds, fuori: ds > 0 && Math.abs(valore - m) > Math.max(SOGLIA_DS * ds, SCARTO_MINIMO_RELATIVO * Math.abs(m)) }
}

/** I valori giornalieri di `data` delle piante di un trattamento diverse da `escludi` (quelle senza valore saltano). */
function valoriDelTrattamento(
  config: ConfigEsperimento, perPianta: Map<string, Map<string, number>>, trattamentoId: string, data: string, escludi?: string,
): number[] {
  return config.piante
    .filter(p => p.trattamento_id === trattamentoId && p.id !== escludi)
    .flatMap(p => {
      const valore = perPianta.get(p.id)?.get(data)
      return valore === undefined ? [] : [valore]
    })
}

/**
 * Il confronto discreto della scheda: il valore della pianta in `data`, la media delle altre piante del suo
 * trattamento (con quante sono) e se è molto fuori dal gruppo. `misureGiorno` sono le misure di quella data.
 * `null` se la pianta non c'è o non ha un valore quel giorno; la media è `null` se nessun'altra pianta ha un valore.
 */
export function confrontoTrattamento(
  config: ConfigEsperimento, parametro: Parametro, misureGiorno: Misura[], piantaId: string, data: string,
): { valore: number; media: number | null; n: number; fuori: boolean } | null {
  const pianta = config.piante.find(p => p.id === piantaId)
  if (!pianta) return null
  const perPianta = valoriGiornalieri(parametro, misureGiorno)
  const valore = perPianta.get(piantaId)?.get(data)
  if (valore === undefined) return null
  const altri = valoriDelTrattamento(config, perPianta, pianta.trattamento_id, data, piantaId)
  return {
    valore,
    media: altri.length === 0 ? null : media(altri),
    n: altri.length,
    fuori: fuoriDalGruppo(valore, altri)?.fuori ?? false,
  }
}

export type Tendenza = 'su' | 'giu' | 'uguale'
export interface PuntoValore { data: string; valore: number }
export interface UltimoValorePianta {
  strumento: Strumento
  parametro: Parametro
  ultimo: PuntoValore
  precedente: PuntoValore | null
  tendenza: Tendenza | null
}

/** Gli elementi nell'ordine della configurazione (`ordine`), senza toccare l'elenco originale. Una sola definizione per il dominio. */
export const ordinati = <T extends { ordine: number }>(xs: T[]): T[] => [...xs].sort((a, b) => a.ordine - b.ordine)

/**
 * Per ogni strumento attivo e ogni suo parametro attivo numero o lista (non testo né sì/no), l'ultimo valore giornaliero
 * della pianta e quello della data precedente con un valore, con la tendenza tra i due. Gli strumenti seguono il loro
 * ordine, i parametri l'ordine nello strumento. Si usano solo le misure di quello strumento; i parametri mai misurati
 * non compaiono. `misurePianta` sono le misure di una sola pianta.
 */
export function ultimiValoriPianta(config: ConfigEsperimento, misurePianta: Misura[]): UltimoValorePianta[] {
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  const risultato: UltimoValorePianta[] = []
  for (const strumento of ordinati(config.strumenti.filter(s => !s.archiviato))) {
    const misure = misurePianta.filter(m => m.strumento_id === strumento.id)
    for (const sp of ordinati(strumento.parametri)) {
      const parametro = perId.get(sp.parametro_id)
      if (!parametro || parametro.archiviato || (parametro.tipo !== 'numero' && parametro.tipo !== 'lista')) continue
      // una sola pianta nelle misure: la mappa ha al massimo una voce
      const perData = [...valoriGiornalieri(parametro, misure).values()][0]
      if (!perData) continue
      const [ultimo, precedente] = [...perData]
        .map(([data, valore]): PuntoValore => ({ data, valore }))
        .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
      const differenza = precedente ? ultimo.valore - precedente.valore : 0
      risultato.push({
        strumento, parametro, ultimo, precedente: precedente ?? null,
        tendenza: !precedente ? null : Math.abs(differenza) < 1e-9 ? 'uguale' : differenza > 0 ? 'su' : 'giu',
      })
    }
  }
  return risultato
}

export interface RigaRiepilogo {
  parametro: Parametro
  /** `n`: gli elementi di una lista (il valore è lo stesso conteggio). */
  ultimo: { data: string; valore: number | string | boolean; n?: number }
  /** ultimo meno precedente (numeri e liste); `null` senza una data precedente con un valore, e per testo e sì/no. */
  differenza: number | null
  tendenza: Tendenza | null
  /** La data del valore precedente, per dire "rispetto al 31/10" a chi non vede la freccia. */
  dataPrecedente: string | null
  /** La data del valore è diversa da quella del blocco: la riga lo dice. */
  dataPropria: boolean
  /** Il testo intero (testo lungo) o gli elementi (lista) che la riga apre con "›"; `null` per numeri e sì/no. */
  dettaglio: string | null
}
export interface BloccoRiepilogo { strumento: Strumento; data: string; righe: RigaRiepilogo[] }

/** L'ultima misura di `data` (per ora; a parità l'ultima ricevuta) che ha un valore per il parametro. */
function ultimaMisuraConValore(parametro: Parametro, misure: Misura[], data: string): Misura | undefined {
  let trovata: Misura | undefined
  for (const m of misure) {
    if (m.data_rilievo !== data || eVuoto(parametro, m.valori[parametro.id])) continue
    if (!trovata || m.ora >= trovata.ora) trovata = m
  }
  return trovata
}

/** L'ultima data (e il suo valore) della sola pianta di una mappa pianta → data → valore. */
function ultimaVoce<T>(perPianta: Map<string, Map<string, T>>): { data: string; valore: T } | null {
  const perData = [...perPianta.values()][0]
  if (!perData || perData.size === 0) return null
  const data = [...perData.keys()].reduce((a, b) => (a >= b ? a : b))
  return { data, valore: perData.get(data) as T }
}

/**
 * Il riepilogo della scheda della pianta: un blocco per strumento attivo, nell'ordine della configurazione, con una
 * riga per ogni parametro attivo che ha un valore (numeri, liste, testo e sì/no, nell'ordine dello strumento). La data
 * del blocco è quella dell'ultimo valore dello strumento; una riga con un valore più vecchio ha `dataPropria`. Numeri e
 * liste portano la differenza dal valore della data precedente (`ultimiValoriPianta`); testo e sì/no solo l'ultimo
 * del giorno, senza freccia. Gli strumenti senza valori non hanno un blocco. `misurePianta` sono di una sola pianta.
 */
export function riepilogoPianta(config: ConfigEsperimento, misurePianta: Misura[]): BloccoRiepilogo[] {
  const numerici = new Map(ultimiValoriPianta(config, misurePianta).map(r => [`${r.strumento.id}/${r.parametro.id}`, r]))
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  const blocchi: BloccoRiepilogo[] = []
  for (const strumento of ordinati(config.strumenti.filter(s => !s.archiviato))) {
    const misure = misurePianta.filter(m => m.strumento_id === strumento.id)
    const righe: Omit<RigaRiepilogo, 'dataPropria'>[] = []
    for (const sp of ordinati(strumento.parametri)) {
      const parametro = perId.get(sp.parametro_id)
      if (!parametro || parametro.archiviato) continue
      if (parametro.tipo === 'numero' || parametro.tipo === 'lista') {
        const r = numerici.get(`${strumento.id}/${parametro.id}`)
        if (!r) continue
        const differenza = r.precedente ? r.ultimo.valore - r.precedente.valore : null
        const base = {
          parametro, differenza, tendenza: r.tendenza, dataPrecedente: r.precedente?.data ?? null,
        }
        if (parametro.tipo === 'numero') {
          righe.push({ ...base, ultimo: { data: r.ultimo.data, valore: r.ultimo.valore }, dettaglio: null })
        } else {
          const m = ultimaMisuraConValore(parametro, misure, r.ultimo.data)
          righe.push({
            ...base, ultimo: { data: r.ultimo.data, valore: r.ultimo.valore, n: r.ultimo.valore },
            dettaglio: m ? formattaValore(parametro, m.valori[parametro.id]) : null,
          })
        }
        continue
      }
      const ultima = parametro.tipo === 'testo'
        ? ultimaVoce(ultimoTestoDelGiorno(parametro, misure))
        : ultimaVoce(valoriGiornalieriSiNo(parametro, misure))
      if (!ultima) continue
      righe.push({
        parametro, ultimo: { data: ultima.data, valore: ultima.valore }, differenza: null, tendenza: null,
        dataPrecedente: null, dettaglio: parametro.tipo === 'testo' ? String(ultima.valore) : null,
      })
    }
    if (righe.length === 0) continue
    const data = righe.reduce((a, r) => (r.ultimo.data > a ? r.ultimo.data : a), '')
    blocchi.push({ strumento, data, righe: righe.map(r => ({ ...r, dataPropria: r.ultimo.data !== data })) })
  }
  return blocchi
}

/**
 * Gli avvisi di dati mancanti della scheda. Per ogni strumento attivo, se l'esperimento ha una data di misura più
 * recente dell'ultima della pianta: "<Strumento> non misurato da N giorni" (N dall'ultima misura della pianta a `oggi`,
 * e solo se N > 0: con date nel futuro, per un orologio indietro, non c'è nessun avviso),
 * o "<Strumento> mai misurato" se la pianta non ha misure di quello strumento. Se nessuna pianta ha misure dello
 * strumento (non è in `ultimeDatePerStrumento`) nessun avviso.
 */
export function avvisiMancanti(
  config: ConfigEsperimento, misurePianta: Misura[], ultimeDatePerStrumento: Map<string, string>, oggi: string,
): string[] {
  const avvisi: string[] = []
  for (const strumento of ordinati(config.strumenti.filter(s => !s.archiviato))) {
    const dellEsperimento = ultimeDatePerStrumento.get(strumento.id)
    if (dellEsperimento === undefined) continue
    const date = misurePianta.filter(m => m.strumento_id === strumento.id).map(m => m.data_rilievo)
    if (date.length === 0) {
      avvisi.push(`${strumento.nome} mai misurato`)
      continue
    }
    const ultima = date.reduce((a, b) => (a >= b ? a : b))
    if (dellEsperimento <= ultima) continue
    const giorni = giorniTra(ultima, oggi)
    // Una misura di oggi o del futuro (orologio del telefono indietro) non è "non misurato da 0 giorni".
    if (giorni <= 0) continue
    avvisi.push(`${strumento.nome} non misurato da ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`)
  }
  return avvisi
}

/**
 * La media per trattamento nell'elenco delle piante: la media degli ultimi valori delle sue piante per un parametro,
 * ogni pianta con la sua ultima data (media giornaliera), e quante piante hanno un valore. Tutti i trattamenti della
 * configurazione compaiono, anche senza valori (`media: null`, `n: 0`). `ultimeMisure` sono le misure più recenti di
 * ogni pianta (la RPC `ultime_misure_piante`): per ogni strumento portano la data più recente, e fra queste si
 * prende per ogni pianta l'ultima con un valore del parametro.
 */
export function mediaPerTrattamento(
  config: ConfigEsperimento, parametro: Parametro, ultimeMisure: Misura[],
): Map<string, { media: number | null; n: number }> {
  const perPianta = valoriGiornalieri(parametro, ultimeMisure)
  const ultimoDi = (piantaId: string): number | undefined => {
    const perData = perPianta.get(piantaId)
    if (!perData) return undefined
    const ultima = [...perData.keys()].reduce((a, b) => (a >= b ? a : b))
    return perData.get(ultima)
  }
  return new Map(ordinati(config.trattamenti).map(t => {
    const valori = config.piante
      .filter(p => p.trattamento_id === t.id)
      .map(p => ultimoDi(p.id))
      .filter((x): x is number => x !== undefined)
    return [t.id, { media: valori.length === 0 ? null : media(valori), n: valori.length }]
  }))
}

export interface DaSistemare { misuraId: string; piantaId: string; parametroId: string; valore: number; media: number }

/**
 * I valori di `data` da controllare ("Da sistemare"): per ogni parametro numerico attivo (le liste e i testi no), le
 * piante molto fuori dal gruppo del loro trattamento (`fuoriDalGruppo`). Per ogni voce, `misuraId` è la misura che porta
 * il valore: con più misure quel giorno, l'ultima per ora che ha un valore. `valore` è la media giornaliera della
 * pianta, `media` quella delle altre piante del trattamento. Ordine: parametri come in configurazione, poi piante.
 */
export function daSistemare(config: ConfigEsperimento, misureGiorno: Misura[], data: string): DaSistemare[] {
  const risultato: DaSistemare[] = []
  const delGiorno = misureGiorno.filter(m => m.data_rilievo === data)
  for (const parametro of ordinati(config.parametri.filter(p => !p.archiviato && p.tipo === 'numero'))) {
    const perPianta = valoriGiornalieri(parametro, delGiorno)
    for (const pianta of ordinati(config.piante)) {
      const valore = perPianta.get(pianta.id)?.get(data)
      if (valore === undefined) continue
      const altri = valoriDelTrattamento(config, perPianta, pianta.trattamento_id, data, pianta.id)
      const giudizio = fuoriDalGruppo(valore, altri)
      if (!giudizio?.fuori) continue
      // la misura da toccare: l'ultima per ora che ha un valore (a parità di ora, l'ultima ricevuta)
      let misura: Misura | undefined
      for (const m of delGiorno) {
        if (m.pianta_id !== pianta.id || valoreNumerico(parametro, m.valori[parametro.id]) === null) continue
        if (!misura || m.ora >= misura.ora) misura = m
      }
      if (misura) risultato.push({ misuraId: misura.id, piantaId: pianta.id, parametroId: parametro.id, valore, media: giudizio.media })
    }
  }
  return risultato
}
