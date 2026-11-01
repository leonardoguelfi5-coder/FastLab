import { useId, useMemo } from 'react'
import { useFoto, useUrlFoto } from '@/api/query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { AggiungiFoto } from '@/components/foto/AggiungiFoto'
import { chiaveEliminazioneFoto } from '@/components/foto/eliminaFotoConAnnulla'
import { FotoConVisore } from '@/components/foto/FotoConVisore'
import { fotoDellaNota } from '@/domain/foto'
import type { ConfigEsperimento } from '@/domain/tipi'
import { inEliminazione } from '@/lib/eliminaConAnnulla'

interface FotoNotaProps {
  espId: string
  config: ConfigEsperimento
  /** La nota già salvata a cui collegare le foto; null per una nota nuova, che nel database ancora non c'è. */
  notaId: string | null
}

/**
 * Le foto di una nota nell'editor: le sue miniature (il tocco apre il visore) e «Aggiungi foto». Una nota nuova non
 * esiste ancora nel database e il collegamento di una foto la richiederebbe (chiave esterna): si salva prima la nota.
 * Le foto si caricano subito, senza passare dal «Salva» della nota: non cambiano il testo né la bozza.
 */
export function FotoNota({ espId, config, notaId }: FotoNotaProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Foto</h3>
      {notaId === null
        ? <p className="text-sm text-grafite-tenue">Salva la nota: poi potrai aggiungerle delle foto.</p>
        : <FotoDellaNota espId={espId} config={config} notaId={notaId} />}
    </section>
  )
}

function FotoDellaNota({ espId, config, notaId }: FotoNotaProps & { notaId: string }) {
  const foto = useFoto(espId)
  // Le foto in attesa di eliminazione restano fuori anche se l'elenco viene riletto dal server nei 5 secondi.
  const della = useMemo(
    () => fotoDellaNota((foto.data ?? []).filter(f => !inEliminazione(chiaveEliminazioneFoto(f.id))), notaId),
    [foto.data, notaId],
  )
  const urls = useUrlFoto(useMemo(() => della.filter(f => !f.archiviata).map(f => f.percorso), [della])).data

  return (
    <>
      {foto.data === undefined ? (
        foto.isError
          ? <ErroreConRiprova errore={foto.error} onRiprova={() => void foto.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento delle foto…</p>
      ) : della.length > 0 && (
        <FotoConVisore espId={espId} config={config} foto={della} urls={urls} nome="Foto della nota" />
      )}
      <AggiungiFoto espId={espId} notaId={notaId} />
    </>
  )
}
