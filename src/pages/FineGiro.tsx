import { useId, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig, useMisureGiorno } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { BarraAzioni } from '@/components/BarraAzioni'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { AvvisoGiro } from '@/components/scheda/AvvisoGiro'
import type { ArrivoScheda } from '@/components/scheda/ModuloOggi'
import { Button } from '@/components/ui/button'
import { riepilogoGiro, statiPiante } from '@/domain/giro'
import type { ConfigEsperimento, Misura, Strumento } from '@/domain/tipi'
import { percorsoMisura, percorsoNuovaMisura } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

const Caricamento = () => <p role="status" className="text-grafite-tenue">Caricamento…</p>

/** Il riepilogo del giro, a misure del giorno arrivate: senza, ogni pianta risulterebbe da fare. */
function Riepilogo({ espId, config, strumento, misure }: { espId: string; config: ConfigEsperimento; strumento: Strumento; misure: Misura[] }) {
  const navigate = useNavigate()
  const idTitolo = useId()
  const { fatte, totale, mancanti, incomplete } = useMemo(
    () => riepilogoGiro(config.piante, statiPiante(strumento, config.parametri, misure, config.piante)),
    [config, strumento, misure],
  )
  const incompleta = new Set(incomplete.map(p => p.id))
  const scegliAltro = () => navigate(percorsoNuovaMisura(espId))
  // Come dopo "Salva e vai": si continua a misurare (il cursore nel primo campo), e i pulsanti della pianta compaiono
  // dove c'era questo, quindi un doppio tocco non salva niente al posto di chi rileva.
  const vaiAlleMancanti = () => {
    const arrivo: ArrivoScheda = { primoCampo: true }
    navigate(percorsoMisura(espId, strumento.id, mancanti[0].id), { state: arrivo })
  }

  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={idTitolo} className="text-headline text-grafite">
          {strumento.icona && <span aria-hidden>{`${strumento.icona} `}</span>}
          {`${strumento.nome}: `}
          <span className="font-mono tabular-nums">{`${fatte}/${totale}`}</span>
        </h2>
        {mancanti.length > 0 ? (
          <p className="text-grafite">{`Mancano ${mancanti.map(p => p.etichetta).join(', ')}`}</p>
        ) : (
          <p className="text-grafite">Giro completo: tutte le piante sono misurate.</p>
        )}
      </div>

      {mancanti.length > 0 && (
        <ul aria-label="Piante mancanti" className="-mx-4 flex flex-col">
          {mancanti.map(p => (
            <li key={p.id} className="border-b border-riga first:border-t">
              <Link
                to={percorsoMisura(espId, strumento.id, p.id)}
                className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
              >
                <span className="flex-1">
                  <span className="font-mono text-dato text-grafite tabular-nums">{p.etichetta}</span>
                  {incompleta.has(p.id) && <>{' '}<span className="font-mono text-label text-grafite-tenue">incompleta</span></>}
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BarraAzioni>
        {mancanti.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" className="grow" onClick={scegliAltro}>Scegli un altro strumento</Button>
            {/* La prima mancante: se è incompleta, la misura chiede se correggere o aggiungere. */}
            <Button size="lg" className="grow-3 basis-52" onClick={vaiAlleMancanti}>
              Vai alle mancanti
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={scegliAltro}>Scegli un altro strumento</Button>
        )}
      </BarraAzioni>
    </section>
  )
}

/** Fine del giro di uno strumento alla data di rilievo: quante piante sono fatte e quali mancano. */
export function FineGiro() {
  const { espId = '', strumentoId = '' } = useParams()
  const config = useConfig(espId)
  const oggi = useOggi()
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  const misure = useMisureGiorno(espId, dataRilievo)

  const dati = config.data
  const strumento = dati?.strumenti.find(s => s.id === strumentoId)

  return (
    <AppShell titolo="Fine giro" indietro={percorsoNuovaMisura(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : !strumento ? (
        <AvvisoGiro espId={espId} testo="Questo strumento non esiste in questo esperimento." />
      ) : strumento.archiviato ? (
        <AvvisoGiro espId={espId} testo={`Lo strumento «${strumento.nome}» è archiviato: non si misura più.`} />
      ) : (
        <>
          <BannerData espId={espId} />
          {misure.data === undefined ? (
            misure.isError
              ? <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
              : <Caricamento />
          ) : (
            <Riepilogo espId={espId} config={dati} strumento={strumento} misure={misure.data} />
          )}
        </>
      )}
    </AppShell>
  )
}
