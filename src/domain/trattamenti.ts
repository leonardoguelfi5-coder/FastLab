import type { Fattore, Trattamento } from './tipi'

/**
 * Prodotto cartesiano dei livelli dei fattori: il primo fattore varia più lentamente.
 * L'etichetta unisce i nomi dei livelli con " + ". Con zero fattori (o un fattore
 * senza livelli) non c'è nessuna combinazione e il risultato è vuoto.
 */
export function generaTrattamenti(fattori: Fattore[]): Trattamento[] {
  if (fattori.length === 0) return []
  const combinazioni = fattori.reduce<Fattore['livelli'][]>(
    (acc, f) => acc.flatMap(prefisso => f.livelli.map(l => [...prefisso, l])),
    [[]],
  )
  return combinazioni.map((livelli, ordine) => ({
    id: crypto.randomUUID(),
    etichetta: livelli.map(l => l.nome).join(' + '),
    ordine,
    livello_ids: livelli.map(l => l.id),
  }))
}

const normalizza = (s: string) => s.trim().toLowerCase()

/**
 * Il problema dell'etichetta `testo` scritta per il trattamento `t`, o null se va bene: non vuota e unica tra
 * `trattamenti` (senza badare a spazi e maiuscole; `t` stesso non conta). Vale nella procedura e nelle impostazioni.
 */
export function problemaEtichettaTrattamento(t: Trattamento, testo: string, trattamenti: Trattamento[]): string | null {
  if (testo.trim() === '') return 'Manca l\'etichetta.'
  if (trattamenti.some(x => x.id !== t.id && normalizza(x.etichetta) === normalizza(testo))) {
    return 'C\'è già un trattamento con questa etichetta.'
  }
  return null
}
