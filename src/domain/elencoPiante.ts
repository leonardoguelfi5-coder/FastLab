import { trovaPianta } from './piante'
import { valoriGiornalieri } from './statistiche'
import type { ConfigEsperimento, Misura, Parametro, Pianta, Strumento } from './tipi'

/** Le piccole funzioni dell'elenco delle piante: quale valore mostrare, l'ultimo valore di ogni pianta, la ricerca. */

export interface ParametriDiStrumento { strumento: Strumento; parametri: Parametro[] }

const perOrdine = <T extends { ordine: number }>(xs: T[]): T[] => [...xs].sort((a, b) => a.ordine - b.ordine)

/**
 * I parametri tra cui scegliere il "Valore mostrato": numerici (le liste, il testo e i sì/no non hanno una media da
 * mostrare), non archiviati, di strumenti non archiviati. Raggruppati per strumento nell'ordine degli strumenti e,
 * dentro, nell'ordine in cui lo strumento li misura; gli strumenti senza parametri numerici non compaiono.
 */
export function parametriMostrabili(config: ConfigEsperimento): ParametriDiStrumento[] {
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  const gia = new Set<string>()
  const gruppi: ParametriDiStrumento[] = []
  for (const strumento of perOrdine(config.strumenti.filter(s => !s.archiviato))) {
    const parametri: Parametro[] = []
    for (const sp of perOrdine(strumento.parametri)) {
      const p = perId.get(sp.parametro_id)
      // un parametro sta in un solo strumento; se per un dato vecchio fosse in due, compare una volta
      if (!p || p.archiviato || p.tipo !== 'numero' || gia.has(p.id)) continue
      gia.add(p.id)
      parametri.push(p)
    }
    if (parametri.length > 0) gruppi.push({ strumento, parametri })
  }
  return gruppi
}

/**
 * Il valore mostrato di base: il primo parametro dello strumento scelto nello store; se non c'è, o non ha parametri
 * numerici, il primo del primo strumento. `null` se non c'è nessun parametro da mostrare.
 */
export function parametroDiBase(gruppi: ParametriDiStrumento[], strumentoId: string | null): Parametro | null {
  const dello = gruppi.find(g => g.strumento.id === strumentoId)
  return (dello ?? gruppi[0])?.parametri[0] ?? null
}

/**
 * L'ultimo valore di ogni pianta per un parametro: la sua data più recente con un valore, come media giornaliera
 * (la stessa regola di `mediaPerTrattamento`, così le righe e la media del blocco non si contraddicono).
 * Le piante senza valore non compaiono.
 */
export function ultimoValorePerPianta(parametro: Parametro, ultimeMisure: Misura[]): Map<string, { data: string; valore: number }> {
  const risultato = new Map<string, { data: string; valore: number }>()
  for (const [piantaId, perData] of valoriGiornalieri(parametro, ultimeMisure)) {
    const ultima = [...perData.keys()].reduce((a, b) => (a >= b ? a : b))
    risultato.set(piantaId, { data: ultima, valore: perData.get(ultima) as number })
  }
  return risultato
}

const normalizza = (s: string) => s.trim().toLowerCase()

/**
 * Le piante la cui etichetta contiene il testo cercato (senza badare a maiuscole né a spazi ai bordi); senza testo,
 * tutte. Vale anche la pianta che Invio aprirebbe (`trovaPianta`, es. "035" per la 35): l'elenco non dice "nessuna"
 * mentre Invio la trova.
 */
export function filtraPiante(piante: Pianta[], cercato: string): Pianta[] {
  const q = normalizza(cercato)
  if (q === '') return piante
  const esatta = trovaPianta(piante, cercato)
  return piante.filter(p => p === esatta || normalizza(p.etichetta).includes(q))
}
