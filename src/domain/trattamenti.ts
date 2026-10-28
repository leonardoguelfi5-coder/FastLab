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
