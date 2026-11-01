import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { segnaFatto } from '@/api/note'
import { chiavi } from '@/api/query'
import type { Nota } from '@/domain/tipi'
import { messaggioErrore } from '@/lib/errori'
import { inEliminazione } from '@/lib/eliminaConAnnulla'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { chiaveSpuntaPromemoria } from './spuntaPromemoriaConAnnulla'

/** Le note con una spunta in corso: un secondo tocco mentre la prima è in viaggio non deve ripartire. */
const inCorso = new Set<string>()

/**
 * Spunta un promemoria (o toglie la spunta). Il cambio si vede subito nell'elenco in cache; se il salvataggio
 * fallisce la nota torna com'era, e solo quella (le altre modifiche all'elenco nel frattempo restano), con un errore.
 * A fine corsa l'elenco si rilegge dal server.
 */
export async function spuntaNota(queryClient: QueryClient, espId: string, nota: Nota): Promise<void> {
  if (inCorso.has(nota.id)) return
  // Un promemoria già spuntato da Oggi, con il suo "Annulla" ancora aperto: il salvataggio vero parte allo scadere, e
  // una seconda spunta da qui (che lo riaprirebbe) verrebbe scavalcata. Si decide con l'"Annulla" di quel toast, e un
  // tocco che non fa nulla in silenzio sembrerebbe rotto: si dice perché.
  if (inEliminazione(chiaveSpuntaPromemoria(nota.id))) {
    toast('Il promemoria è appena stato segnato fatto: per riaprirlo tocca «Annulla».')
    return
  }
  inCorso.add(nota.id)
  const chiave = chiavi.note(espId)
  const fatto = nota.fatto_il === null
  const imposta = (fatto_il: string | null) =>
    queryClient.setQueryData<Nota[]>(chiave, corrente => corrente?.map(n => (n.id === nota.id ? { ...n, fatto_il } : n)))
  try {
    await queryClient.cancelQueries({ queryKey: chiave })
    imposta(fatto ? new Date().toISOString() : null)
    await segnaFatto(espId, nota.id, fatto)
  } catch (e) {
    imposta(nota.fatto_il)
    toast.error(messaggioErrore(e), OPZIONI_ERRORE_TARDIVO)
  } finally {
    inCorso.delete(nota.id)
    void queryClient.invalidateQueries({ queryKey: chiave })
  }
}
