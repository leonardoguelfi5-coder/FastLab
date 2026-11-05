import { useId, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useConfig, useMisureGiorno } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Caricamento } from '@/components/Caricamento'
import { BannerData } from '@/components/BannerData'
import { BarraAzioni } from '@/components/BarraAzioni'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { GrigliaPiante } from '@/components/giro/GrigliaPiante'
import { AvvisoGiro } from '@/components/scheda/AvvisoGiro'
import type { ArrivoScheda } from '@/components/scheda/ModuloOggi'
import { useAttesaArrivo } from '@/components/scheda/useAttesaArrivo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { celleGriglia, riepilogoGiro, statiPiante, valoriDiOggi } from '@/domain/giro'
import { daSistemare } from '@/domain/statistiche'
import type { ConfigEsperimento, Misura, Pianta, Strumento } from '@/domain/tipi'
import { formattaConUnita, formattaMedia } from '@/lib/numeri'
import { percorsoMisuraPianta, percorsoModificaMisura, percorsoNuovaMisura, type ArrivoMisura } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

/** "Valori di oggi": per ogni parametro numerico, una riga per trattamento, con le funzioni del Dataset. */
function ValoriDiOggi({ config, strumento, misure, data }: { config: ConfigEsperimento; strumento: Strumento; misure: Misura[]; data: string }) {
  const idTitolo = useId()
  const parametri = useMemo(() => valoriDiOggi(config, strumento, misure, data), [config, strumento, misure, data])
  const conValori = parametri.filter(x => x.righe.length > 0)
  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-3">
      <h3 id={idTitolo} className="text-label text-grafite-tenue uppercase">Valori di oggi</h3>
      {conValori.length === 0 ? (
        <p className="text-grafite-tenue">Ancora nessun valore di oggi.</p>
      ) : conValori.map(({ parametro, righe }) => (
        <table key={parametro.id} className="w-full text-dato">
          <caption className="pb-1 text-left text-base text-grafite">
            {parametro.nome === strumento.nome ? parametro.unita ?? parametro.nome : `${parametro.nome}${parametro.unita ? ` (${parametro.unita})` : ''}`}
          </caption>
          <thead>
            <tr className="border-b border-riga text-label text-grafite-tenue">
              <th scope="col" className="py-1 text-left font-normal">Trattamento</th>
              <th scope="col" colSpan={3} className="py-1 text-right font-mono font-normal">media ± ES (n)</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(r => (
              <tr key={r.trattamento.id} className="border-b border-riga">
                <th scope="row" className="min-h-11 py-2.5 pr-3 text-left font-mono font-[550] text-grafite tabular-nums">{r.trattamento.etichetta}</th>
                <td className="py-2.5 text-right font-mono text-grafite tabular-nums">{formattaMedia(r.media)}</td>
                {/* Con una sola pianta l'errore standard non esiste: la cella resta vuota, e lo dice a chi non vede. */}
                <td className="py-2.5 pl-2 text-right font-mono text-grafite-tenue tabular-nums">
                  {r.es === null ? <span className="sr-only">senza errore standard</span> : `± ${formattaMedia(r.es)}`}
                </td>
                <td className="py-2.5 pl-2 text-right font-mono text-grafite-tenue tabular-nums">{`(${r.n})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  )
}

/** Lo stato di navigazione con cui la modifica sa di poter tornare qui. */
const arrivoModifica: ArrivoMisura = { daScheda: true }

/**
 * "Da controllare": i valori di oggi di questo strumento molto lontani dalla media del loro trattamento
 * (`daSistemare`, come nella home). Il tocco apre la misura che porta il valore.
 */
function DaControllare({ espId, config, strumento, misure, data }: {
  espId: string; config: ConfigEsperimento; strumento: Strumento; misure: Misura[]; data: string
}) {
  const idTitolo = useId()
  const voci = useMemo(() => {
    const piante = new Map(config.piante.map(p => [p.id, p]))
    const parametri = new Map(config.parametri.map(p => [p.id, p]))
    const dellaMisura = new Map(misure.map(m => [m.id, m]))
    return daSistemare(config, misure, data).flatMap(v => {
      const pianta = piante.get(v.piantaId)
      const parametro = parametri.get(v.parametroId)
      // Solo i valori di questo strumento: gli altri si vedono nel fine giro del loro.
      return pianta && parametro && dellaMisura.get(v.misuraId)?.strumento_id === strumento.id ? [{ ...v, pianta, parametro }] : []
    })
  }, [config, misure, data, strumento.id])
  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-3">
      <h3 id={idTitolo} className="text-label text-grafite-tenue uppercase">Da controllare</h3>
      {voci.length === 0 ? (
        <p className="text-grafite-tenue">Nessun valore da controllare.</p>
      ) : (
        <ul className="-mx-4 flex flex-col">
          {voci.map(v => (
            <li key={`${v.misuraId}-${v.parametroId}`} className="border-b border-riga first:border-t">
              <Link
                to={percorsoModificaMisura(espId, v.misuraId)}
                state={arrivoModifica}
                className="flex min-h-14 items-center gap-3 bg-attenzione-velato/60 px-4 py-3 transition-colors -outline-offset-2 hover:bg-attenzione-velato active:bg-attenzione-velato"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono font-[550] tabular-nums text-grafite">{`Pianta ${v.pianta.etichetta}`}</span>
                    <Badge variant="attenzione" className="font-sans">
                      <TriangleAlert aria-hidden />
                      fuori dal gruppo
                    </Badge>
                  </span>
                  <span className="flex flex-wrap gap-x-3 font-mono text-dato tabular-nums">
                    <span className="text-grafite">{`${v.parametro.nome} ${formattaConUnita(v.valore, v.parametro.unita)}`}</span>
                    <span className="text-grafite-tenue">{`media trattamento ${formattaConUnita(v.media, v.parametro.unita)}`}</span>
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Il riepilogo del giro, a misure del giorno arrivate (senza, ogni pianta risulterebbe da fare): la griglia delle
 * piante, i valori di oggi per trattamento e quelli da controllare. Le misure del giorno comprendono già quelle in
 * coda d'invio: una pianta misurata senza rete è fatta anche qui.
 */
function Riepilogo({ espId, config, strumento, misure, data }: {
  espId: string; config: ConfigEsperimento; strumento: Strumento; misure: Misura[]; data: string
}) {
  const navigate = useNavigate()
  const idTitolo = useId()
  const { fatte, totale, mancanti, celle } = useMemo(() => {
    const stati = statiPiante(strumento, config.parametri, misure, config.piante)
    return { ...riepilogoGiro(config.piante, stati), celle: celleGriglia(config.piante, stati, null) }
  }, [config, strumento, misure])
  // Si arriva qui con "Salva e termina", e i pulsanti in basso sono dove c'era lui: il secondo tocco di un doppio
  // tocco non è una scelta (porterebbe via dal riepilogo prima di leggerlo). Vale anche per le celle.
  const toccoValido = useAttesaArrivo()
  const scegliAltro = () => {
    if (toccoValido()) navigate(percorsoNuovaMisura(espId))
  }
  // Come dopo "Salva e vai": si continua a misurare (il cursore nel primo campo), e i pulsanti della pianta compaiono
  // dove c'era questo, quindi un doppio tocco non salva niente al posto di chi rileva.
  const vaiA = (pianta: Pianta) => {
    if (!toccoValido()) return
    const arrivo: ArrivoScheda = { primoCampo: true }
    navigate(percorsoMisuraPianta(espId, strumento.id, pianta.id), { state: arrivo })
  }

  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 id={idTitolo} className="text-headline text-grafite">
          {strumento.icona && <span aria-hidden>{`${strumento.icona} `}</span>}
          {`${strumento.nome} · fine giro `}
          <span className="font-mono tabular-nums">{`${fatte}/${totale}`}</span>
        </h2>
        {mancanti.length === 0 && <p className="text-grafite">Giro completo: tutte le piante sono misurate.</p>}
        <GrigliaPiante celle={celle} onScegli={vaiA} />
      </div>

      <ValoriDiOggi config={config} strumento={strumento} misure={misure} data={data} />
      <DaControllare espId={espId} config={config} strumento={strumento} misure={misure} data={data} />

      <BarraAzioni>
        {mancanti.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" className="grow" onClick={scegliAltro}>Scegli un altro strumento</Button>
            {/* La prima mancante: se è incompleta, la misura chiede se correggere o aggiungere. */}
            <Button size="lg" className="grow-3 basis-52" onClick={() => vaiA(mancanti[0])}>
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
            <Riepilogo espId={espId} config={dati} strumento={strumento} misure={misure.data} data={dataRilievo} />
          )}
        </>
      )}
    </AppShell>
  )
}
