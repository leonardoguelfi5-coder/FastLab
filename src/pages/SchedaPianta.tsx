import { useParams } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { useConfig, useMisurePianta } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import type { StatoModulo } from '@/components/scheda/ModuloOggi'
import { RiquadroOggi } from '@/components/scheda/RiquadroOggi'
import { StoriaPianta } from '@/components/scheda/StoriaPianta'
import { useModuloProtetto } from '@/components/scheda/useModuloProtetto'
import { Badge } from '@/components/ui/badge'
import { piantaSuccessiva } from '@/domain/piante'
import type { ConfigEsperimento, Misura, Strumento } from '@/domain/tipi'
import { percorsoPiante } from '@/lib/percorsi'
import { useCampoStore } from '@/store/campo'

const Caricamento = () => <p role="status" className="text-grafite-tenue">Caricamento…</p>

/**
 * Lo strumento del riquadro di oggi: quello scelto per la misura, se è ancora attivo, altrimenti il primo attivo.
 * Non si sceglie nulla nello store: la scheda si apre dall'elenco delle piante, non da un giro di misura.
 */
function strumentoDellaScheda(config: ConfigEsperimento, sceltoId: string | null): Strumento | null {
  const attivi = config.strumenti.filter(s => !s.archiviato).sort((a, b) => a.ordine - b.ordine)
  return attivi.find(s => s.id === sceltoId) ?? attivi[0] ?? null
}

interface SchedaCaricataProps {
  espId: string
  config: ConfigEsperimento
  piantaId: string
  strumentoId: string | null
  dataRilievo: string
  oggi: string
  misure: UseQueryResult<Misura[]>
  conferma: (azione: () => void) => void
  onModifiche: (stato: StatoModulo | null) => void
}

/** La scheda a configurazione caricata: intestazione della pianta, riquadro di oggi e storia. */
function SchedaCaricata({
  espId, config, piantaId, strumentoId, dataRilievo, oggi, misure, conferma, onModifiche,
}: SchedaCaricataProps) {
  const pianta = config.piante.find(p => p.id === piantaId)
  const strumento = strumentoDellaScheda(config, strumentoId)
  if (!pianta) return <p className="text-grafite">Questa pianta non esiste in questo esperimento.</p>

  const trattamento = config.trattamenti.find(t => t.id === pianta.trattamento_id)

  return (
    <>
      <div className="flex flex-col gap-3">
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
        <BannerData espId={espId} conferma={conferma} />
      </div>

      {/* Senza la storia della pianta i progressivi (es. i palchi) partirebbero da vuoti: il modulo aspetta le misure. */}
      {misure.data === undefined ? (
        misure.isError
          ? <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
          : <Caricamento />
      ) : (
        <>
          {strumento ? (
            // Una data o uno strumento diversi sono un riquadro nuovo: una misura in correzione non passa a un altro giorno.
            <RiquadroOggi
              key={`${strumento.id}:${dataRilievo}`}
              espId={espId}
              config={config}
              pianta={pianta}
              strumento={strumento}
              misure={misure.data}
              dataRilievo={dataRilievo}
              oggi={oggi}
              successiva={piantaSuccessiva(config.piante, pianta.id)}
              conferma={conferma}
              onModifiche={onModifiche}
            />
          ) : (
            <p className="text-grafite-tenue">Questo esperimento non ha strumenti attivi: aggiungine uno dalle Impostazioni.</p>
          )}
          <StoriaPianta espId={espId} config={config} misure={misure.data} />
        </>
      )}
    </>
  )
}

/**
 * Scheda della pianta, aperta dall'elenco delle piante: si inseriscono i valori di oggi con lo strumento scelto per la
 * misura (o il primo attivo) e si passa alla pianta successiva; sotto, la storia. Vale anche per gli esperimenti
 * conclusi: i dati restano modificabili. Il giro di misura per strumento è un'altra pagina (`MisuraPianta`).
 */
export function SchedaPianta() {
  const { espId = '', piantaId = '' } = useParams()
  const config = useConfig(espId)
  // Si carica insieme alla configurazione, non dopo.
  const misure = useMisurePianta(piantaId)
  const { oggi, conferma, onModifiche, onIndietro, dialogo } = useModuloProtetto(espId)
  const { strumentoId, dataRilievo } = useCampoStore(s => s.dati(espId, oggi))

  const dati = config.data
  return (
    <AppShell
      titolo={dati?.esperimento.nome ?? 'Esperimento'}
      indietro={percorsoPiante(espId)}
      onIndietro={onIndietro(percorsoPiante(espId))}
    >
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        // Una pianta nuova è una scheda nuova: niente stato (modulo, id, "Annulla") passa da una pianta all'altra.
        <SchedaCaricata
          key={piantaId}
          espId={espId}
          config={dati}
          piantaId={piantaId}
          strumentoId={strumentoId}
          dataRilievo={dataRilievo}
          oggi={oggi}
          misure={misure}
          conferma={conferma}
          onModifiche={onModifiche}
        />
      )}
      {dialogo}
    </AppShell>
  )
}
