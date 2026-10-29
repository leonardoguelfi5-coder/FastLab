import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { useConfig, useMisureGiorno, useMisurePianta } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { TestoErrore } from '@/components/TestoErrore'
import { AvvisoGiro } from '@/components/scheda/AvvisoGiro'
import type { Avanti, StatoModulo } from '@/components/scheda/ModuloOggi'
import { RiquadroOggi, type ModuloIniziale } from '@/components/scheda/RiquadroOggi'
import { SceltaArrivo } from '@/components/scheda/SceltaArrivo'
import { bozzaDaRiprendere } from '@/components/scheda/bozza'
import { titoloRiquadro } from '@/components/scheda/titolo'
import { useModuloProtetto } from '@/components/scheda/useModuloProtetto'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { prossimaDaMisurare, statiPiante } from '@/domain/giro'
import { etichetteNumeriche, trovaPianta } from '@/domain/piante'
import type { ConfigEsperimento, Misura, Pianta, Strumento } from '@/domain/tipi'
import { percorsoFineGiro, percorsoMisura, percorsoNuovaMisura } from '@/lib/percorsi'
import { useCampoStore } from '@/store/campo'

const Caricamento = () => <p role="status" className="text-grafite-tenue">Caricamento…</p>

const confronta = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * "Vai alla pianta": si salta a qualsiasi pianta scrivendone l'etichetta, restando nel giro dello strumento. Prende il
 * posto della pianta attuale come "Salva e vai" (il gesto indietro esce dal giro), e con valori non salvati chiede
 * prima se scartarli. Non è un testo grande: in questa schermata il grande è il numero della pianta.
 */
function VaiAllaPianta({ espId, config, strumentoId, conferma }: {
  espId: string; config: ConfigEsperimento; strumentoId: string; conferma: (azione: () => void) => void
}) {
  const navigate = useNavigate()
  const idCampo = useId()
  const idErrore = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [testo, setTesto] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const numeriche = useMemo(() => etichetteNumeriche(config.piante), [config.piante])

  function vai(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const cercata = testo.trim()
    if (cercata === '') return
    const pianta = trovaPianta(config.piante, cercata)
    if (pianta) {
      conferma(() => navigate(percorsoMisura(espId, strumentoId, pianta.id), { replace: true }))
      return
    }
    setErrore(`Nessuna pianta con etichetta «${cercata}» in questo esperimento.`)
    // Il testo resta selezionato: la prossima cifra lo sostituisce.
    campo.current?.focus()
    campo.current?.select()
  }

  return (
    <form onSubmit={vai} noValidate className="flex flex-col gap-1.5">
      <Label htmlFor={idCampo}>Vai alla pianta</Label>
      {/* Le tastiere numeriche non hanno sempre il tasto Invio: "Vai" è accanto al campo. */}
      <div className="flex gap-2">
        <Input
          ref={campo}
          id={idCampo}
          type="text"
          variant="campo"
          className="min-w-0 flex-1"
          inputMode={numeriche ? 'numeric' : 'text'}
          enterKeyHint="go"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={testo}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? idErrore : undefined}
          onChange={e => { setTesto(e.target.value); setErrore(null) }}
        />
        <Button type="submit" variant="outline" size="lg" disabled={testo.trim() === ''}>Vai</Button>
      </div>
      {errore && <TestoErrore id={idErrore} role="alert">{errore}</TestoErrore>}
    </form>
  )
}

interface ArrivoPiantaProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  strumento: Strumento
  misure: Misura[]
  misureGiorno: Misura[]
  dataRilievo: string
  oggi: string
  conferma: (azione: () => void) => void
  onModifiche: (stato: StatoModulo | null) => void
}

/**
 * Il riquadro della misura nel giro, fissato per una pianta, uno strumento e una data. Se la pianta ha già misure di
 * questo strumento in quella data, prima si chiede se correggerne una o aggiungerne una nuova (da qualunque parte ci
 * si arrivi: il giro, "Vai alla pianta", "Vai alle mancanti", "Riprendi", un collegamento). Non si chiede se c'è un
 * modulo lasciato a metà da riprendere (la sua bozza): la domanda lo farebbe dimenticare, e il riquadro lo riapre.
 */
function ArrivoPianta({
  espId, config, pianta, strumento, misure, misureGiorno, dataRilievo, oggi, conferma, onModifiche,
}: ArrivoPiantaProps) {
  const misureOggi = useMemo(
    () => misure
      .filter(m => m.strumento_id === strumento.id && m.data_rilievo === dataRilievo)
      .sort((a, b) => confronta(a.ora, b.ora)),
    [misure, strumento.id, dataRilievo],
  )
  // Si decide una volta, all'arrivo: un salvataggio fatto qui ("Salva", che resta) non fa ricomparire la domanda.
  const [scelta, setScelta] = useState<ModuloIniziale | 'chiedi' | null>(() => {
    const base = { espId, piantaId: pianta.id, strumentoId: strumento.id, dataRilievo }
    return misureOggi.length > 0 && !bozzaDaRiprendere(base, misureOggi.map(m => m.id)) ? 'chiedi' : null
  })

  // La prossima pianta del giro: dopo questa, la prima non "fatta" (le incomplete si riprendono). Le misure del giorno
  // sono già arrivate: senza, ogni pianta risulterebbe da fare.
  const successiva = useMemo(
    () => prossimaDaMisurare(config.piante, statiPiante(strumento, config.parametri, misureGiorno, config.piante), pianta.id),
    [config, strumento, misureGiorno, pianta.id],
  )
  const avanti = useMemo<Avanti>(
    () => (successiva
      ? { testo: `e vai alla #${successiva.etichetta}`, percorso: percorsoMisura(espId, strumento.id, successiva.id) }
      : { testo: 'e termina', percorso: percorsoFineGiro(espId, strumento.id) }),
    [espId, strumento.id, successiva],
  )

  if (scelta === 'chiedi' && misureOggi.length > 0) {
    return (
      <SceltaArrivo
        titolo={titoloRiquadro(strumento, dataRilievo, oggi)}
        misure={misureOggi}
        parametri={config.parametri}
        onScegli={setScelta}
      />
    )
  }

  return (
    <RiquadroOggi
      espId={espId}
      config={config}
      pianta={pianta}
      strumento={strumento}
      misure={misure}
      dataRilievo={dataRilievo}
      oggi={oggi}
      successiva={successiva}
      avanti={avanti}
      iniziale={scelta === 'chiedi' || scelta === null ? undefined : scelta}
      conferma={conferma}
      onModifiche={onModifiche}
    />
  )
}

interface MisuraCaricataProps {
  espId: string
  config: ConfigEsperimento
  strumento: Strumento
  piantaId: string
  dataRilievo: string
  oggi: string
  misure: UseQueryResult<Misura[]>
  misureGiorno: UseQueryResult<Misura[]>
  conferma: (azione: () => void) => void
  onModifiche: (stato: StatoModulo | null) => void
}

/** La pagina a configurazione caricata: intestazione della pianta, "Vai alla pianta" e il riquadro della misura. */
function MisuraCaricata({
  espId, config, strumento, piantaId, dataRilievo, oggi, misure, misureGiorno, conferma, onModifiche,
}: MisuraCaricataProps) {
  const pianta = config.piante.find(p => p.id === piantaId)
  if (!pianta) return <AvvisoGiro espId={espId} testo="Questa pianta non esiste in questo esperimento." />

  const trattamento = config.trattamenti.find(t => t.id === pianta.trattamento_id)
  // Il modulo aspetta le misure della pianta (i progressivi, la domanda all'arrivo) e quelle del giorno (la pianta dopo).
  const inErrore = misure.isError ? misure : misureGiorno.isError ? misureGiorno : null

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
        <VaiAllaPianta espId={espId} config={config} strumentoId={strumento.id} conferma={conferma} />
        <BannerData espId={espId} conferma={conferma} />
      </div>

      {misure.data === undefined || misureGiorno.data === undefined ? (
        inErrore
          ? <ErroreConRiprova errore={inErrore.error} onRiprova={() => void inErrore.refetch()} />
          : <Caricamento />
      ) : (
        // Una data diversa è un riquadro nuovo (e una domanda nuova): una misura in correzione non passa a un altro giorno.
        <ArrivoPianta
          key={`${strumento.id}:${dataRilievo}`}
          espId={espId}
          config={config}
          pianta={pianta}
          strumento={strumento}
          misure={misure.data}
          misureGiorno={misureGiorno.data}
          dataRilievo={dataRilievo}
          oggi={oggi}
          conferma={conferma}
          onModifiche={onModifiche}
        />
      )}
    </>
  )
}

/**
 * Misura sequenziale: una pianta alla volta con lo strumento scelto, alla data di rilievo. "Salva e vai" porta alla
 * prossima pianta da misurare (le fatte si saltano), sull'ultima "Salva e termina" porta alla fine del giro. Valgono
 * tutte le protezioni della scheda della pianta: bozze, conferma prima di scartare, niente doppioni.
 */
export function MisuraPianta() {
  const { espId = '', strumentoId = '', piantaId = '' } = useParams()
  const config = useConfig(espId)
  // Si caricano insieme alla configurazione, non dopo.
  const misure = useMisurePianta(piantaId)
  const { oggi, conferma, onModifiche, onIndietro, dialogo } = useModuloProtetto(espId)
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  const misureGiorno = useMisureGiorno(espId, dataRilievo)
  const setStrumento = useCampoStore(s => s.setStrumento)

  const dati = config.data
  const strumento = dati?.strumenti.find(s => s.id === strumentoId)
  const attivo = strumento && !strumento.archiviato ? strumento : null

  // Lo strumento del giro diventa quello scelto: la home e la scelta dello strumento riprendono da qui. Uno archiviato
  // o inesistente non si sceglie.
  const idAttivo = attivo?.id
  useEffect(() => {
    if (idAttivo && useCampoStore.getState().dati(espId).strumentoId !== idAttivo) setStrumento(espId, idAttivo)
  }, [espId, idAttivo, setStrumento])

  const verso = percorsoNuovaMisura(espId)
  return (
    <AppShell
      titolo={attivo ? `${attivo.icona ? `${attivo.icona} ` : ''}${attivo.nome}` : 'Misura'}
      indietro={verso}
      onIndietro={onIndietro(verso)}
    >
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : !strumento ? (
        <AvvisoGiro espId={espId} testo="Questo strumento non esiste in questo esperimento." />
      ) : !attivo ? (
        <AvvisoGiro espId={espId} testo={`Lo strumento «${strumento.nome}» è archiviato: non si misura più.`} />
      ) : (
        // Una pianta nuova è una pagina nuova: niente stato (modulo, id, domanda, "Annulla") passa da una all'altra.
        <MisuraCaricata
          key={piantaId}
          espId={espId}
          config={dati}
          strumento={attivo}
          piantaId={piantaId}
          dataRilievo={dataRilievo}
          oggi={oggi}
          misure={misure}
          misureGiorno={misureGiorno}
          conferma={conferma}
          onModifiche={onModifiche}
        />
      )}
      {dialogo}
    </AppShell>
  )
}
