import { Navigate, useParams } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { useConfig, useMisurePianta } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { RiquadroOggi } from '@/components/scheda/RiquadroOggi'
import { StoriaPianta } from '@/components/scheda/StoriaPianta'
import { Badge } from '@/components/ui/badge'
import { piantaSuccessiva } from '@/domain/piante'
import type { ConfigEsperimento, Misura } from '@/domain/tipi'
import { percorsoCampo } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

const Caricamento = () => <p role="status" className="text-grafite-tenue">Caricamento…</p>

interface SchedaCaricataProps {
  espId: string
  config: ConfigEsperimento
  piantaId: string
  passataId: string
  dataRilievo: string
  oggi: string
  misure: UseQueryResult<Misura[]>
}

/** La scheda a configurazione caricata: intestazione della pianta, riquadro di oggi e storia. */
function SchedaCaricata({ espId, config, piantaId, passataId, dataRilievo, oggi, misure }: SchedaCaricataProps) {
  const pianta = config.piante.find(p => p.id === piantaId)
  const passata = config.passate.find(p => p.id === passataId)
  // Una passata scelta e poi cancellata dalle impostazioni è come nessuna scelta: si torna a sceglierla.
  if (!passata) return <Navigate to={percorsoCampo(espId)} replace />
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
        <BannerData espId={espId} />
      </div>

      {/* Senza la storia della pianta i progressivi (es. i palchi) partirebbero da vuoti: il modulo aspetta le misure. */}
      {misure.data === undefined ? (
        misure.isError
          ? <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
          : <Caricamento />
      ) : (
        <>
          <RiquadroOggi
            espId={espId}
            config={config}
            pianta={pianta}
            passata={passata}
            misure={misure.data}
            dataRilievo={dataRilievo}
            oggi={oggi}
            successiva={piantaSuccessiva(config.piante, pianta.id)}
          />
          <StoriaPianta espId={espId} config={config} misure={misure.data} />
        </>
      )}
    </>
  )
}

/**
 * Scheda della pianta: si inseriscono i valori di oggi per la passata scelta nella schermata in campo e si passa
 * alla pianta successiva; sotto, la storia. Vale anche per gli esperimenti conclusi: i dati restano modificabili.
 */
export function SchedaPianta() {
  const { espId = '', piantaId = '' } = useParams()
  const config = useConfig(espId)
  // Si carica insieme alla configurazione, non dopo.
  const misure = useMisurePianta(piantaId)
  const oggi = useOggi()
  const { passataId, dataRilievo } = useCampoStore(s => s.dati(espId, oggi))

  // La scheda serve a inserire i valori di una passata: senza, si torna a sceglierla.
  if (!passataId) return <Navigate to={percorsoCampo(espId)} replace />

  const dati = config.data
  return (
    <AppShell titolo={dati?.esperimento.nome ?? 'Esperimento'} indietro={percorsoCampo(espId)}>
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
          passataId={passataId}
          dataRilievo={dataRilievo}
          oggi={oggi}
          misure={misure}
        />
      )}
    </AppShell>
  )
}
