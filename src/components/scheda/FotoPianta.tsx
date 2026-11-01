import { useId } from 'react'
import { AggiungiFoto } from '@/components/foto/AggiungiFoto'

interface FotoPiantaProps {
  espId: string
  piantaId: string
}

/**
 * La sezione «Foto» della scheda della pianta: solo «Aggiungi foto», che collega le nuove foto a questa pianta, con lo
 * stato dei caricamenti. Le miniature non sono qui: le foto della pianta stanno già nella Storia, per data, insieme a
 * misure e note (`StoriaPianta`); mostrarle due volte sarebbe rumore. La sezione non dipende dalle misure né dalla
 * lettura delle foto: si può aggiungere una foto anche se la storia non si legge.
 *
 * Non c'è un collegamento «Vedi nella galleria»: la galleria filtra per testo (anche «3» trova la 13), non per una
 * pianta precisa, e porterebbe a foto di altre piante.
 */
export function FotoPianta({ espId, piantaId }: FotoPiantaProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Foto</h3>
      <AggiungiFoto espId={espId} piantaId={piantaId} />
    </section>
  )
}
