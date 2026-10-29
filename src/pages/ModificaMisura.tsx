import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { eliminaMisura, salvaMisura } from '@/api/misure'
import { chiavi, useConfig, useMisura } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { FormMisura } from '@/components/misura/FormMisura'
import { cancellaBozzaCorrezione } from '@/components/scheda/bozza'
import { ErroreSalvataggio, EsitoControllo, type Controllo } from '@/components/scheda/MessaggiSalvataggio'
import type { StatoModulo } from '@/components/scheda/ModuloOggi'
import { ATTESA_CONFERMA_MS, istante } from '@/components/scheda/salvataggio'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parametriDiUnaMisura, validaMisura, valoriDeiParametri } from '@/domain/misure'
import type { ConfigEsperimento, Misura, Passata, Pianta, Trattamento, ValoriMisura } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { eMisuraNonTrovata, messaggioErrore } from '@/lib/errori'
import { percorsoCampo, percorsoPianta, type ArrivoMisura } from '@/lib/percorsi'
import { toastSalvato } from '@/lib/toastSalvato'

const Caricamento = () => <p role="status" className="text-grafite-tenue">Caricamento…</p>

function NonTrovata({ espId }: { espId: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-grafite">Misura non trovata.</p>
      <p className="text-grafite-tenue">Potrebbe essere stata eliminata, o non essere di questo esperimento.</p>
      <Link to={percorsoCampo(espId)} className={buttonVariants({ variant: 'outline' })}>Torna alla schermata in campo</Link>
    </div>
  )
}

type Azione = 'salva' | 'elimina'

type Stato =
  | { tipo: 'pronto' }
  | { tipo: 'in_corso'; azione: Azione }
  | { tipo: 'errore'; azione: Azione; errore: unknown }

/**
 * Il messaggio di un'operazione fallita quando chi modifica è già uscito dalla pagina: l'esito non va perso in
 * silenzio. La misura è com'era (il server non ha cambiato nulla): si riapre dalla storia della pianta.
 */
function nonCompletataDopoUscita(misura: Misura, esito: string, errore: unknown): string {
  const motivo = messaggioErrore(errore)
  const intro = `Misura del ${formattaData(misura.data_rilievo)} delle ${misura.ora} ${esito}.`
  return `${intro} ${/[.!?…]$/.test(motivo) ? motivo : `${motivo}.`} Riaprila dalla storia della pianta per riprovare.`
}

interface ModuloMisuraProps {
  espId: string
  config: ConfigEsperimento
  misura: Misura
  pianta: Pianta
  passata: Passata
  trattamento: Trattamento | undefined
  /** Torna alla scheda della pianta senza lasciare questa pagina nella cronologia. */
  esci: () => void
  onModifiche: (stato: StatoModulo | null) => void
}

/**
 * La misura caricata: data, ora e valori da correggere, "Salva" nella barra in basso e, a parte, "Elimina misura".
 * I valori di partenza si leggono una volta, all'apertura: un ricaricamento in background non cancella quel che si scrive.
 */
function ModuloMisura({ espId, config, misura, pianta, passata, trattamento, esci, onModifiche }: ModuloMisuraProps) {
  const idData = useId()
  const idOra = useId()
  const queryClient = useQueryClient()

  const [{ parametri, obbligatori }] = useState(() => parametriDiUnaMisura(config, passata, misura.valori))
  const [valori, setValori] = useState<ValoriMisura>(() => valoriDeiParametri(parametri, misura.valori))
  const [data, setData] = useState(misura.data_rilievo)
  const [ora, setOra] = useState(misura.ora)
  const [modificato, setModificato] = useState(false)
  const [controllo, setControllo] = useState<Controllo | null>(null)
  const [avvisiVisti, setAvvisiVisti] = useState(false)
  const [stato, setStato] = useState<Stato>({ tipo: 'pronto' })
  const [fermate, setFermate] = useState(0)
  const [confermaElimina, setConfermaElimina] = useState(false)

  // Il blocco contro il doppio tocco: il pulsante disabilitato arriva solo al prossimo disegno, il ref subito.
  // Riuscita l'operazione resta alzato: la pagina si sta chiudendo e non c'è più nulla da fare qui.
  const inCorso = useRef(false)
  const avvisoAlle = useRef(0)
  const montato = useRef(false)
  const messaggio = useRef<HTMLDivElement>(null)

  useEffect(() => {
    montato.current = true
    return () => { montato.current = false }
  }, [])

  // Mentre l'operazione è partita i valori non si toccano e l'uscita non chiede conferma: sono già andati.
  const occupato = stato.tipo === 'in_corso'
  useEffect(() => {
    onModifiche({ modificato: modificato && !occupato, scarta: () => undefined })
  }, [onModifiche, modificato, occupato])
  useEffect(() => () => onModifiche(null), [onModifiche])

  // Un'operazione fermata (errori, avvisi, rete) porta il focus sul messaggio, che nomina il campo da guardare.
  useEffect(() => {
    if (fermate > 0) messaggio.current?.focus()
  }, [fermate])

  function modifica<T>(imposta: (v: T) => void) {
    return (nuovo: T) => {
      imposta(nuovo)
      setModificato(true)
      // I messaggi erano per i valori di prima: un valore nuovo si ricontrolla (e un avviso si riconferma).
      setControllo(null)
      setAvvisiVisti(false)
    }
  }

  function ferma(c: Controllo) {
    setControllo(c)
    setStato({ tipo: 'pronto' })
    setFermate(n => n + 1)
  }

  /** Riuscita l'operazione la pagina si chiude: la storia della pianta e le liste dei giorni non devono restare com'erano. */
  function aggiornaCache(aggiorna: (prima: Misura[]) => Misura[]) {
    queryClient.setQueryData<Misura[]>(chiavi.misurePianta(misura.pianta_id), prima => prima && aggiorna(prima))
    // La data può essere cambiata: vanno ricaricati entrambi i giorni, quindi tutto il prefisso delle misure.
    void queryClient.invalidateQueries({ queryKey: chiavi.misure })
    void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
  }

  async function salva() {
    if (inCorso.current) return
    const { errori, avvisi } = validaMisura(parametri, obbligatori, valori)
    const mancanti = [
      ...(data === '' ? ['La data di rilievo è obbligatoria.'] : []),
      ...(ora === '' ? ['L\'ora è obbligatoria.'] : []),
    ]
    if (mancanti.length + errori.length > 0) {
      ferma({ tipo: 'errori', messaggi: [...mancanti, ...errori] })
      return
    }
    if (avvisi.length > 0) {
      if (!avvisiVisti) {
        avvisoAlle.current = istante()
        setAvvisiVisti(true)
        ferma({ tipo: 'avvisi', messaggi: avvisi })
        return
      }
      if (istante() - avvisoAlle.current < ATTESA_CONFERMA_MS) return
    }

    // Lo stesso id: l'upsert aggiorna la riga. Le chiavi che il modulo non mostra (altre passate, parametri che non
    // esistono più) restano com'erano.
    const daSalvare: Misura = { ...misura, data_rilievo: data, ora, valori: { ...misura.valori, ...valori } }

    inCorso.current = true
    setControllo(null)
    setStato({ tipo: 'in_corso', azione: 'salva' })
    try {
      await salvaMisura(espId, daSalvare)
    } catch (e) {
      inCorso.current = false
      if (montato.current) {
        setStato({ tipo: 'errore', azione: 'salva', errore: e })
        setFermate(n => n + 1)
      } else {
        toast.error(nonCompletataDopoUscita(misura, 'non salvata', e))
      }
      return
    }

    // La scheda della pianta potrebbe avere una bozza di questa correzione: sopra la modifica appena fatta
    // riproporrebbe i valori vecchi. I valori ricordati per le piante dopo restano com'erano: correggere una misura
    // vecchia non è l'ultima misura inserita.
    cancellaBozzaCorrezione(espId, misura)
    toastSalvato('Misura aggiornata ✓')
    aggiornaCache(prima => prima.map(x => (x.id === daSalvare.id ? daSalvare : x)))
    if (montato.current) esci()
  }

  async function elimina() {
    if (inCorso.current) return
    inCorso.current = true
    setControllo(null)
    setStato({ tipo: 'in_corso', azione: 'elimina' })
    try {
      await eliminaMisura(misura.id)
    } catch (e) {
      inCorso.current = false
      if (montato.current) {
        setStato({ tipo: 'errore', azione: 'elimina', errore: e })
        setFermate(n => n + 1)
      } else {
        toast.error(nonCompletataDopoUscita(misura, 'non eliminata', e))
      }
      return
    }

    cancellaBozzaCorrezione(espId, misura)
    // Un esito neutro: il segno verde è dei salvataggi (DESIGN.md).
    toast.success('Misura eliminata.')
    aggiornaCache(prima => prima.filter(x => x.id !== misura.id))
    if (montato.current) esci()
  }

  const salvando = stato.tipo === 'in_corso' && stato.azione === 'salva'
  const eliminando = stato.tipo === 'in_corso' && stato.azione === 'elimina'

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
        <p className="flex items-center gap-2 font-medium text-grafite">
          {passata.icona && <span aria-hidden>{passata.icona}</span>}
          {passata.nome}
        </p>
      </div>

      <section aria-label="Valori della misura" className="rounded-lg bg-carta-ombra p-4">
        {/* Mentre l'operazione è partita il modulo non si tocca: quel che si scrive adesso andrebbe perso. */}
        <div inert={occupato} className="flex flex-col gap-6">
          {/* Affiancati se ci stanno; su un telefono stretto l'ora va sotto la data. */}
          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-44 flex-1 flex-col gap-1.5">
              <Label htmlFor={idData}>Data di rilievo</Label>
              <Input
                id={idData}
                type="date"
                variant="campo"
                value={data}
                // Come nella schermata in campo: ogni data è ammessa, anche futura. Senza data non si salva.
                onChange={e => modifica(setData)(e.target.value)}
              />
            </div>
            <div className="flex w-32 shrink-0 flex-col gap-1.5">
              <Label htmlFor={idOra}>Ora</Label>
              <Input
                id={idOra}
                type="time"
                variant="campo"
                value={ora}
                onChange={e => modifica(setOra)(e.target.value.slice(0, 5))}
              />
            </div>
          </div>

          {parametri.length > 0 ? (
            <FormMisura parametri={parametri} obbligatori={obbligatori} valori={valori} onChange={modifica(setValori)} />
          ) : (
            <p className="text-grafite-tenue">Questa misura non ha valori da correggere.</p>
          )}
        </div>
      </section>

      {/* Lontano da "Salva", che sta in basso: l'eliminazione non si tocca per sbaglio con il pollice. */}
      <Button variant="destructive" className="self-start" disabled={occupato} onClick={() => setConfermaElimina(true)}>
        <Trash2 aria-hidden />
        {eliminando ? 'Eliminazione…' : 'Elimina misura'}
      </Button>

      <BarraAzioni>
        {controllo ? (
          <EsitoControllo ref={messaggio} controllo={controllo} />
        ) : stato.tipo === 'errore' ? (
          <ErroreSalvataggio
            ref={messaggio}
            etichetta={pianta.etichetta}
            titolo={stato.azione === 'elimina' ? 'Misura non eliminata.' : undefined}
            errore={stato.errore}
            onRiprova={() => void (stato.azione === 'elimina' ? elimina() : salva())}
          />
        ) : null}
        <Button size="lg" className="w-full" disabled={occupato} onClick={() => void salva()}>
          {salvando ? 'Salvataggio…' : avvisiVisti ? 'Salva comunque' : 'Salva'}
        </Button>
      </BarraAzioni>

      <Conferma
        aperta={confermaElimina}
        titolo="Eliminare la misura?"
        testo={`Eliminare la misura del ${formattaData(misura.data_rilievo)} alle ${misura.ora}? L'operazione non si può annullare.`}
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setConfermaElimina(false)}
        onConferma={() => {
          setConfermaElimina(false)
          void elimina()
        }}
      />
    </>
  )
}

/**
 * Modifica di una misura già registrata, di qualunque giorno: data, ora e valori, oppure eliminazione. Vale anche per
 * gli esperimenti conclusi: i dati restano modificabili (spec §5.6).
 */
export function ModificaMisura() {
  const { espId = '', misuraId = '' } = useParams()
  const navigate = useNavigate()
  const arrivo = useLocation().state as ArrivoMisura | null
  const config = useConfig(espId)
  const misura = useMisura(misuraId)

  // Il modulo aperto dice se ha modifiche non salvate; si legge al momento del tocco (come in SchedaPianta).
  const modulo = useRef<StatoModulo | null>(null)
  const onModifiche = useCallback((stato: StatoModulo | null) => { modulo.current = stato }, [])
  const [inAttesa, setInAttesa] = useState<{ esegui: () => void } | null>(null)

  // Chiudere o ricaricare la scheda del browser con modifiche non salvate: il browser chiede conferma.
  useEffect(() => {
    const avvisa = (evento: BeforeUnloadEvent) => {
      if (!modulo.current?.modificato) return
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [])

  // Una misura è di questo esperimento se la sua pianta e la sua passata sono nella configurazione: la lettura per id
  // non dice di quale esperimento sia, e una di un altro si tratta come se non ci fosse.
  const dati = config.data
  const trovata = misura.data
  const pianta = dati && trovata ? dati.piante.find(p => p.id === trovata.pianta_id) : undefined
  const passata = dati && trovata ? dati.passate.find(p => p.id === trovata.passata_id) : undefined
  const alla = pianta ? percorsoPianta(espId, pianta.id) : null

  // Tornati alla scheda la modifica non deve restare nella cronologia: dalla storia della pianta si torna indietro di
  // una voce; arrivati da un link diretto non c'è una voce della scheda a cui tornare, si sostituisce questa.
  const esci = useCallback(() => {
    if (arrivo?.daScheda) navigate(-1)
    else if (alla) navigate(alla, { replace: true })
  }, [arrivo, navigate, alla])

  function scarta() {
    const azione = inAttesa
    setInAttesa(null)
    azione?.esegui()
  }

  function contenuto() {
    // Gli errori di una lettura in background non tolgono i dati già arrivati: si mostrano solo senza dati.
    if (trovata === undefined && misura.isError) {
      return eMisuraNonTrovata(misura.error)
        ? <NonTrovata espId={espId} />
        : <ErroreConRiprova errore={misura.error} onRiprova={() => void misura.refetch()} />
    }
    if (dati === undefined) {
      return config.isError
        ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
        : <Caricamento />
    }
    if (trovata === undefined) return <Caricamento />
    if (!pianta || !passata) return <NonTrovata espId={espId} />
    return (
      <ModuloMisura
        key={trovata.id}
        espId={espId}
        config={dati}
        misura={trovata}
        pianta={pianta}
        passata={passata}
        trattamento={dati.trattamenti.find(t => t.id === pianta.trattamento_id)}
        esci={esci}
        onModifiche={onModifiche}
      />
    )
  }

  return (
    <AppShell
      titolo="Modifica misura"
      indietro={alla ?? percorsoCampo(espId)}
      onIndietro={alla ? evento => {
        // La freccia fa lo stesso ritorno del salvataggio, dopo aver chiesto se scartare le modifiche.
        evento.preventDefault()
        if (modulo.current?.modificato) setInAttesa({ esegui: esci })
        else esci()
      } : undefined}
    >
      {contenuto()}
      <Conferma
        aperta={inAttesa !== null}
        titolo="Scartare i valori non salvati?"
        testo="Le modifiche a questa misura andranno perse."
        annulla="Continua a modificare"
        conferma="Scarta"
        onAnnulla={() => setInAttesa(null)}
        onConferma={scarta}
      />
    </AppShell>
  )
}
