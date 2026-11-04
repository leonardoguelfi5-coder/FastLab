import { Link, useParams } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { useConfig, useMisurePianta } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { AvvisiMancanti } from '@/components/scheda/AvvisiMancanti'
import { DatiPianta } from '@/components/scheda/DatiPianta'
import { FotoPianta } from '@/components/scheda/FotoPianta'
import { MisuraQuestaPianta } from '@/components/scheda/MisuraQuestaPianta'
import { StoriaPianta } from '@/components/scheda/StoriaPianta'
import { UltimiValori } from '@/components/scheda/UltimiValori'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import type { ConfigEsperimento, Misura } from '@/domain/tipi'
import { percorsoDiario, percorsoImpostazioni, percorsoPianta, percorsoPiante, type ArrivoDiario } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'

const Caricamento = () => <p role="status" className="text-grafite-tenue">Caricamento…</p>

interface SchedaCaricataProps {
  espId: string
  config: ConfigEsperimento
  piantaId: string
  oggi: string
  misure: UseQueryResult<Misura[]>
}

/** La scheda a configurazione caricata: intestazione, dati della pianta, riepilogo e avvisi, l'azione, storia, nota e foto. */
function SchedaCaricata({ espId, config, piantaId, oggi, misure }: SchedaCaricataProps) {
  const pianta = config.piante.find(p => p.id === piantaId)
  if (!pianta) return <p className="text-grafite">Questa pianta non esiste in questo esperimento.</p>

  const trattamento = config.trattamenti.find(t => t.id === pianta.trattamento_id)
  const strumentiAttivi = config.strumenti.filter(s => !s.archiviato).sort((a, b) => a.ordine - b.ordine)

  return (
    <>
      {/* Il numero della pianta è l'unico testo grande della schermata (DESIGN.md, "regola del grande unico"). */}
      <div className="flex items-end justify-between gap-3">
        <h2 className="flex min-w-0 flex-col">
          <span className="text-label text-grafite-tenue">Pianta</span>{' '}
          <span className="truncate font-mono text-numero text-grafite tabular-nums">{`#${pianta.etichetta}`}</span>
        </h2>
        {trattamento && (
          <p className="mb-1 shrink-0">
            <span className="sr-only">Trattamento: </span>
            <Badge variant="secondary" className="h-7 px-2.5 text-sm">{trattamento.etichetta}</Badge>
          </p>
        )}
      </div>

      {/* Non dipende dalle misure: si vede subito. */}
      <DatiPianta config={config} pianta={pianta} />

      {/* Riepilogo, avvisi e storia vengono dalle misure della pianta: senza, nessun numero (né finto, né vecchio). */}
      {misure.data === undefined ? (
        misure.isError
          ? <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
          : <Caricamento />
      ) : (
        <div className="flex flex-col gap-4">
          <UltimiValori espId={espId} config={config} pianta={pianta} misure={misure.data} oggi={oggi} />
          <AvvisiMancanti espId={espId} config={config} misure={misure.data} oggi={oggi} />
        </div>
      )}

      {strumentiAttivi.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-grafite-tenue">Questo esperimento non ha strumenti attivi.</p>
          <Link
            to={percorsoImpostazioni(espId)}
            className="inline-flex min-h-11 items-center font-medium text-inchiostro underline decoration-1 underline-offset-4"
          >
            Aggiungine uno dalle Impostazioni
          </Link>
        </div>
      ) : (
        <MisuraQuestaPianta espId={espId} piantaId={pianta.id} strumenti={strumentiAttivi} />
      )}

      {misure.data !== undefined && <StoriaPianta espId={espId} config={config} pianta={pianta} misure={misure.data} />}

      {/* Non dipende dalle misure: si può scrivere una nota anche se non si leggono. Porta all'editor del Diario già
          collegato a questa pianta, e a nota salvata o annullata si torna qui. */}
      <Link
        to={percorsoDiario(espId)}
        state={{ nuovaPerPianta: pianta.id, ritorno: percorsoPianta(espId, pianta.id) } satisfies ArrivoDiario}
        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
      >
        Aggiungi nota
      </Link>

      {/* Solo l'aggiunta: le foto della pianta stanno nella Storia. Non aspetta le misure. */}
      <FotoPianta espId={espId} piantaId={pianta.id} />
    </>
  )
}

/**
 * Scheda della pianta, aperta dall'elenco delle piante: i dati della pianta, il riepilogo con un blocco per strumento
 * (con il confronto, discreto, con il trattamento), gli avvisi di dati mancanti e la storia. Non si misura qui: "Misura questa
 * pianta" porta alla misura con lo strumento scelto. Vale anche per gli esperimenti conclusi: i dati restano
 * modificabili dalla storia.
 */
export function SchedaPianta() {
  const { espId = '', piantaId = '' } = useParams()
  const config = useConfig(espId)
  // Si carica insieme alla configurazione, non dopo.
  const misure = useMisurePianta(piantaId)
  // "Da quanto" conta dal giorno di calendario di oggi (ora locale), che cambia a mezzanotte.
  const oggi = useOggi()

  const dati = config.data
  return (
    <AppShell titolo={dati?.esperimento.nome ?? 'Esperimento'} indietro={percorsoPiante(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        <SchedaCaricata key={piantaId} espId={espId} config={dati} piantaId={piantaId} oggi={oggi} misure={misure} />
      )}
    </AppShell>
  )
}
