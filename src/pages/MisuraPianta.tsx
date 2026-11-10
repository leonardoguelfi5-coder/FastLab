import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { UseQueryResult } from '@tanstack/react-query'
import { LayoutGrid } from 'lucide-react'
import { useConfig, useMisureGiorno, useMisurePianta } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { Caricamento, RigaStato, SENZA_RETE_ESPERIMENTO, SENZA_RETE_GIORNO, SENZA_RETE_PIANTA } from '@/components/Caricamento'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { FoglioPiante } from '@/components/giro/FoglioPiante'
import { PulsanteAggiungiFoto, StatoCaricamentoFoto } from '@/components/foto/AggiungiFoto'
import { useCaricaFoto } from '@/components/foto/useCaricaFoto'
import { AvvisoGiro } from '@/components/scheda/AvvisoGiro'
import type { ArrivoScheda, Avanti, StatoModulo } from '@/components/scheda/ModuloOggi'
import { RiquadroOggi, type ModuloIniziale } from '@/components/scheda/RiquadroOggi'
import { SceltaArrivo } from '@/components/scheda/SceltaArrivo'
import { bozzaDaRiprendere } from '@/components/scheda/bozza'
import { titoloRiquadro } from '@/components/scheda/titolo'
import { useModuloProtetto } from '@/components/scheda/useModuloProtetto'
import { Button } from '@/components/ui/button'
import { celleGriglia, completamentoDiretto, prossimaDaMisurare, riepilogoGiro, statiPiante } from '@/domain/giro'
import { misureStrumentoNelGiorno } from '@/domain/misure'
import type { ConfigEsperimento, Misura, Pianta, Strumento } from '@/domain/tipi'
import { percorsoFineGiro, percorsoMisuraPianta, percorsoNuovaMisura, percorsoPianta } from '@/lib/percorsi'
import { useSenzaRete } from '@/lib/useSenzaRete'
import { useCampoStore } from '@/store/campo'

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
 * Il riquadro della misura nel giro, fissato per una pianta, uno strumento e una data. Arrivando su una pianta che ha già
 * misure di questo strumento in quella data (da qualunque parte: il giro, "Vai alla pianta", "Vai alle mancanti",
 * "Riprendi", un collegamento) si chiede il meno possibile (Piano E, Decisione 13):
 *  - un modulo lasciato a metà da riprendere (la sua bozza) ha sempre la precedenza: la domanda lo farebbe
 *    dimenticare, e il riquadro lo riapre;
 *  - una pianta incompleta con una sola misura di questo strumento apre direttamente il completamento di quella misura;
 *  - altrimenti (pianta fatta, o più misure) si chiede se correggerne una o aggiungerne un'altra.
 */
function ArrivoPianta({
  espId, config, pianta, strumento, misure, misureGiorno, dataRilievo, oggi, conferma, onModifiche,
}: ArrivoPiantaProps) {
  const location = useLocation()
  const daScheda = (location.state as ArrivoScheda | null)?.daScheda === true
  const ordine = useCampoStore(s => s.dati(espId).ordineGiro)
  const misureOggi = useMemo(() => misureStrumentoNelGiorno(misure, strumento.id, dataRilievo), [misure, strumento.id, dataRilievo])
  // Si decide una volta, all'arrivo: un salvataggio fatto qui ("Salva", che resta) non fa ricomparire la domanda.
  const [scelta, setScelta] = useState<ModuloIniziale | 'chiedi' | null>(() => {
    const base = { espId, piantaId: pianta.id, strumentoId: strumento.id, dataRilievo }
    if (misureOggi.length === 0 || bozzaDaRiprendere(base, misureOggi.map(m => m.id))) return null
    const daCompletare = completamentoDiretto(strumento, config.parametri, misureOggi, pianta.id)
    return daCompletare ? { tipo: 'correggi', misuraId: daCompletare.id } : 'chiedi'
  })

  // La prossima pianta del giro: dopo questa, la prima non "fatta" (le incomplete si riprendono). Le misure del giorno
  // sono già arrivate: senza, ogni pianta risulterebbe da fare. Misurando dalla scheda, invece, si torna alla scheda.
  const successiva = useMemo(
    () => prossimaDaMisurare(config.piante, statiPiante(strumento, config.parametri, misureGiorno, config.piante), pianta.id, ordine),
    [config, strumento, misureGiorno, pianta.id, ordine],
  )
  const avanti = useMemo<Avanti>(
    () => (daScheda
      ? { testo: 'e torna alla scheda', percorso: percorsoPianta(espId, pianta.id) }
      : successiva
        ? { testo: `e vai alla #${successiva.etichetta}`, percorso: percorsoMisuraPianta(espId, strumento.id, successiva.id) }
        : { testo: 'e termina', percorso: percorsoFineGiro(espId, strumento.id) }),
    [daScheda, espId, pianta.id, strumento.id, successiva],
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

/** La pagina a configurazione caricata: intestazione della pianta (con l'icona della griglia) e il riquadro della misura. */
function MisuraCaricata({
  espId, config, strumento, piantaId, dataRilievo, oggi, misure, misureGiorno, conferma, onModifiche,
}: MisuraCaricataProps) {
  // Le foto di questa pianta: un caricamento a parte, che non passa dal modulo e continua anche passando alla pianta dopo.
  const carica = useCaricaFoto(espId, { piantaId })
  const senzaRete = useSenzaRete()
  const navigate = useNavigate()
  const [foglio, setFoglio] = useState(false)
  const ordine = useCampoStore(s => s.dati(espId).ordineGiro)
  // Le misure di oggi arrivano già con quelle in coda d'invio sovrapposte (`useMisureGiorno`): una pianta appena
  // misurata senza rete è "fatta" anche qui. Senza le misure gli stati non si inventano.
  const datiGiorno = misureGiorno.data
  const stati = useMemo(
    () => (datiGiorno ? statiPiante(strumento, config.parametri, datiGiorno, config.piante) : null),
    [datiGiorno, strumento, config],
  )
  const celle = useMemo(() => (stati ? celleGriglia(config.piante, stati, piantaId, ordine) : null), [stati, config.piante, piantaId, ordine])
  const progresso = useMemo(() => {
    if (!stati) return null
    const { fatte, totale } = riepilogoGiro(config.piante, stati, ordine)
    return { fatte, totale }
  }, [stati, config.piante, ordine])
  const pianta = config.piante.find(p => p.id === piantaId)
  // Prende il posto della pianta attuale come "Salva e vai" (il gesto indietro esce dal giro), e con valori non salvati
  // chiede prima se scartarli. La pianta attuale non è un salto: il foglio si chiude e i valori scritti restano
  // (scartarli cancellerebbe la bozza lasciandoli a schermo).
  const vaiA = (scelta: Pianta) => {
    if (scelta.id === piantaId) return
    conferma(() => navigate(percorsoMisuraPianta(espId, strumento.id, scelta.id), { replace: true }))
  }
  if (!pianta) {
    // Lo strumento c'è: si torna a scegliere da dove ripartire, non "un altro" strumento.
    return <AvvisoGiro espId={espId} testo="Questa pianta non esiste in questo esperimento." azione="Torna alla scelta dello strumento" />
  }

  const trattamento = config.trattamenti.find(t => t.id === pianta.trattamento_id)
  // Il modulo aspetta le misure della pianta (i progressivi, la domanda all'arrivo) e quelle del giorno (la pianta dopo).
  const inErrore = misure.isError ? misure : misureGiorno.isError ? misureGiorno : null
  // Senza rete (Piano E, Task E7), le misure che non sono nella copia sul telefono non arriveranno: lo si dice, anche
  // dopo un errore (il motivo vero è quello), invece di un caricamento senza fine.
  const mancano = misure.data === undefined ? SENZA_RETE_PIANTA : SENZA_RETE_GIORNO
  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Una riga sola: lascia ai campi lo spazio che prima prendeva il campo "Vai alla pianta". Il numero della
            pianta è l'unico testo grande della schermata (DESIGN.md, "regola del grande unico"); il resto è dato. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="shrink-0">
              <span className="sr-only">Pianta</span>{' '}
              <span className="font-mono text-numero text-grafite tabular-nums">{`#${pianta.etichetta}`}</span>
            </h2>
            <p className="flex min-w-0 items-baseline gap-1.5 font-mono text-dato text-grafite-tenue tabular-nums">
              {trattamento && (
                <>
                  <span aria-hidden>·</span>
                  <span className="sr-only">Trattamento:</span>{' '}
                  <span className="truncate">{trattamento.etichetta}</span>
                </>
              )}
              {progresso && (
                <>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{`${progresso.fatte}/${progresso.totale}`}</span>
                  {' '}<span className="sr-only">piante fatte</span>
                </>
              )}
            </p>
          </div>
          {/* Nell'intestazione, non nella barra delle azioni: non tocca il modulo, le bozze né la conferma di uscita. */}
          <div className="flex shrink-0 items-center">
            <Button
              type="button" variant="quiet" size="icon" aria-label="Vai alla pianta" aria-haspopup="dialog"
              onClick={() => setFoglio(true)}
            >
              <LayoutGrid aria-hidden />
            </Button>
            <PulsanteAggiungiFoto carica={carica} variante="icona" nome="Aggiungi foto a questa pianta" />
          </div>
        </div>
        <BannerData espId={espId} conferma={conferma} />
      </div>
      <FoglioPiante aperto={foglio} onOpenChange={setFoglio} piante={config.piante} celle={celle} onScegli={vaiA} />

      {misure.data === undefined || misureGiorno.data === undefined ? (
        senzaRete
          ? <RigaStato testo={mancano} />
          : inErrore
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

      {/* Sotto il modulo, non nell'intestazione: una riga che compare mentre si scrivono i valori sposterebbe i campi sotto il
          dito. Un errore si nota dal segno sul 📷 e dal toast se si lascia la pagina; qui c'è il dettaglio con «Riprova». */}
      <StatoCaricamentoFoto carica={carica} />
    </>
  )
}

/**
 * Misura sequenziale: una pianta alla volta con lo strumento scelto, alla data di rilievo. "Salva e vai" porta alla
 * prossima pianta da misurare (le fatte si saltano), sull'ultima "Salva e termina" porta alla fine del giro. Valgono
 * tutte le protezioni del modulo di misura: bozze, conferma prima di scartare, niente doppioni.
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
  const senzaRete = useSenzaRete()

  const dati = config.data
  const strumento = dati?.strumenti.find(s => s.id === strumentoId)
  const attivo = strumento && !strumento.archiviato ? strumento : null

  // Lo strumento del giro diventa quello scelto: la home e la scelta dello strumento riprendono da qui. Uno archiviato
  // o inesistente non si sceglie.
  const idAttivo = attivo?.id
  useEffect(() => {
    if (idAttivo && useCampoStore.getState().dati(espId).strumentoId !== idAttivo) setStrumento(espId, idAttivo)
  }, [espId, idAttivo, setStrumento])

  // Misurando dalla scheda della pianta, indietro riporta alla scheda e non alla scelta dello strumento.
  const location = useLocation()
  const daScheda = (location.state as ArrivoScheda | null)?.daScheda === true
  const verso = daScheda ? percorsoPianta(espId, piantaId) : percorsoNuovaMisura(espId)
  return (
    <AppShell
      titolo={attivo ? attivo.nome : 'Misura'}
      indietro={verso}
      onIndietro={onIndietro(verso)}
    >
      {dati === undefined ? (
        senzaRete
          ? <RigaStato testo={SENZA_RETE_ESPERIMENTO} />
          : config.isError
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
