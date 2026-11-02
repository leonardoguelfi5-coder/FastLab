import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useConfig, useMisureStrumento, useNote, useUltimaData } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraFiltri } from '@/components/dataset/BarraFiltri'
import { GraficoInterattivo } from '@/components/dataset/GraficoInterattivo'
import { TabellaTesto, TabellaValori } from '@/components/dataset/TabellaValori'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { senzaNoteInEliminazione } from '@/components/note/eliminaNotaConAnnulla'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  filtriDaRicerca, fineDelleSettimane, haFiltriAttivi, intervalloDelPeriodo, noteDelGrafico, parametriDelloStrumento,
  pianteDelFiltro, ricercaDaFiltri, righeTabella, righeTesto, senzaFiltri, seriePiante, serieTrattamenti, strumentiPerScelta,
  MASSIMO_PIANTE, type FiltriDataset, type Intervallo, type ScalaGrafico,
} from '@/domain/dataset'
import type { ConfigEsperimento, Nota } from '@/domain/tipi'
import { percorsoDiario, percorsoEsporta, percorsoHome, percorsoImpostazioni } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

/** Un pezzo di testo sotto la barra dei filtri: una riga di stato o di avviso. */
const AVVISO = 'text-base text-grafite-tenue'

/** "Non trovata: 99" / "Non trovate: 99, 100": le piante cercate che non ci sono, dette a parole. */
function descriviNonTrovate(nonTrovate: string[]): string {
  return `${nonTrovate.length === 1 ? 'Non trovata' : 'Non trovate'}: ${nonTrovate.join(', ')}`
}

/** Che cosa dire sopra il grafico: il parametro, che cosa si vede e quante piante. */
function didascalia(nome: string, unita: string | null, tipo: 'trattamenti' | 'piante', scala: ScalaGrafico, nPiante: number): string {
  const come = tipo === 'piante'
    ? 'piante cercate'
    : scala === 'percentuale' ? 'percentuale di sì per trattamento' : scala === 'conteggio' ? 'numero di elementi, media per trattamento ± ES' : 'media per trattamento ± ES'
  return `${nome}${unita ? ` (${unita})` : ''} · ${come} · ${nPiante === 1 ? '1 pianta' : `${nPiante} piante`}`
}

/** Nessun dato da mostrare: con filtri attivi si offre di toglierli, senza il parametro semplicemente non ha misure. */
function NessunDato({ conFiltri, onAzzera }: { conFiltri: boolean; onAzzera: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-title text-grafite">{conFiltri ? 'Nessun dato con questi filtri.' : 'Nessun dato per questo parametro.'}</p>
      {conFiltri && <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={onAzzera}>Azzera i filtri</Button>}
    </div>
  )
}

/** Il Dataset a configurazione caricata: i filtri stanno nella URL, il grafico e la tabella ne sono la conseguenza. */
function DatasetCaricato({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const navigate = useNavigate()
  const [params, setSearchParams] = useSearchParams()
  const oggi = useOggi()
  const dalCampo = useCampoStore(s => s.dati(espId, oggi).strumentoId)
  const [mostraValori, setMostraValori] = useState(false)
  const [azzeramenti, setAzzeramenti] = useState(0)

  // Lo strumento di partenza: quello scelto in campo se è attivo, altrimenti il primo attivo (o, se sono tutti
  // archiviati, il primo: hanno ancora dati da guardare).
  const predefinito = useMemo(() => {
    const strumenti = strumentiPerScelta(config)
    return (strumenti.find(s => s.id === dalCampo && !s.archiviato) ?? strumenti[0])?.id ?? null
  }, [config, dalCampo])

  // I filtri dalla URL. Gli id manomessi li scarta già il dominio; senza uno strumento valido vale il predefinito.
  const filtri = useMemo(() => {
    const letti = filtriDaRicerca(params, config)
    if (letti.strumentoId !== null || predefinito === null) return letti
    const conStrumento = new URLSearchParams(params)
    conStrumento.set('s', predefinito)
    return filtriDaRicerca(conStrumento, config)
  }, [params, config, predefinito])

  /** Scrive i filtri nella URL senza aggiungere voci alla cronologia: Indietro esce dalla pagina, non da un filtro. */
  function aggiorna(cambio: Partial<FiltriDataset>) {
    const prossimo = { ...filtri, ...cambio }
    // Cambiando strumento il parametro di prima non c'è più: si sceglie il primo che si disegna.
    if (cambio.strumentoId != null && cambio.strumentoId !== filtri.strumentoId && cambio.parametroId === undefined) {
      const parametri = parametriDelloStrumento(config, cambio.strumentoId)
      prossimo.parametroId = (parametri.find(p => p.disegnabile) ?? parametri[0])?.parametro.id ?? null
    }
    setSearchParams(ricercaDaFiltri(prossimo), { replace: true })
  }
  function azzera() {
    setAzzeramenti(n => n + 1)
    aggiorna(senzaFiltri(filtri))
  }

  const strumentoId = filtri.strumentoId
  const parametro = useMemo(() => config.parametri.find(p => p.id === filtri.parametroId) ?? null, [config, filtri.parametroId])
  const voceParametro = useMemo(
    () => (strumentoId === null ? undefined : parametriDelloStrumento(config, strumentoId).find(p => p.parametro.id === parametro?.id)),
    [config, strumentoId, parametro],
  )

  const misure = useMisureStrumento(espId, strumentoId ?? undefined)
  const note = useNote(espId)
  const ultimaData = useUltimaData(espId)

  // "Ultime N settimane" di un esperimento concluso finiscono all'ultima misura: finché la data non è arrivata non si
  // calcola un intervallo (sarebbe quello sbagliato). Per uno in corso valgono da oggi e non serve aspettarla.
  const stato = config.esperimento.stato
  const periodoInAttesa = filtri.periodo.modo === 'settimane' && stato === 'concluso' && ultimaData.data === undefined
  const intervallo = useMemo<Intervallo | null>(
    () => (periodoInAttesa ? null : intervalloDelPeriodo(filtri.periodo, fineDelleSettimane(stato, oggi, ultimaData.data ?? null))),
    [periodoInAttesa, filtri.periodo, stato, oggi, ultimaData.data],
  )

  const scelta = useMemo(() => pianteDelFiltro(config, filtri), [config, filtri])
  const misureLette = misure.data

  // Le serie si calcolano solo quando cambiano misure o filtri: un tocco sul grafico o aprire la tabella non le rifanno.
  const vista = useMemo(() => {
    if (!parametro || !misureLette || !intervallo) return null
    if (parametro.tipo === 'testo') {
      return { tipo: 'testo' as const, righe: righeTesto(config, parametro, misureLette, scelta.piante, intervallo) }
    }
    if (scelta.modo === 'piante') {
      const { serie, oltre } = seriePiante(config, parametro, misureLette, scelta.piante, intervallo)
      return { tipo: 'grafico' as const, serie, oltre }
    }
    return { tipo: 'grafico' as const, serie: serieTrattamenti(config, parametro, misureLette, scelta.piante, intervallo), oltre: 0 }
  }, [config, parametro, misureLette, scelta, intervallo])

  const righe = useMemo(() => (vista?.tipo === 'grafico' ? righeTabella(vista.serie) : []), [vista])
  const noteDelleDate = useMemo(
    () => (note.data && intervallo ? noteDelGrafico(senzaNoteInEliminazione(note.data), scelta.piante, intervallo) : []),
    [note.data, scelta, intervallo],
  )

  const conFiltri = haFiltriAttivi(filtri)
  const ricerca = ricercaDaFiltri(filtri)
  const apriNota = (n: Nota) => navigate(percorsoDiario(espId), { state: { apriNota: n.id } })

  if (strumentoId === null) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-title text-grafite">Nessuno strumento.</p>
        <p className={AVVISO}>Aggiungi uno strumento nelle Impostazioni.</p>
        <Link to={percorsoImpostazioni(espId)} className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-3' })}>Apri le Impostazioni</Link>
      </div>
    )
  }

  const azioni = (
    <div className="flex flex-wrap gap-2">
      {vista?.tipo === 'grafico' && (
        <Button type="button" variant="outline" size="sm" aria-expanded={mostraValori} onClick={() => setMostraValori(v => !v)}>Mostra i valori</Button>
      )}
      <Link to={percorsoEsporta(espId, ricerca)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Scarica questa vista</Link>
    </div>
  )

  let contenuto
  if (parametro === null || voceParametro === undefined) {
    contenuto = <p className={AVVISO}>Questo strumento non ha parametri.</p>
  } else if (periodoInAttesa) {
    contenuto = ultimaData.isError
      ? <ErroreConRiprova errore={ultimaData.error} onRiprova={() => void ultimaData.refetch()} />
      : <p role="status" className={AVVISO}>Calcolo del periodo…</p>
  } else if (misureLette === undefined) {
    contenuto = misure.isError
      ? <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
      : <p role="status" className={AVVISO}>Carico le misure…</p>
  } else if (misureLette.length === 0) {
    contenuto = <p className="text-title text-grafite">Nessuna misura per questo strumento.</p>
  } else if (vista?.tipo === 'testo') {
    contenuto = vista.righe.length === 0
      ? <NessunDato conFiltri={conFiltri} onAzzera={azzera} />
      : (
        <>
          <p className="text-title text-grafite">Il testo non si disegna: ecco i valori.</p>
          {azioni}
          <TabellaTesto righe={vista.righe} descrizione={`${parametro.nome}: l'ultimo testo del giorno di ogni pianta`} />
        </>
      )
  } else if (vista?.tipo === 'grafico') {
    const conDati = vista.serie.some(s => s.punti.length > 0)
    contenuto = !conDati
      ? <NessunDato conFiltri={conFiltri} onAzzera={azzera} />
      : (
        <>
          <p className="font-mono text-dato tabular-nums text-grafite-tenue">
            {didascalia(parametro.nome, parametro.unita, scelta.modo, voceParametro.scala ?? 'valore', scelta.piante.length)}
          </p>
          {vista.oltre > 0 && (
            <p className={AVVISO}>
              {`Il grafico mostra le prime ${MASSIMO_PIANTE} piante, altre ${vista.oltre} non sono disegnate. Cerca meno piante per vederle tutte.`}
            </p>
          )}
          <GraficoInterattivo
            key={`${strumentoId}-${parametro.id}`}
            serie={vista.serie} note={noteDelleDate} scala={voceParametro.scala ?? 'valore'} unita={parametro.unita}
            titolo={parametro.nome} onApriNota={apriNota}
          />
          {note.isError && (
            <div className="flex flex-wrap items-center gap-x-2">
              <p className={AVVISO}>Le note del Diario non si sono caricate, quindi non compaiono sul grafico.</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void note.refetch()}>Riprova</Button>
            </div>
          )}
          {azioni}
          {mostraValori && (
            <TabellaValori
              serie={vista.serie} righe={righe} scala={voceParametro.scala ?? 'valore'}
              descrizione={`${parametro.nome}: i valori del grafico per data, dalla più recente`}
            />
          )}
        </>
      )
  } else {
    contenuto = null
  }

  return (
    <>
      <BarraFiltri
        config={config} filtri={filtri} cercatoGrezzo={params.get('cerca') ?? ''} intervallo={intervallo}
        azzeramenti={azzeramenti} onCambia={aggiorna} onAzzera={azzera}
      />
      {scelta.nonTrovate.length > 0 && <p role="status" className={AVVISO}>{descriviNonTrovate(scelta.nonTrovate)}</p>}
      {scelta.modo === 'piante' && (filtri.trattamentoIds.length > 0 || filtri.livelloIds.length > 0) && (
        <p className={AVVISO}>La ricerca sostituisce trattamenti e fattore.</p>
      )}
      {contenuto}
    </>
  )
}

/**
 * Il Dataset (spec §5.5): il grafico della media per trattamento nel tempo ± errore standard, con i filtri sempre in
 * alto, le note del Diario sul grafico e "Mostra i valori" con esattamente i dati disegnati. Strumento, parametro,
 * trattamenti, fattore, periodo e piante cercate stanno nella URL: Indietro e un link condiviso ridanno la stessa vista.
 */
export function Dataset() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)

  return (
    <AppShell titolo="Dataset" indietro={percorsoHome(espId)}>
      {config.data === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <DatasetCaricato key={espId} espId={espId} config={config.data} />
      )}
    </AppShell>
  )
}
