import type { QueryClient } from '@tanstack/react-query'
import { eliminaNota } from '@/api/note'
import { chiavi } from '@/api/query'
import { reinserisciNota, senzaNota } from '@/domain/note'
import type { Nota } from '@/domain/tipi'
import { eliminaConAnnulla, inEliminazione } from '@/lib/eliminaConAnnulla'

/** La chiave con cui una nota in attesa di eliminazione è nota a `inEliminazione` (per chi rilegge l'elenco). */
export const chiaveEliminazioneNota = (id: string): string => `nota:${id}`

/**
 * Le note senza quelle in attesa di eliminazione. Il filtro è al momento del disegno e non dentro `useNote`
 * (`select`): `select` si calcolerebbe quando "Annulla" riscrive la cache, un istante prima che la nota smetta di
 * essere "in eliminazione", e la lascerebbe nascosta fino alla lettura dopo. Lo usano il Diario, Oggi e la storia
 * della pianta: così una rilettura dal server nei 5 secondi non fa riapparire ciò che sta per sparire.
 */
export const senzaNoteInEliminazione = (note: Nota[]): Nota[] =>
  note.filter(n => !inEliminazione(chiaveEliminazioneNota(n.id)))

/**
 * Elimina una nota con "Annulla" (Piano C, Decisione 4). La nota esce subito dall'elenco in cache (aggiornamento
 * ottimistico) e vi rientra, nello stesso punto, se si annulla o se l'eliminazione vera fallisce; il database non si
 * tocca prima di 5 secondi. La lettura già in corso dell'elenco si ferma: partita prima dell'eliminazione, potrebbe
 * riportare la nota e fare apparire come "non eliminata" una nota che sta per esserlo.
 */
export function eliminaNotaConAnnulla(queryClient: QueryClient, espId: string, nota: Nota): void {
  const chiave = chiavi.note(espId)
  void queryClient.cancelQueries({ queryKey: chiave })
  const indice = queryClient.getQueryData<Nota[]>(chiave)?.findIndex(n => n.id === nota.id) ?? -1

  eliminaConAnnulla({
    chiave: chiaveEliminazioneNota(nota.id),
    messaggio: 'Nota eliminata.',
    fallita: 'La nota non è stata eliminata',
    nascondi: () => queryClient.setQueryData<Nota[]>(chiave, corrente => corrente && senzaNota(corrente, nota.id)),
    ripristina: () => {
      // Solo se l'elenco c'è in cache: dopo un'uscita dall'account (cache svuotata) non si ricrea nulla.
      queryClient.setQueryData<Nota[]>(chiave, corrente => corrente && reinserisciNota(corrente, nota, indice))
      void queryClient.invalidateQueries({ queryKey: chiave })
    },
    elimina: () => eliminaNota(espId, nota.id),
    dopo: () => void queryClient.invalidateQueries({ queryKey: chiave }),
  })
}
