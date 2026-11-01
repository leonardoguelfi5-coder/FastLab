import { useState } from 'react'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Button } from '@/components/ui/button'
import { useFoto } from '@/api/query'
import type { ConfigEsperimento } from '@/domain/tipi'
import { scaricaArchivio } from './archivioFoto'
import { useArchivioSessione } from './archivioSessione'
import { LiberaSpazio } from './LiberaSpazio'
import { Spiegazione } from './Sezione'

type StatoScarico =
  | { tipo: 'riposo' }
  | { tipo: 'in_corso'; fatte: number; totale: number }
  | { tipo: 'errore'; errore: unknown }

/**
 * L'archivio .zip delle foto (Piano C, Decisione 5), nella sezione dello spazio: per un esperimento concluso si scaricano
 * tutte le foto in un .zip (con un `foto.csv`) e, solo dopo un download riuscito in questa sessione, si può liberare lo
 * spazio. Per uno non concluso c'è solo una riga che dice quando si può fare e dove si conclude.
 */
export function ArchivioFoto({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const foto = useFoto(espId)
  const scaricate = useArchivioSessione(s => s.scaricati[espId])
  const [stato, setStato] = useState<StatoScarico>({ tipo: 'riposo' })

  if (config.esperimento.stato !== 'concluso') {
    return (
      <Spiegazione>
        L&apos;archivio .zip delle foto e lo spazio da liberare si usano quando l&apos;esperimento è concluso. Lo segni con
        «Esperimento concluso» nella sezione Generale, qui sopra.
      </Spiegazione>
    )
  }

  const conFile = foto.data?.filter(f => !f.archiviata).length
  const nomeFile = scaricate?.nomeFile
  const inCorso = stato.tipo === 'in_corso'

  const scarica = async () => {
    setStato({ tipo: 'in_corso', fatte: 0, totale: 0 })
    try {
      await scaricaArchivio({ espId, config, onProgresso: (fatte, totale) => setStato({ tipo: 'in_corso', fatte, totale }) })
      setStato({ tipo: 'riposo' })
    } catch (errore) {
      setStato({ tipo: 'errore', errore })
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <h3 className="text-base font-medium text-grafite">Archivio .zip</h3>
      <Spiegazione>
        Scarica tutte le foto dell&apos;esperimento in un file .zip, con un foto.csv che elenca data, pianta, trattamento e nota
        di ognuna. Dopo il download puoi liberare lo spazio: i file escono dall&apos;app e le foto restano come segnaposto.
      </Spiegazione>

      {foto.isError && foto.data === undefined && <ErroreConRiprova errore={foto.error} onRiprova={() => void foto.refetch()} />}

      <Button variant="outline" disabled={inCorso || !conFile} onClick={() => void scarica()}>Scarica le foto (.zip)</Button>

      {conFile === 0 && <p role="status" className="text-sm text-grafite-tenue">Non ci sono foto da scaricare.</p>}
      {stato.tipo === 'in_corso' && (
        <p role="status" className="font-mono text-sm tabular-nums text-grafite-tenue">
          {stato.totale === 0 ? 'Preparazione…' : `Preparazione ${stato.fatte} di ${stato.totale}…`}
        </p>
      )}
      {stato.tipo === 'errore' && <ErroreConRiprova errore={stato.errore} onRiprova={() => void scarica()} />}

      {scaricate !== undefined && !inCorso && (
        <>
          <p role="status" className="text-sm text-grafite">
            {`Download completato: ${scaricate.foto === 1 ? '1 foto' : `${scaricate.foto} foto`} nel .zip (${nomeFile}).`}
          </p>
          <LiberaSpazio espId={espId} nomeEsperimento={config.esperimento.nome} quante={scaricate.ids.length} nomeFile={scaricate.nomeFile} />
        </>
      )}
    </div>
  )
}
