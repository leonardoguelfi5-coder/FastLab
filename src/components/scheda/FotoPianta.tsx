import { useId, useMemo } from 'react'
import { useFoto, useUrlFoto } from '@/api/query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { AggiungiFoto } from '@/components/foto/AggiungiFoto'
import { chiaveEliminazioneFoto } from '@/components/foto/eliminaFotoConAnnulla'
import { FotoConVisore } from '@/components/foto/FotoConVisore'
import { fotoDellaPianta } from '@/domain/foto'
import type { ConfigEsperimento } from '@/domain/tipi'
import { inEliminazione } from '@/lib/eliminaConAnnulla'

interface FotoPiantaProps {
  espId: string
  config: ConfigEsperimento
  piantaId: string
}

/**
 * La sezione «Foto» della scheda della pianta: le sue miniature (il tocco apre il visore) e «Aggiungi foto», che
 * collega le nuove foto a questa pianta. Le foto non dipendono dalle misure: la sezione ha il suo stato di lettura, e
 * un errore qui non nasconde il resto della scheda.
 */
export function FotoPianta({ espId, config, piantaId }: FotoPiantaProps) {
  const id = useId()
  const foto = useFoto(espId)
  // Le foto in attesa di eliminazione restano fuori anche se l'elenco viene riletto dal server nei 5 secondi.
  const della = useMemo(
    () => fotoDellaPianta((foto.data ?? []).filter(f => !inEliminazione(chiaveEliminazioneFoto(f.id))), piantaId),
    [foto.data, piantaId],
  )
  const urls = useUrlFoto(useMemo(() => della.filter(f => !f.archiviata).map(f => f.percorso), [della])).data

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Foto</h3>
      {foto.data === undefined ? (
        foto.isError
          ? <ErroreConRiprova errore={foto.error} onRiprova={() => void foto.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento delle foto…</p>
      ) : della.length === 0 ? (
        <p className="text-grafite-tenue">Ancora nessuna foto per questa pianta.</p>
      ) : (
        <FotoConVisore espId={espId} config={config} foto={della} urls={urls} nome="Foto della pianta" />
      )}
      <AggiungiFoto espId={espId} piantaId={piantaId} />
    </section>
  )
}
