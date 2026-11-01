import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { eliminaFoto } from '@/api/foto'
import { chiavi } from '@/api/query'
import { reinserisciFoto, senzaFoto } from '@/domain/foto'
import type { Foto } from '@/domain/tipi'
import { eliminaConAnnulla } from '@/lib/eliminaConAnnulla'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'

/** La chiave con cui una foto in attesa di eliminazione è nota a `inEliminazione` (per chi rilegge l'elenco). */
export const chiaveEliminazioneFoto = (id: string): string => `foto:${id}`

/**
 * Elimina una foto con "Annulla" (Piano C, Decisione 4), come `eliminaNotaConAnnulla`. La foto esce subito dalla
 * galleria in cache e vi rientra, nello stesso punto, se si annulla o se l'eliminazione vera fallisce; il database e lo
 * Storage non si toccano prima di 5 secondi. Allo scadere si toglie prima la riga e poi il file.
 *
 * La riga è l'unica cosa certa: se il file non si toglie la foto è comunque sparita, e un avviso (non verde) dice che il
 * file è rimasto. Quando il file risulta tolto non si scrive nulla di più: una rimozione di un file che non c'è non dà errore.
 */
export function eliminaFotoConAnnulla(queryClient: QueryClient, espId: string, foto: Foto): void {
  const chiave = chiavi.foto(espId)
  // Una lettura già partita potrebbe riportare la foto e farla sembrare "non eliminata" mentre sta per esserlo.
  void queryClient.cancelQueries({ queryKey: chiave })
  const indice = queryClient.getQueryData<Foto[]>(chiave)?.findIndex(f => f.id === foto.id) ?? -1
  let fileRimosso = true

  eliminaConAnnulla({
    chiave: chiaveEliminazioneFoto(foto.id),
    messaggio: 'Foto eliminata.',
    fallita: 'La foto non è stata eliminata',
    nascondi: () => queryClient.setQueryData<Foto[]>(chiave, corrente => corrente && senzaFoto(corrente, foto.id)),
    ripristina: () => {
      // Solo se l'elenco c'è in cache: dopo un'uscita dall'account (cache svuotata) non si ricrea nulla.
      queryClient.setQueryData<Foto[]>(chiave, corrente => corrente && reinserisciFoto(corrente, foto, indice))
      void queryClient.invalidateQueries({ queryKey: chiave })
    },
    elimina: async () => { fileRimosso = (await eliminaFoto(espId, foto)).fileRimosso },
    dopo: () => {
      // Il prefisso `foto` rilegge anche lo spazio occupato.
      void queryClient.invalidateQueries({ queryKey: chiave })
      if (!fileRimosso) {
        toast.warning('Foto eliminata, ma il suo file è rimasto nello spazio delle foto.', OPZIONI_ERRORE_TARDIVO)
      }
    },
  })
}
