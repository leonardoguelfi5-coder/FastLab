import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { useCatalogo } from '@/api/query'
import { SceltaDalCatalogo } from '@/components/config/SceltaDalCatalogo'
import { Espandibile } from '@/components/Espandibile'
import { TestoErrore } from '@/components/TestoErrore'
import { Button, buttonVariants } from '@/components/ui/button'
import { strumentoDaCatalogo } from '@/domain/catalogo'
import type { ConfigEsperimento, Parametro, Strumento, VoceCatalogo } from '@/domain/tipi'
import { percorsoCatalogo } from '@/lib/percorsi'
import { ModificaStrumento } from './ModificaStrumento'
import { NuovoStrumento } from './NuovoStrumento'
import { ParametriArchiviati } from './ParametriArchiviati'
import { AvvisoDati, Sezione, Spiegazione } from './Sezione'
import { StrumentiArchiviati } from './StrumentiArchiviati'
import { ValoriSenzaStrumento } from './ValoriSenzaStrumento'
import { useStrumenti } from './useStrumenti'

interface SezioneStrumentiProps {
  espId: string
  config: ConfigEsperimento
  datiParametri: UseQueryResult<Set<string>>
  datiStrumenti: UseQueryResult<Set<string>>
}

/**
 * Gli strumenti dell'esperimento, uno alla volta in un editor che si apre con i suoi valori e il proprio "Salva". Si
 * aggiungono dal catalogo o si creano nuovi (e allora entrano anche nel catalogo). Uno strumento con misure si archivia;
 * senza misure si può anche eliminare, con i valori che ha. La tabella fenologica ha la sua sezione.
 */
export function SezioneStrumenti({ espId, config, datiParametri, datiStrumenti }: SezioneStrumentiProps) {
  const g = useStrumenti({ espId, config, tipo: 'strumento', chiave: 'strumenti', datiParametri, datiStrumenti })
  const catalogo = useCatalogo()
  const [dalCatalogo, setDalCatalogo] = useState(false)
  const [nuovo, setNuovo] = useState(false)
  // Lo strumento aggiunto senza collegamento al catalogo.
  const [avviso, setAvviso] = useState<string | null>(null)

  // Le voci già nell'esperimento non si aggiungono due volte, archiviate comprese.
  const gia = new Set(config.strumenti.flatMap(s => (s.catalogo_id ? [s.catalogo_id] : [])))
  const archiviati = config.parametri.filter(p => p.archiviato)
  // Valori attivi fuori da ogni strumento (restano dalla v2, dove un parametro poteva non stare in nessuno): non si misurano.
  // Quelli di una bozza non ancora salvata non contano: lo strumento li collega al "Salva".
  const collegati = new Set([
    ...config.strumenti.flatMap(s => s.parametri.map(pp => pp.parametro_id)),
    ...g.voci.flatMap(v => v.parametri.map(p => p.id)),
  ])
  const senzaStrumento = config.parametri.filter(p => !p.archiviato && !collegati.has(p.id))

  function aggiungiDaCatalogo(voce: VoceCatalogo) {
    setAvviso(null)
    setDalCatalogo(false)
    const { strumento, parametri } = strumentoDaCatalogo(voce, 0)
    void g.aggiungi(strumento, parametri)
  }

  function aggiungiNuovo(strumento: Strumento, parametri: Parametro[], errore: string | null) {
    setAvviso(errore)
    setNuovo(false)
    setDalCatalogo(false)
    void g.aggiungi(strumento, parametri)
  }

  return (
    <Sezione titolo="Strumenti">
      <Spiegazione>
        Uno strumento raggruppa i valori che rilevi insieme in campo, e si modifica qui con i suoi valori. Un valore con
        dati non si elimina: si archivia, e i suoi dati restano nella storia e nell'export. Uno strumento con misure si
        archivia; senza misure si può anche eliminare.
      </Spiegazione>
      <AvvisoDati letture={[datiParametri, datiStrumenti]} />

      <ul aria-label="Strumenti dell'esperimento" className="-mx-4 flex flex-col border-t border-riga empty:hidden">
        {g.voci.map(voce => {
          const valori = voce.parametri.map(p => p.nome.trim() || 'senza nome')
          return (
            <Espandibile
              key={voce.id}
              titolo={[voce.strumento.icona, voce.strumento.nome.trim() || 'Senza nome'].filter(Boolean).join(' ')}
              riassunto={valori.length === 0 ? 'Nessun valore' : valori.join(' · ')}
              nota={g.salvato(voce.id) === undefined ? 'Non salvato' : g.modificato(voce) ? 'Modifiche non salvate' : undefined}
              aperto={g.aperta === voce.id}
              onCambia={() => g.setAperta(g.aperta === voce.id ? null : voce.id)}
            >
              <ModificaStrumento g={g} voce={voce} />
            </Espandibile>
          )
        })}
      </ul>
      {g.voci.length === 0 && <p className="text-sm text-grafite-tenue">Nessuno strumento ancora.</p>}
      {avviso && (
        <div role="alert" className="flex flex-col gap-1">
          <TestoErrore className="text-base">{avviso}</TestoErrore>
          <p className="text-sm text-grafite-tenue">Lo strumento è comunque nell'esperimento, ma non è collegato al catalogo.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" aria-expanded={dalCatalogo} onClick={() => setDalCatalogo(a => !a)}>+ Aggiungi dal catalogo</Button>
        <Link to={percorsoCatalogo} className={buttonVariants({ variant: 'ghost' })}>Gestisci il catalogo</Link>
      </div>
      {dalCatalogo && (
        <SceltaDalCatalogo
          voci={catalogo.data}
          errore={catalogo.isError ? catalogo.error : undefined}
          onRiprova={() => void catalogo.refetch()}
          gia={gia}
          onAggiungi={aggiungiDaCatalogo}
          onNuovo={() => { setAvviso(null); setNuovo(true) }}
        />
      )}
      {dalCatalogo && nuovo && <NuovoStrumento config={config} onAggiungi={aggiungiNuovo} onAnnulla={() => setNuovo(false)} />}

      <ValoriSenzaStrumento
        valori={senzaStrumento}
        conDati={datiParametri.data}
        inCorso={g.inCorso}
        onArchivia={p => void g.archiviaValore(null, p)}
      />

      <StrumentiArchiviati archiviati={g.archiviati} parametri={config.parametri} inCorso={g.inCorso} onRipristina={g.ripristina} />
      <ParametriArchiviati archiviati={archiviati} strumenti={config.strumenti} inCorso={g.inCorso} onRipristina={g.ripristinaValore} />
    </Sezione>
  )
}
