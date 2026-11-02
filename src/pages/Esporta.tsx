import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useConfig, useMisureStrumenti, useNote, useUltimaData } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Sezione } from '@/components/impostazioni/Sezione'
import { senzaNoteInEliminazione } from '@/components/note/eliminaNotaConAnnulla'
import { ExportSalvati, ID_TUTTO } from '@/components/esporta/ExportSalvati'
import { Riepilogo, type StatoRiepilogo } from '@/components/esporta/Riepilogo'
import { SalvaScelta } from '@/components/esporta/SalvaScelta'
import { SceltaCome } from '@/components/esporta/SceltaCome'
import { SceltaCosa } from '@/components/esporta/SceltaCosa'
import { SceltaPeriodo } from '@/components/esporta/SceltaPeriodo'
import { SceltaPiante } from '@/components/esporta/SceltaPiante'
import { scaricaExcel, strumentiDaLeggere, testoFase, type FaseExcel } from '@/components/esporta/scaricaExcel'
import { scelteDaScelta, sceltaDaScelteUi, type ScelteUi } from '@/components/esporta/scelteUi'
import { Button } from '@/components/ui/button'
import { costruisciCartella, type Cartella } from '@/domain/export/fogli'
import { SCELTA_TUTTO, sceltaDaRicerca, type SceltaExport } from '@/domain/export/scelte'
import type { ConfigEsperimento } from '@/domain/tipi'
import { ErroreApp } from '@/lib/errori'
import { percorsoHome } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'

/** L'origine delle scelte di adesso quando arrivano dal Dataset: nessuna riga degli export salvati è «in uso». */
const DAL_DATASET = 'dataset'

const NON_PREPARATO = new ErroreApp('Non riesco a preparare il riepilogo: ricarica la pagina e riprova.')

/**
 * Il file ha qualcosa da mostrare? Solo Info non basta (è la configurazione, c'è sempre), a meno che non sia l'unica
 * cosa chiesta: allora è il file voluto.
 */
function haDati(cartella: Cartella, scelta: SceltaExport): boolean {
  const { come } = scelta
  const soloInfo = come.info && !come.valori && !come.medie && !come.grafici && !come.diario
  return soloInfo || cartella.fogli.some(f => f.tipo !== 'info')
}

/** Esporta a configurazione caricata: le scelte vivono nello stato della pagina, il riepilogo e il file ne sono la conseguenza. */
function EsportaCaricato({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const oggi = useOggi()

  // Le scelte di partenza: quelle della vista del Dataset se si arriva da «Scarica questa vista» (la URL), altrimenti
  // «Tutto l'esperimento». Poi vivono qui: la URL non si riscrive.
  const dalDataset = params.toString() !== ''
  const [ui, setUi] = useState<ScelteUi>(() => scelteDaScelta(dalDataset ? sceltaDaRicerca(params, config) : SCELTA_TUTTO, config))
  // Quale export ha dato le scelte di adesso (`ID_TUTTO`, l'id di un salvato o `DAL_DATASET`): `null` appena le si tocca.
  const [origine, setOrigine] = useState<string | null>(dalDataset ? DAL_DATASET : ID_TUTTO)

  const cambia = (cambio: Partial<ScelteUi>) => {
    setUi(u => ({ ...u, ...cambio }))
    setOrigine(null)
  }
  const applica = (scelta: SceltaExport, id: string) => {
    setUi(scelteDaScelta(scelta, config))
    setOrigine(id)
  }

  const esito = useMemo(() => sceltaDaScelteUi(ui, config), [ui, config])
  const { scelta, problemi } = esito

  // Il riepilogo costa fino a mezzo secondo con migliaia di misure: si calcola sulla scelta «in ritardo», così i chip
  // e i campi rispondono subito e il conto arriva dopo (intanto dice «Conto le righe…»).
  const sceltaDifferita = useDeferredValue(scelta)
  const idsDaLeggere = useMemo(() => (sceltaDifferita ? strumentiDaLeggere(sceltaDifferita, config) : []), [sceltaDifferita, config])
  const misure = useMisureStrumenti(espId, idsDaLeggere)
  const note = useNote(espId)
  const ultimaData = useUltimaData(espId)
  // «Ultime N settimane» di un esperimento concluso finiscono all'ultima misura: finché la data non arriva non si conta.
  const attesaData = config.esperimento.stato === 'concluso' && ultimaData.data === undefined

  const calcolo = useMemo(() => {
    if (!sceltaDifferita || !misure.dati || !note.data || attesaData) return null
    try {
      const cartella = costruisciCartella({
        config, misure: idsDaLeggere.flatMap(id => misure.dati?.get(id) ?? []), note: senzaNoteInEliminazione(note.data),
        scelta: sceltaDifferita, oggi,
        // il riepilogo conta soltanto: l'istante vero dell'export lo scrive `scaricaExcel` al momento del download
        adesso: new Date(`${oggi}T12:00:00`).toISOString(),
        ultimaData: ultimaData.data ?? null,
      })
      return { cartella }
    } catch {
      return { errore: true as const }
    }
  }, [config, sceltaDifferita, idsDaLeggere, misure.dati, note.data, attesaData, oggi, ultimaData.data])

  let stato: StatoRiepilogo
  if (scelta === null) stato = { tipo: 'incompleto' }
  else if (scelta !== sceltaDifferita) stato = { tipo: 'conto' }
  else if (misure.isError) stato = { tipo: 'errore', errore: misure.error, onRiprova: () => void misure.refetch() }
  else if (note.isError && !note.data) stato = { tipo: 'errore', errore: note.error, onRiprova: () => void note.refetch() }
  else if (ultimaData.isError && attesaData) stato = { tipo: 'errore', errore: ultimaData.error, onRiprova: () => void ultimaData.refetch() }
  else if (calcolo === null) stato = { tipo: 'conto' }
  else if ('errore' in calcolo) stato = { tipo: 'errore', errore: NON_PREPARATO, onRiprova: () => window.location.reload() }
  else stato = haDati(calcolo.cartella, scelta) ? { tipo: 'pronto', cartella: calcolo.cartella } : { tipo: 'nessunDato' }

  // Il download. Il pulsante resta fermo finché lavora e la fase sta sotto; lasciando la pagina il segnale si interrompe
  // e non resta un download fantasma (l'orchestratore non consegna nulla dopo un'interruzione).
  const [fase, setFase] = useState<FaseExcel | null>(null)
  const [fallito, setFallito] = useState<{ errore: unknown } | null>(null)
  const controllo = useRef<AbortController | null>(null)
  const inLavoro = useRef(false)
  useEffect(() => {
    const ref = controllo
    return () => ref.current?.abort()
  }, [])

  async function scarica() {
    if (scelta === null || inLavoro.current) return
    inLavoro.current = true
    const interrompibile = new AbortController()
    controllo.current = interrompibile
    setFallito(null)
    setFase({ fase: 'dati' })
    try {
      await scaricaExcel({
        queryClient, espId, scelta, oggi, segnale: interrompibile.signal,
        onProgresso: f => { if (!interrompibile.signal.aborted) setFase(f) },
      })
    } catch (e) {
      if (!interrompibile.signal.aborted) setFallito({ errore: e })
    } finally {
      inLavoro.current = false
      if (!interrompibile.signal.aborted) setFase(null)
    }
  }

  return (
    <>
      {origine === DAL_DATASET && <p className="text-base text-grafite-tenue">Dalla vista del Dataset.</p>}

      <Sezione titolo="Export salvati">
        <ExportSalvati espId={espId} config={config} inUso={origine} onApplica={applica} />
      </Sezione>

      <Sezione titolo="1 · Cosa">
        <SceltaCosa config={config} scelti={ui.strumenti} problema={problemi.strumenti} onCambia={strumenti => cambia({ strumenti })} />
      </Sezione>

      <Sezione titolo="2 · Quali piante">
        <SceltaPiante
          config={config} modo={ui.modoPiante} trattamenti={ui.trattamenti} cercato={ui.cercato}
          trovate={esito.trovate} nonTrovate={esito.nonTrovate} problema={problemi.piante}
          onModo={modoPiante => cambia({ modoPiante })} onTrattamenti={trattamenti => cambia({ trattamenti })}
          onCercato={cercato => cambia({ cercato })}
        />
      </Sezione>

      <Sezione titolo="3 · Periodo">
        <SceltaPeriodo
          modo={ui.modoPeriodo} settimane={ui.settimane} da={ui.da} a={ui.a} problema={problemi.periodo}
          onModo={modoPeriodo => cambia({ modoPeriodo })} onDate={(da, a) => cambia({ da, a })}
        />
      </Sezione>

      <Sezione titolo="4 · Come">
        <SceltaCome come={ui.come} problema={problemi.come} onCambia={come => cambia({ come })} />
      </Sezione>

      <Riepilogo stato={stato} />

      <SalvaScelta espId={espId} scelta={scelta} onSalvato={id => setOrigine(id)} />

      <BarraAzioni>
        {fallito && <ErroreConRiprova errore={fallito.errore} onRiprova={() => void scarica()} />}
        <Button type="button" disabled={stato.tipo !== 'pronto' || fase !== null} onClick={() => void scarica()}>Scarica Excel</Button>
        {fase && <p role="status" className="text-center font-mono text-dato tabular-nums text-grafite-tenue">{testoFase(fase)}</p>}
      </BarraAzioni>
    </>
  )
}

/**
 * Esporta Excel (spec §5.6): quattro scelte (cosa, quali piante, periodo, come), il riepilogo di cosa conterrà il file e
 * «Scarica Excel». Sopra, gli export salvati dell'utente. Si arriva anche da «Scarica questa vista» del Dataset, con le
 * scelte già compilate nella URL.
 */
export function Esporta() {
  const { espId = '' } = useParams()
  const { search } = useLocation()
  const config = useConfig(espId)

  return (
    <AppShell titolo="Esporta Excel" indietro={percorsoHome(espId)}>
      {config.data === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        // Le scelte di partenza si leggono dalla URL una volta sola: un'altra URL (o un altro esperimento) riparte da capo.
        <EsportaCaricato key={`${espId}${search}`} espId={espId} config={config.data} />
      )}
    </AppShell>
  )
}
