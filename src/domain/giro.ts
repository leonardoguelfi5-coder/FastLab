import { intervalloDelGiorno, parametriDelloStrumento, serieTrattamenti } from './dataset'
import { eVuoto } from './misure'
import type { ConfigEsperimento, Misura, Parametro, Pianta, Strumento, Trattamento } from './tipi'

/** Stato di una pianta in un giro di misura: mai misurata, misurata a metà, completa. */
export type StatoPianta = 'da_fare' | 'incompleta' | 'fatta'

/**
 * L'ordine in cui si misurano le piante di un giro: `impostazioni` è il campo `ordine` delle Impostazioni (il
 * default), `etichetta` l'ordine naturale delle etichette (2 prima di 10), `blocco` il blocco e poi l'ordine;
 * `inverso` rovescia quello scelto.
 */
export type OrdineGiro = { criterio: 'impostazioni' | 'etichetta' | 'blocco'; inverso: boolean }

export const ORDINE_GIRO_PREDEFINITO: OrdineGiro = { criterio: 'impostazioni', inverso: false }

const naturale = (a: string, b: string): number => a.localeCompare(b, 'it', { numeric: true })
const confrontaLettere = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Per `ordine`, con l'etichetta come spareggio stabile: l'ordine di sempre. */
const perImpostazioni = (a: Pianta, b: Pianta): number => a.ordine - b.ordine || confrontaLettere(a.etichetta, b.etichetta)

/**
 * Le piante nell'ordine del giro scelto (una copia). Per etichetta lo spareggio è `ordine`; per blocco, le piante
 * senza blocco vanno in fondo e dentro lo stesso blocco vale `ordine`.
 */
export function ordinaPiante(piante: Pianta[], ordine: OrdineGiro = ORDINE_GIRO_PREDEFINITO): Pianta[] {
  const confronto = (a: Pianta, b: Pianta): number => {
    switch (ordine.criterio) {
      case 'etichetta':
        return naturale(a.etichetta, b.etichetta) || perImpostazioni(a, b)
      case 'blocco': {
        if (a.blocco === null || b.blocco === null) {
          if (a.blocco !== b.blocco) return a.blocco === null ? 1 : -1
        } else {
          const c = naturale(a.blocco, b.blocco)
          if (c !== 0) return c
        }
        return perImpostazioni(a, b)
      }
      default:
        return perImpostazioni(a, b)
    }
  }
  const ordinate = [...piante].sort(confronto)
  return ordine.inverso ? ordinate.reverse() : ordinate
}

/**
 * Stato di una pianta per uno strumento. `misureGiorno` arriva già filtrata per la data di rilievo dal chiamante
 * (le misure del giorno scelto): qui non si guarda la data, ma può contenere altre piante e altri strumenti, quindi
 * si filtra per `pianta_id` e `strumento_id`. Si guarda l'unione dei valori di tutte le misure di quella pianta per
 * quello strumento: due misure dello stesso giorno che insieme coprono tutto sono `fatta`. Un parametro è "con valore"
 * se almeno una di quelle misure lo ha non vuoto (`eVuoto`).
 *
 * Quali parametri contano per chiudere la pianta (solo quelli attivi: non archiviati e presenti in `parametri`):
 * - `tipo: 'strumento'` (per esempio Ciras): tutti i parametri attivi collegati allo strumento;
 * - `tipo: 'fenologico'`: solo quelli **obbligatori**. La tabella fenologica ha voci facoltative (Note, liste ancora
 *   vuote a inizio stagione): se contassero tutte, ogni pianta resterebbe `incompleta` per sempre e il giro non
 *   finirebbe mai. Senza obbligatori basta un valore qualunque dello strumento per essere `fatta`;
 * - nessun parametro attivo collegato: `fatta` se la pianta ha almeno una misura di quello strumento, altrimenti `da_fare`.
 *
 * Con i parametri che contano: tutti con valore → `fatta`; nessun valore in tutto lo strumento → `da_fare`; altrimenti
 * `incompleta`. Un valore solo in una voce facoltativa della tabella fenologica, con un obbligatorio ancora vuoto,
 * è `incompleta` e non `da_fare`: la pianta è stata toccata e va ripresa, non saltata.
 */
export function statoPianta(strumento: Strumento, parametri: Parametro[], misureGiorno: Misura[], piantaId: string): StatoPianta {
  const misure = misureGiorno.filter(m => m.pianta_id === piantaId && m.strumento_id === strumento.id)
  const perId = new Map(parametri.map(p => [p.id, p]))
  const attivi = strumento.parametri
    .map(sp => ({ p: perId.get(sp.parametro_id), obbligatorio: sp.obbligatorio }))
    .filter((x): x is { p: Parametro; obbligatorio: boolean } => x.p !== undefined && !x.p.archiviato)

  if (attivi.length === 0) return misure.length > 0 ? 'fatta' : 'da_fare'

  const conValore = (p: Parametro) => misure.some(m => !eVuoto(p, m.valori[p.id]))
  const contano = strumento.tipo === 'fenologico' ? attivi.filter(x => x.obbligatorio) : attivi
  const haValoreQualunque = attivi.some(x => conValore(x.p))

  if (contano.length === 0) return haValoreQualunque ? 'fatta' : 'da_fare'
  if (contano.every(x => conValore(x.p))) return 'fatta'
  return haValoreQualunque ? 'incompleta' : 'da_fare'
}

/**
 * La misura da completare direttamente all'arrivo su una pianta (Piano E, Decisione 13): la pianta è `incompleta` e ha
 * una sola misura di questo strumento in quel giorno. Con più misure, o con la pianta fatta, si chiede cosa fare;
 * una pianta senza misure non ha nulla da completare. `misureGiorno` può avere altre piante e altri strumenti.
 */
export function completamentoDiretto(strumento: Strumento, parametri: Parametro[], misureGiorno: Misura[], piantaId: string): Misura | null {
  const sue = misureGiorno.filter(m => m.pianta_id === piantaId && m.strumento_id === strumento.id)
  return sue.length === 1 && statoPianta(strumento, parametri, sue, piantaId) === 'incompleta' ? sue[0] : null
}

/** Lo stato di ogni pianta per uno strumento (le misure del giorno sono già filtrate per data dal chiamante). */
export function statiPiante(strumento: Strumento, parametri: Parametro[], misureGiorno: Misura[], piante: Pianta[]): Map<string, StatoPianta> {
  const delloStrumento = misureGiorno.filter(m => m.strumento_id === strumento.id)
  return new Map(piante.map(p => [p.id, statoPianta(strumento, parametri, delloStrumento, p.id)]))
}

/**
 * La prima pianta da misurare dopo `dopo` (esclusa), nell'ordine del giro, con stato diverso da `fatta`: le
 * incomplete si riprendono, le fatte si saltano. Senza `dopo` (o con un id che non c'è) parte dall'inizio. Dopo
 * l'ultima non ricomincia: `null`. Una pianta assente da `stati` vale `da_fare`.
 */
export function prossimaDaMisurare(
  piante: Pianta[], stati: Map<string, StatoPianta>, dopo: string | null, ordine: OrdineGiro = ORDINE_GIRO_PREDEFINITO,
): Pianta | null {
  const ordinate = ordinaPiante(piante, ordine)
  const i = dopo === null ? -1 : ordinate.findIndex(p => p.id === dopo)
  return ordinate.slice(i + 1).find(p => (stati.get(p.id) ?? 'da_fare') !== 'fatta') ?? null
}

/** Quante piante sono fatte e quali mancano (comprese le incomplete), nell'ordine del giro. */
export function riepilogoGiro(piante: Pianta[], stati: Map<string, StatoPianta>, ordine: OrdineGiro = ORDINE_GIRO_PREDEFINITO): {
  fatte: number; totale: number; mancanti: Pianta[]; incomplete: Pianta[]
} {
  const ordinate = ordinaPiante(piante, ordine)
  const stato = (p: Pianta): StatoPianta => stati.get(p.id) ?? 'da_fare'
  return {
    fatte: ordinate.filter(p => stato(p) === 'fatta').length,
    totale: ordinate.length,
    mancanti: ordinate.filter(p => stato(p) !== 'fatta'),
    incomplete: ordinate.filter(p => stato(p) === 'incompleta'),
  }
}

/** Il progresso di oggi per ogni strumento non archiviato: piante `fatta` su piante totali (le incomplete non contano). */
export function progressoOggi(
  strumenti: Strumento[], parametri: Parametro[], misureGiorno: Misura[], piante: Pianta[],
): Map<string, { fatte: number; totale: number }> {
  return new Map(
    strumenti.filter(s => !s.archiviato).map(s => {
      const stati = statiPiante(s, parametri, misureGiorno, piante)
      const fatte = [...stati.values()].filter(st => st === 'fatta').length
      return [s.id, { fatte, totale: piante.length }]
    }),
  )
}

/** Il giro di uno strumento a una data: quante piante fatte, se è cominciato e da dove si riprende. */
export interface Giro {
  fatte: number
  totale: number
  /** Almeno una pianta già toccata (anche a metà): da qui in poi la riga parla di quel giorno, non dell'ultima volta. */
  cominciato: boolean
}

export interface RigaStrumento {
  strumento: Strumento
  /** `null` finché le misure del giorno non sono arrivate (o se non arrivano): nessun progresso inventato. */
  giro: Giro | null
  /** La prima pianta da misurare; `null` se non ce ne sono (si va alla fine del giro). */
  prossima: Pianta | null
}

/**
 * Gli strumenti non archiviati, nell'ordine dello strumento, ciascuno con il suo giro. Gli stati delle piante si
 * calcolano solo a misure del giorno arrivate: senza, con i parametri e le misure ancora vuoti, ogni strumento
 * risulterebbe "senza parametri attivi" e le sue piante "fatte". Se le misure non arrivano (o non sono ancora
 * arrivate) la prossima pianta è la prima del giro: il modulo di misura chiederà lui cosa fare se ha già misure.
 */
export function righeStrumenti(config: ConfigEsperimento, misure: Misura[] | undefined, ordine: OrdineGiro = ORDINE_GIRO_PREDEFINITO): RigaStrumento[] {
  return config.strumenti
    .filter(s => !s.archiviato)
    .sort((a, b) => a.ordine - b.ordine)
    .map(strumento => {
      if (!misure) return { strumento, giro: null, prossima: prossimaDaMisurare(config.piante, new Map<string, StatoPianta>(), null, ordine) }
      const stati = statiPiante(strumento, config.parametri, misure, config.piante)
      const { fatte, totale } = riepilogoGiro(config.piante, stati, ordine)
      const cominciato = [...stati.values()].some(stato => stato !== 'da_fare')
      return { strumento, giro: { fatte, totale, cominciato }, prossima: prossimaDaMisurare(config.piante, stati, null, ordine) }
    })
}

/** Una cella della griglia delle piante: la pianta, il suo stato nel giro e se è quella che si sta misurando. */
export interface CellaGriglia { pianta: Pianta; stato: StatoPianta; attuale: boolean }

/**
 * Le celle della griglia delle piante, nell'ordine del giro scelto. `stati` viene dalle misure del giorno che già
 * comprendono quelle in coda d'invio (una misura appena salvata senza rete fa la pianta `fatta`); una pianta senza
 * stato vale `da_fare`. `attualeId` è la pianta aperta (`null` nel fine giro, dove non ce n'è una).
 */
export function celleGriglia(
  piante: Pianta[], stati: Map<string, StatoPianta>, attualeId: string | null, ordine: OrdineGiro = ORDINE_GIRO_PREDEFINITO,
): CellaGriglia[] {
  return ordinaPiante(piante, ordine).map(pianta => ({ pianta, stato: stati.get(pianta.id) ?? 'da_fare', attuale: pianta.id === attualeId }))
}

/** Media, errore standard (`null` con una sola pianta) e numero di piante di un trattamento, in un giorno. */
export interface RigaValoriOggi { trattamento: Trattamento; media: number; es: number | null; n: number }

export interface ValoriOggiParametro { parametro: Parametro; righe: RigaValoriOggi[] }

/**
 * "Valori di oggi" del fine giro: per ogni parametro numerico attivo dello strumento, una riga per trattamento con
 * media, ES e n. Sono i numeri del Dataset (`serieTrattamenti` con l'intervallo di un solo giorno), non un calcolo
 * a parte: i due posti non possono dare cifre diverse. Contano solo le misure di quello strumento; un trattamento
 * senza valori quel giorno non ha riga.
 */
export function valoriDiOggi(config: ConfigEsperimento, strumento: Strumento, misure: Misura[], data: string): ValoriOggiParametro[] {
  const sue = misure.filter(m => m.strumento_id === strumento.id)
  return parametriDelloStrumento(config, strumento.id)
    .map(x => x.parametro)
    .filter(p => p.tipo === 'numero' && !p.archiviato)
    .map(parametro => ({
      parametro,
      righe: serieTrattamenti(config, parametro, sue, config.piante, intervalloDelGiorno(data)).flatMap((serie): RigaValoriOggi[] => {
        const punto = serie.punti.find(x => x.data === data)
        return punto ? [{ trattamento: serie.trattamento, media: punto.media, es: punto.es, n: punto.n }] : []
      }),
    }))
}
