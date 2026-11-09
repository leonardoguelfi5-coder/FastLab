import { useQuery } from '@tanstack/react-query'
import { ruoloIn } from '@/api/persone'
import type { Ruolo } from '@/domain/ruoli'
import { chiavi } from '@/api/query'
import { DURATA_IN_MEMORIA_MS } from './cachePersistente'

export interface StatoRuolo {
  /** Il ruolo di chi guarda, `null` se non è membro, se non lo si è ancora letto o se la lettura è fallita. */
  ruolo: Ruolo | null
  /** Proprietario o rilevatore: crea misure, note e foto (e corregge le proprie). */
  puoScrivere: boolean
  /** Solo il proprietario: configurazione, stato, archivio, eliminazione, Persone, e i dati degli altri. */
  puoConfigurare: boolean
  /** Vero finché non c'è un ruolo da mostrare (né in memoria né dalla copia sul telefono). */
  caricamento: boolean
}

/**
 * Il ruolo nell'esperimento (Piano E, Task E9), per nascondere e dire a parole ciò che il ruolo non permette. La guardia
 * vera è il database: finché il ruolo non si conosce non si offre nessun permesso, e l'interfaccia aspetta
 * (`caricamento`) invece di dire "Solo lettura". La chiave sta sotto la configurazione (invalidarla rilegge anche il
 * ruolo) ed è nell'elenco chiuso della copia sul telefono: senza rete il lettore resta lettore.
 */
export function useRuolo(espId: string | undefined): StatoRuolo {
  const q = useQuery({
    queryKey: chiavi.ruolo(espId ?? ''),
    queryFn: () => ruoloIn(espId as string),
    enabled: !!espId,
    gcTime: DURATA_IN_MEMORIA_MS,
  })
  const ruolo = q.data ?? null
  return {
    ruolo,
    puoScrivere: ruolo === 'proprietario' || ruolo === 'rilevatore',
    puoConfigurare: ruolo === 'proprietario',
    caricamento: !!espId && q.isPending,
  }
}
