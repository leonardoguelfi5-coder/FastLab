import { useCallback, useContext, useSyncExternalStore } from 'react'
import { QueryClientContext, type QueryClient } from '@tanstack/react-query'
import { CloudOff } from 'lucide-react'
import { ePersistente } from '@/lib/cachePersistente'
import { formattaGiornoMese, oggiLocale, oraLocale } from '@/lib/date'
import { useSenzaRete } from '@/lib/useSenzaRete'

/**
 * Quando è stata letta dal server la più vecchia delle letture che la pagina mostra adesso, tra quelle della copia sul
 * telefono (configurazione, giro, piante: `ePersistente`), o `null` se la pagina non ne mostra. Un numero: lo stesso
 * finché non cambia, come vuole `useSyncExternalStore`.
 */
function lettaIl(client: QueryClient | undefined): number | null {
  if (!client) return null
  let piuVecchia: number | null = null
  for (const q of client.getQueryCache().getAll()) {
    if (q.getObserversCount() === 0 || q.state.data === undefined || q.state.dataUpdatedAt <= 0 || !ePersistente(q.queryKey)) continue
    if (piuVecchia === null || q.state.dataUpdatedAt < piuVecchia) piuVecchia = q.state.dataUpdatedAt
  }
  return piuVecchia
}

/**
 * Sotto la barra in alto, senza rete (Piano E, Task E7): i dati che si vedono sono quelli letti l'ultima volta, e la
 * riga dice quando: `Senza rete: dati letti il 04/11 alle 09:12.` Fuori da un `QueryClientProvider` non c'è.
 */
export function RigaSenzaRete() {
  const client = useContext(QueryClientContext)
  const senzaRete = useSenzaRete()
  const iscriviti = useCallback((avvisa: () => void) => client?.getQueryCache().subscribe(avvisa) ?? (() => {}), [client])
  const leggi = useCallback(() => lettaIl(client), [client])
  const letta = useSyncExternalStore(iscriviti, leggi, leggi)
  if (!senzaRete || letta === null) return null
  const quando = new Date(letta)
  return (
    <p role="status" className="mx-auto flex max-w-lg items-center gap-2 px-4 pb-2 text-sm text-grafite-tenue">
      <CloudOff aria-hidden className="size-4 shrink-0" />
      <span>{`Senza rete: dati letti il ${formattaGiornoMese(oggiLocale(quando))} alle ${oraLocale(quando)}.`}</span>
    </p>
  )
}
