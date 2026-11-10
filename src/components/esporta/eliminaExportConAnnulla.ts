import type { QueryClient } from '@tanstack/react-query'
import { eliminaExportSalvato } from '@/api/exportSalvati'
import { chiavi } from '@/api/query'
import type { ExportSalvato } from '@/domain/tipi'
import { eliminaConAnnulla, inEliminazione } from '@/lib/eliminaConAnnulla'

/** La chiave con cui un export salvato in attesa di eliminazione è noto a `inEliminazione` (per chi rilegge l'elenco). */
export const chiaveEliminazioneExport = (id: string): string => `export:${id}`

/**
 * Gli export senza quelli in attesa di eliminazione. Il filtro è al momento del disegno e non dentro la query, come per
 * le note: una rilettura dal server nei 5 secondi non deve far riapparire ciò che sta per sparire, e "Annulla" non deve
 * lasciarlo nascosto fino alla lettura dopo.
 */
export const senzaExportInEliminazione = (salvati: ExportSalvato[]): ExportSalvato[] =>
  salvati.filter(e => !inEliminazione(chiaveEliminazioneExport(e.id)))

/**
 * Elimina un export salvato con "Annulla" per 5 secondi (Piano C, Decisione 4). La riga esce subito dall'elenco in cache
 * e vi rientra, nello stesso punto, se si annulla o se l'eliminazione vera fallisce; il database non si tocca prima.
 */
export function eliminaExportConAnnulla(queryClient: QueryClient, espId: string, salvato: ExportSalvato): void {
  const chiave = chiavi.exportSalvati(espId)
  void queryClient.cancelQueries({ queryKey: chiave })
  const indice = queryClient.getQueryData<ExportSalvato[]>(chiave)?.findIndex(e => e.id === salvato.id) ?? -1

  eliminaConAnnulla({
    chiave: chiaveEliminazioneExport(salvato.id),
    messaggio: 'Export eliminato.',
    fallita: 'L\'export non è stato eliminato',
    nascondi: () => queryClient.setQueryData<ExportSalvato[]>(chiave, corrente => corrente?.filter(e => e.id !== salvato.id)),
    ripristina: () => {
      // Solo se l'elenco c'è in cache: dopo un'uscita dall'account (cache svuotata) non si ricrea nulla.
      queryClient.setQueryData<ExportSalvato[]>(chiave, corrente => {
        if (!corrente || corrente.some(e => e.id === salvato.id)) return corrente
        const prossimo = [...corrente]
        prossimo.splice(indice < 0 ? prossimo.length : Math.min(indice, prossimo.length), 0, salvato)
        return prossimo
      })
      void queryClient.invalidateQueries({ queryKey: chiave })
    },
    elimina: () => eliminaExportSalvato(espId, salvato.id),
    dopo: () => void queryClient.invalidateQueries({ queryKey: chiave }),
  })
}
