import { eVuoto } from './misure'
import type { Misura, Parametro, Pianta, Strumento } from './tipi'

/** Stato di una pianta in un giro di misura: mai misurata, misurata a metà, completa. */
export type StatoPianta = 'da_fare' | 'incompleta' | 'fatta'

/** Piante nell'ordine del giro: per `ordine`, con l'etichetta come spareggio stabile. */
function inOrdine(piante: Pianta[]): Pianta[] {
  return [...piante].sort((a, b) => a.ordine - b.ordine || (a.etichetta < b.etichetta ? -1 : a.etichetta > b.etichetta ? 1 : 0))
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
export function prossimaDaMisurare(piante: Pianta[], stati: Map<string, StatoPianta>, dopo: string | null): Pianta | null {
  const ordinate = inOrdine(piante)
  const i = dopo === null ? -1 : ordinate.findIndex(p => p.id === dopo)
  return ordinate.slice(i + 1).find(p => (stati.get(p.id) ?? 'da_fare') !== 'fatta') ?? null
}

/** Quante piante sono fatte e quali mancano (comprese le incomplete), nell'ordine del giro. */
export function riepilogoGiro(piante: Pianta[], stati: Map<string, StatoPianta>): {
  fatte: number; totale: number; mancanti: Pianta[]; incomplete: Pianta[]
} {
  const ordinate = inOrdine(piante)
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
