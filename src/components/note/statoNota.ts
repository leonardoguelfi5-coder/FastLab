import { ePromemoriaAlSalvataggio } from '@/domain/note'
import type { Nota } from '@/domain/tipi'

/** A cosa si collega una nota: la scelta è una sola, trattamenti e piante non si mescolano (Decisione 2). */
export type Collegamento = 'esperimento' | 'trattamenti' | 'piante'

/** Ciò che l'editor mostra e che la bozza ricorda. */
export interface StatoNota {
  testo: string
  /** AAAA-MM-GG; vuota se chi scrive l'ha cancellata (allora non si salva). */
  data: string
  collegamento: Collegamento
  /** Le due liste restano entrambe quando si cambia scelta (tornandoci non si perde nulla); si salva solo quella attiva. */
  trattamento_ids: string[]
  pianta_ids: string[]
  promemoria: boolean
  /** La casella è stata toccata a mano: da qui la data non la cambia più da sola. */
  promemoriaAMano: boolean
}

type Partenza = Partial<Pick<StatoNota, 'collegamento' | 'trattamento_ids' | 'pianta_ids'>>

/** Una nota nuova: di oggi, per tutto l'esperimento (o già collegata, es. quando si parte dalla scheda di una pianta). */
export function statoVuoto(oggi: string, partenza: Partenza = {}): StatoNota {
  return {
    testo: '', data: oggi, collegamento: 'esperimento', trattamento_ids: [], pianta_ids: [], promemoria: false, promemoriaAMano: false,
    ...partenza,
  }
}

export function statoDaNota(n: Nota): StatoNota {
  const collegamento: Collegamento = n.pianta_ids.length > 0 ? 'piante' : n.trattamento_ids.length > 0 ? 'trattamenti' : 'esperimento'
  return {
    testo: n.testo, data: n.data, collegamento, trattamento_ids: [...n.trattamento_ids], pianta_ids: [...n.pianta_ids],
    promemoria: n.promemoria, promemoriaAMano: false,
  }
}

/**
 * Il promemoria che la data suggerisce: una data dopo oggi lo spunta; altrimenti la casella torna com'era all'apertura
 * (`base`: false per una nota nuova, il valore salvato per una esistente). Solo se non è stata toccata a mano.
 */
function suggerito(data: string, oggi: string, base: boolean): boolean {
  return ePromemoriaAlSalvataggio(data, oggi) ? true : base
}

/** Cambia la data; la casella "Ricordamelo quel giorno" la segue, finché non è stata toccata a mano. */
export function conData(stato: StatoNota, data: string, oggi: string, base: boolean): StatoNota {
  return { ...stato, data, promemoria: stato.promemoriaAMano ? stato.promemoria : suggerito(data, oggi, base) }
}

/** La casella toccata a mano: da qui in poi vale la scelta, non la data. */
export function conPromemoria(stato: StatoNota, promemoria: boolean): StatoNota {
  return { ...stato, promemoria, promemoriaAMano: true }
}

/**
 * Ciò che distingue due stati ai fini del "c'è qualcosa da perdere": non conta l'ordine delle scelte, né la lista
 * dell'altra scelta, né se la casella è stata toccata (conta il suo valore).
 */
export function firma(s: StatoNota): string {
  const ids = s.collegamento === 'piante' ? s.pianta_ids : s.collegamento === 'trattamenti' ? s.trattamento_ids : []
  return JSON.stringify([s.testo, s.data, s.collegamento, [...new Set(ids)].sort(), s.promemoria])
}

/** Ciò che impedisce di salvare e che chi scrive può correggere (il testo vuoto spegne solo il pulsante). */
export function problemiNota(s: StatoNota): string[] {
  const problemi: string[] = []
  if (s.data === '') problemi.push('Scegli la data.')
  if (s.collegamento === 'trattamenti' && s.trattamento_ids.length === 0) problemi.push('Scegli almeno un trattamento.')
  if (s.collegamento === 'piante' && s.pianta_ids.length === 0) problemi.push('Scegli almeno una pianta.')
  return problemi
}

/**
 * La nota da salvare. `oggi` è il giorno al momento del salvataggio (`oggiLocale()`), non quello di quando si è
 * aperto l'editor: se nel frattempo è passata la mezzanotte, la data scelta può non essere più futura. La casella
 * toccata a mano vale sempre; altrimenti vale ciò che la data suggerisce adesso.
 */
export function notaDaStato(id: string, s: StatoNota, esistente: Nota | null, oggi: string): Nota {
  const dato = (ids: string[]) => [...new Set(ids)]
  return {
    id,
    data: s.data,
    testo: s.testo.trim(),
    promemoria: s.promemoriaAMano ? s.promemoria : suggerito(s.data, oggi, esistente?.promemoria ?? false),
    // `fatto_il` lo scrive solo la spunta (`segnaFatto`): qui si porta com'è, il salvataggio non lo tocca.
    fatto_il: esistente?.fatto_il ?? null,
    pianta_ids: s.collegamento === 'piante' ? dato(s.pianta_ids) : [],
    trattamento_ids: s.collegamento === 'trattamenti' ? dato(s.trattamento_ids) : [],
  }
}

/**
 * Un promemoria già fatto la cui data viene spostata in avanti torna da fare: la spunta di ieri non vale per un
 * giorno che deve ancora arrivare (ruling del Task C2). Prima si toglie la spunta, poi si salva la nota. Solo se la
 * data è stata davvero spostata: ritoccare il testo di un promemoria fatto con data futura non lo riapre.
 */
export function daRiaprire(esistente: Nota | null, nuova: Nota, oggi: string): boolean {
  return esistente !== null && esistente.fatto_il !== null && nuova.promemoria
    && nuova.data !== esistente.data && ePromemoriaAlSalvataggio(nuova.data, oggi)
}
