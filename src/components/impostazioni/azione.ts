import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { chiavi } from '@/api/query'
import type { ConfigEsperimento } from '@/domain/tipi'
import { messaggioErrore } from '@/lib/errori'
import { toastSalvato } from '@/lib/toastSalvato'

/** Un errore già spiegato in italiano per chi usa l'app: il toast lo mostra così com'è. */
export class ErroreDaMostrare extends Error {}

export interface Esito<T> {
  /** Il testo del toast di riuscita. */
  messaggio: string | ((risultato: T) => string)
  /** Un'eliminazione o un'archiviazione: toast neutro, il segno verde è dei salvataggi (DESIGN.md). */
  neutro?: boolean
  /** La configurazione in cache come è dopo l'operazione: la pagina la mostra subito, prima di rileggerla. */
  aggiorna?: (config: ConfigEsperimento, risultato: T) => ConfigEsperimento
}

/**
 * Le operazioni di una sezione delle impostazioni, una alla volta: mentre una è in corso `inCorso` disabilita i pulsanti
 * (il ref ferma subito anche il doppio tocco). Ogni esito ha il suo toast; un errore lascia i valori dove sono. Dopo,
 * riuscita o no, si rileggono la configurazione (con i parametri e le piante con dati) e l'elenco degli esperimenti.
 */
export function useAzione(espId: string) {
  const queryClient = useQueryClient()
  const [inCorso, setInCorso] = useState(false)
  const blocco = useRef(false)

  const esegui = useCallback(async <T>(operazione: () => Promise<T>, esito: Esito<T>): Promise<boolean> => {
    if (blocco.current) return false
    blocco.current = true
    setInCorso(true)
    try {
      const risultato = await operazione()
      const { aggiorna } = esito
      if (aggiorna) {
        queryClient.setQueryData<ConfigEsperimento>(chiavi.config(espId), c => (c ? aggiorna(c, risultato) : c))
      }
      const testo = typeof esito.messaggio === 'function' ? esito.messaggio(risultato) : esito.messaggio
      if (esito.neutro) toast.success(testo)
      else toastSalvato(testo)
      return true
    } catch (e) {
      toast.error(e instanceof ErroreDaMostrare ? e.message : messaggioErrore(e))
      return false
    } finally {
      blocco.current = false
      setInCorso(false)
      void queryClient.invalidateQueries({ queryKey: chiavi.config(espId) })
      void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
    }
  }, [espId, queryClient])

  return { inCorso, esegui }
}
