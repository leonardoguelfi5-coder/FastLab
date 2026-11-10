import type { QueryClient } from '@tanstack/react-query'
import { segnaFatto } from '@/api/note'
import { chiavi } from '@/api/query'
import type { Nota } from '@/domain/tipi'
import { eliminaConAnnulla } from '@/lib/eliminaConAnnulla'

/**
 * La chiave con cui un promemoria spuntato in attesa è nota a `inEliminazione`: distinta da quella dell'eliminazione
 * della nota (`nota:<id>`), perché sono due operazioni diverse sulla stessa nota.
 */
export const chiaveSpuntaPromemoria = (id: string): string => `spunta:${id}`

/**
 * Segna fatto un promemoria dalla pagina Oggi, con "Annulla" per 5 secondi (stesso schema dell'eliminazione, Piano C
 * Decisione 4). Il promemoria esce subito dall'elenco (in cache la nota risulta fatta); il database non si tocca prima
 * dei 5 secondi. Annullando, o se il salvataggio vero fallisce, la nota torna da fare e l'errore resta in vista.
 * La lettura già in corso dell'elenco si ferma: partita prima della spunta, riporterebbe il promemoria tra quelli da fare.
 */
export function spuntaPromemoriaConAnnulla(queryClient: QueryClient, espId: string, nota: Nota): void {
  const chiave = chiavi.note(espId)
  void queryClient.cancelQueries({ queryKey: chiave })
  const imposta = (fatto_il: string | null) =>
    queryClient.setQueryData<Nota[]>(chiave, corrente => corrente?.map(n => (n.id === nota.id ? { ...n, fatto_il } : n)))

  eliminaConAnnulla({
    chiave: chiaveSpuntaPromemoria(nota.id),
    messaggio: 'Promemoria fatto.',
    fallita: 'Il promemoria non è stato segnato come fatto',
    nascondi: () => imposta(new Date().toISOString()),
    ripristina: () => {
      imposta(nota.fatto_il)
      void queryClient.invalidateQueries({ queryKey: chiave })
    },
    // Dopo il salvataggio la cache si riscrive come "fatta": una rilettura arrivata durante i 5 secondi (prima del
    // salvataggio) l'avrebbe riportata da fare, e il promemoria ricomparirebbe in Oggi finché non si rilegge di nuovo.
    elimina: async () => { await segnaFatto(espId, nota.id, true); imposta(new Date().toISOString()) },
    dopo: () => void queryClient.invalidateQueries({ queryKey: chiave }),
  })
}
