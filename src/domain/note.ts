import type { ConfigEsperimento, Nota, Pianta } from './tipi'

/**
 * Una nota salvata con una data dopo oggi è un promemoria. Si confrontano le date locali AAAA-MM-GG come testo (con
 * zeri a sinistra l'ordine alfabetico è quello del calendario): niente `Date`, quindi nessun fuso né ora legale.
 * `oggi` lo passa chi chiama (`oggiLocale()`), così a mezzanotte il giorno cambia insieme all'app.
 */
export function ePromemoriaAlSalvataggio(data: string, oggi: string): boolean {
  return data > oggi
}

/**
 * I promemoria da mostrare in Oggi: con data di oggi o passata e non ancora fatti. Un promemoria scaduto resta finché
 * non lo si spunta (non sparisce da solo). I più vecchi per primi; a parità di data resta l'ordine di ingresso.
 */
export function promemoriaDelGiorno(note: Nota[], oggi: string): Nota[] {
  return note
    .filter(n => n.promemoria && n.fatto_il === null && n.data <= oggi)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
}

/**
 * Le note che riguardano una pianta: collegate a lei, al suo trattamento, oppure a tutto l'esperimento (nessun
 * collegamento). L'ordine è quello dell'elenco dato.
 */
export function noteDellaPianta(note: Nota[], pianta: Pianta): Nota[] {
  return note.filter(n => {
    const aTutto = n.pianta_ids.length === 0 && n.trattamento_ids.length === 0
    return aTutto || n.pianta_ids.includes(pianta.id) || n.trattamento_ids.includes(pianta.trattamento_id)
  })
}

const plurale = (n: number, uno: string, molti: string): string => `${n} ${n === 1 ? uno : molti}`

/**
 * A cosa è collegata una nota, a parole: "Tutto l'esperimento", "S1 + HC, W1" (le etichette dei trattamenti),
 * "Piante 3, 12". Le etichette seguono l'ordine della configurazione, non quello in cui si è scelto. Se la
 * configurazione non contiene i collegamenti (non dovrebbe: il database non lascia eliminare piante o trattamenti con
 * note) si contano, invece di mostrare un elenco vuoto.
 */
export function descriviCollegamento(
  nota: Nota,
  config: Pick<ConfigEsperimento, 'trattamenti' | 'piante'>,
): string {
  const parti: string[] = []

  if (nota.trattamento_ids.length > 0) {
    const scelti = new Set(nota.trattamento_ids)
    const etichette = config.trattamenti.filter(t => scelti.has(t.id)).map(t => t.etichetta)
    parti.push(etichette.length > 0 ? etichette.join(', ') : plurale(scelti.size, 'trattamento', 'trattamenti'))
  }

  if (nota.pianta_ids.length > 0) {
    const scelte = new Set(nota.pianta_ids)
    const etichette = config.piante.filter(p => scelte.has(p.id)).map(p => p.etichetta)
    parti.push(etichette.length === 0
      ? plurale(scelte.size, 'pianta', 'piante')
      : `${etichette.length === 1 ? 'Pianta' : 'Piante'} ${etichette.join(', ')}`)
  }

  return parti.length > 0 ? parti.join(' · ') : 'Tutto l\'esperimento'
}
