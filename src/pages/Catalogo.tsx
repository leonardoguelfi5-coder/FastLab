import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { applicaAggiornamento, archiviaVoceCatalogo, copieDiProprieta, salvaVoceCatalogo } from '@/api/catalogo'
import { chiavi, useCatalogo } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Conferma } from '@/components/Conferma'
import { EditorStrumento, type StrumentoConValori } from '@/components/config/EditorStrumento'
import { valoreCatalogo } from '@/components/config/riassunti'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { nuovoStrumento, problemiParametro, problemiStrumento } from '@/domain/bozza'
import { bozzaDaVoce, pianoAggiornamento, problemiVoce, voceDaModifica } from '@/domain/catalogo'
import type { VoceCatalogo } from '@/domain/tipi'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { toastSalvato } from '@/lib/toastSalvato'

/** Lo strumento in modifica con la sua descrizione (che nello strumento di un esperimento non c'è). */
interface Bozza extends StrumentoConValori {
  descrizione: string
}

interface Modifica {
  /** La voce com'era quando si è aperto l'editor (la `vecchia` del piano di aggiornamento); null per una voce nuova. */
  vecchia: VoceCatalogo | null
  /** L'id della voce. Per una nuova lo sceglie la pagina una volta sola: un nuovo tentativo è un upsert della stessa voce. */
  id: string
  bozza: Bozza
  /** La bozza com'era all'apertura, per sapere se c'è qualcosa da perdere. */
  iniziale: string
}

/** Cosa resta in pagina dopo aver salvato con "Aggiorna anche i miei esperimenti". */
type Esito =
  | { tipo: 'saltati'; saltati: string[] }
  | { tipo: 'errore'; messaggio: string; vecchia: VoceCatalogo; nuova: VoceCatalogo }

const AIUTO_CASELLA = 'Solo gli esperimenti di cui sei proprietario. I valori con misure o ritoccati a mano non cambiano.'

function apriModifica(vecchia: VoceCatalogo | null): Modifica {
  const bozza: Bozza = vecchia
    ? { ...bozzaDaVoce(vecchia), descrizione: vecchia.descrizione }
    : { strumento: nuovoStrumento(0), parametri: [], descrizione: '' }
  return { vecchia, id: vecchia?.id ?? nuovoId(), bozza, iniziale: JSON.stringify(bozza) }
}

/**
 * Il catalogo degli strumenti (spec §5.10), condiviso tra tutti gli esperimenti: l'elenco delle voci e, toccandone una,
 * il suo editor (solo valori numerici). Salvare cambia il catalogo; gli esperimenti che hanno già copiato la voce
 * non cambiano, a meno di spuntare "Aggiorna anche i miei esperimenti" (solo i propri, solo modifiche sicure, spec §6.3).
 */
export function Catalogo() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const catalogo = useCatalogo()
  const idCasella = useId()

  const [modifica, setModifica] = useState<Modifica | null>(null)
  const [aggiorna, setAggiorna] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<Esito | null>(null)
  const [conferma, setConferma] = useState<'archivia' | 'esci' | 'chiudi' | null>(null)
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)

  const modificato = modifica !== null && JSON.stringify(modifica.bozza) !== modifica.iniziale

  // Chiudere o ricaricare la scheda con una voce non salvata: il browser chiede conferma.
  const daSalvare = useRef(false)
  useEffect(() => { daSalvare.current = modificato }, [modificato])
  useEffect(() => {
    const avvisa = (evento: BeforeUnloadEvent) => {
      if (!daSalvare.current) return
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [])

  const problemi = modifica === null ? [] : [...new Set([
    ...problemiStrumento(modifica.bozza.strumento, []),
    ...modifica.bozza.parametri.flatMap(p => problemiParametro(p, modifica.bozza.parametri)),
  ])]

  function apri(vecchia: VoceCatalogo | null) {
    setModifica(apriModifica(vecchia))
    setAggiorna(false)
    setErrore(null)
    // I saltati sono di quella voce e si azzerano; l'errore della fase esperimenti no: con il suo "Riprova" è l'unico
    // modo di finire l'aggiornamento, e resta finché non riesce o non lo si chiude.
    setEsito(prima => (prima?.tipo === 'errore' ? prima : null))
  }

  /** Il lavoro di una sola operazione alla volta: ferma il doppio invio e tiene i pulsanti spenti fino alla fine. */
  async function senzaDoppioni(lavoro: () => Promise<void>) {
    if (inCorso.current) return
    inCorso.current = true
    setOccupato(true)
    try {
      await lavoro()
    } finally {
      inCorso.current = false
      setOccupato(false)
    }
  }

  /**
   * La parte "i miei esperimenti" del salvataggio: legge le copie, calcola il piano tra la voce di prima e quella
   * nuova e lo applica. Con la `vecchia` di sempre si può rifare da capo: un piano calcolato con la voce appena
   * salvata sarebbe vuoto. Gli esperimenti toccati si rileggono anche se il piano si ferma a metà.
   */
  async function aggiornaEsperimenti(vecchia: VoceCatalogo, nuova: VoceCatalogo): Promise<Esito | null> {
    try {
      const piano = pianoAggiornamento(vecchia, nuova, await copieDiProprieta(nuova.id))
      const toccati = new Set([...piano.aggiunte.map(a => a.espId), ...piano.modifiche.map(m => m.espId)])
      try {
        await applicaAggiornamento(piano)
      } finally {
        for (const espId of toccati) void queryClient.invalidateQueries({ queryKey: chiavi.config(espId) })
      }
      toastSalvato('Catalogo aggiornato.')
      return piano.saltati.length > 0 ? { tipo: 'saltati', saltati: piano.saltati } : null
    } catch (e) {
      return { tipo: 'errore', messaggio: messaggioErrore(e), vecchia, nuova }
    }
  }

  function salva() {
    if (!modifica || problemi.length > 0 || !modificato) return
    void senzaDoppioni(async () => {
      setErrore(null)
      const nuova = voceDaModifica(modifica.bozza.strumento, modifica.bozza.parametri, {
        id: modifica.id, descrizione: modifica.bozza.descrizione,
      })
      // Il database non controlla le chiavi dei valori e l'aggiornamento degli esperimenti le confronta: meglio fermarsi.
      const guasti = problemiVoce(nuova)
      if (guasti.length > 0) {
        setErrore(guasti[0])
        return
      }
      try {
        await salvaVoceCatalogo(nuova)
      } catch (e) {
        setErrore(messaggioErrore(e))
        return
      }
      // Si aspetta l'elenco riletto prima di tornarci: riaprendo subito la voce non si parte dalla versione vecchia,
      // che salvata di nuovo annullerebbe la modifica appena fatta.
      await queryClient.invalidateQueries({ queryKey: chiavi.catalogo })
      const { vecchia } = modifica
      if (vecchia && aggiorna) {
        const nuovo = await aggiornaEsperimenti(vecchia, nuova)
        setEsito(prima => nuovo ?? (prima?.tipo === 'errore' ? prima : null))
      } else {
        toastSalvato(vecchia ? 'Catalogo aggiornato.' : 'Strumento aggiunto al catalogo.')
        setEsito(prima => (prima?.tipo === 'errore' ? prima : null))
      }
      setModifica(null)
    })
  }

  function riprova(e: Extract<Esito, { tipo: 'errore' }>) {
    void senzaDoppioni(async () => setEsito(await aggiornaEsperimenti(e.vecchia, e.nuova)))
  }

  function archivia() {
    const vecchia = modifica?.vecchia
    setConferma(null)
    if (!vecchia) return
    void senzaDoppioni(async () => {
      try {
        await archiviaVoceCatalogo(vecchia.id)
      } catch (e) {
        setErrore(messaggioErrore(e))
        return
      }
      await queryClient.invalidateQueries({ queryKey: chiavi.catalogo })
      // Un'archiviazione non è un salvataggio: toast neutro, il segno verde è dei salvataggi (DESIGN.md).
      toast.success('Strumento archiviato.')
      setEsito(prima => (prima?.tipo === 'errore' ? prima : null))
      setModifica(null)
    })
  }

  const voci = catalogo.data
  return (
    <AppShell
      titolo="Catalogo strumenti"
      indietro="/"
      onIndietro={evento => {
        if (!modificato) return
        evento.preventDefault()
        setConferma('esci')
      }}
    >
      {modifica ? (
        <>
          <EditorStrumento
            valore={modifica.bozza}
            onChange={v => setModifica(m => (m ? { ...m, bozza: { ...m.bozza, ...v } } : m))}
            descrizione={modifica.bozza.descrizione}
            onDescrizione={descrizione => setModifica(m => (m ? { ...m, bozza: { ...m.bozza, descrizione } } : m))}
          />
          {problemi.length > 0 && <div className="flex flex-col gap-1">{problemi.map(p => <TestoErrore key={p}>{p}</TestoErrore>)}</div>}

          {modifica.vecchia && (
            <div className="flex flex-col gap-0.5">
              <label htmlFor={idCasella} className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-medium text-grafite">
                <input
                  id={idCasella}
                  type="checkbox"
                  checked={aggiorna}
                  disabled={occupato}
                  aria-describedby={`${idCasella}-aiuto`}
                  onChange={e => setAggiorna(e.target.checked)}
                  className="size-6 shrink-0 cursor-pointer accent-inchiostro"
                />
                Aggiorna anche i miei esperimenti
              </label>
              <p id={`${idCasella}-aiuto`} className="pl-9 text-sm text-grafite-tenue">{AIUTO_CASELLA}</p>
            </div>
          )}

          {errore && (
            <div role="alert">
              <TestoErrore className="text-base">{errore}</TestoErrore>
            </div>
          )}

          {modifica.vecchia && (
            // Secondario e non rosso, come "Archivia strumento" nelle impostazioni: archiviare non cancella nulla.
            <Button variant="outline" size="sm" className="self-start" disabled={occupato} onClick={() => setConferma('archivia')}>
              Archivia dal catalogo
            </Button>
          )}

          <BarraAzioni>
            <Button size="lg" disabled={!modificato || problemi.length > 0 || occupato} onClick={salva}>
              {occupato ? 'Salvataggio…' : 'Salva'}
            </Button>
            <Button variant="outline" disabled={occupato} onClick={() => (modificato ? setConferma('chiudi') : setModifica(null))}>
              Annulla
            </Button>
          </BarraAzioni>
        </>
      ) : (
        <>
          <p className="max-w-[65ch] text-grafite-tenue">
            Il catalogo è condiviso: lo vedono tutti. Cambiare una voce non cambia gli esperimenti che l'hanno già copiata, a meno che tu non lo chieda al salvataggio.
          </p>

          {esito?.tipo === 'saltati' && (
            <section aria-label="Non aggiornati" className="flex flex-col gap-2 border-y border-riga bg-carta-ombra px-4 py-4 -mx-4">
              <p className="text-base font-semibold text-grafite">Non aggiornati:</p>
              <ul className="flex flex-col gap-1.5 text-sm text-grafite">
                {esito.saltati.map(s => <li key={s} className="break-words">{s}</li>)}
              </ul>
              <Button variant="ghost" size="sm" className="-ml-3 self-start" onClick={() => setEsito(null)}>Chiudi</Button>
            </section>
          )}
          {esito?.tipo === 'errore' && (
            <div role="alert" className="flex flex-col items-start gap-1">
              <TestoErrore className="text-base">
                {`Catalogo salvato, ma i tuoi esperimenti non sono stati aggiornati: ${esito.messaggio}`}
              </TestoErrore>
              <div className="-ml-3 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" disabled={occupato} onClick={() => riprova(esito)}>Riprova</Button>
                {/* Chiudere non riprova: gli esperimenti restano come sono, si aggiornano salvando di nuovo la voce. */}
                <Button variant="ghost" size="sm" disabled={occupato} onClick={() => setEsito(null)}>Chiudi</Button>
              </div>
            </div>
          )}

          {voci === undefined ? (
            catalogo.isError
              ? <ErroreConRiprova errore={catalogo.error} onRiprova={() => void catalogo.refetch()} />
              : <p role="status" className="text-grafite-tenue">Caricamento…</p>
          ) : voci.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-title text-grafite">Il catalogo è vuoto.</p>
              <p className="max-w-[65ch] text-grafite-tenue">
                Ogni strumento che crei qui si aggiunge a un esperimento con un tocco, con tutti i suoi valori.
              </p>
            </div>
          ) : (
            <ul aria-label="Catalogo strumenti" className="-mx-4 flex flex-col border-t border-riga">
              {voci.map(v => (
                <li key={v.id} className="border-b border-riga">
                  <button
                    type="button"
                    onClick={() => apri(v)}
                    className="flex min-h-14 w-full flex-col gap-0.5 px-4 py-3.5 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
                  >
                    <span className="text-title break-words text-grafite">{[v.icona, v.nome].filter(Boolean).join(' ')}</span>
                    <span className="text-dato font-mono tabular-nums break-words text-grafite-tenue">{v.parametri.map(valoreCatalogo).join(' · ')}</span>
                    {v.descrizione !== '' && <span className="text-sm break-words text-grafite-tenue">{v.descrizione}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <BarraAzioni>
            <Button size="lg" onClick={() => apri(null)}>+ Nuovo strumento</Button>
          </BarraAzioni>
        </>
      )}

      <Conferma
        aperta={conferma === 'archivia'}
        titolo="Archiviare lo strumento?"
        testo={`Archiviare "${modifica?.vecchia?.nome ?? ''}"? Non comparirà più tra gli strumenti da aggiungere; gli esperimenti che lo usano non cambiano.`
          + (modificato ? ' Le modifiche non salvate di questa voce andranno perse.' : '')}
        annulla="Annulla"
        conferma="Archivia"
        onAnnulla={() => setConferma(null)}
        onConferma={archivia}
      />
      <Conferma
        aperta={conferma === 'esci' || conferma === 'chiudi'}
        titolo="Scartare le modifiche non salvate?"
        testo="Le modifiche a questa voce del catalogo andranno perse."
        annulla="Continua a modificare"
        conferma="Scarta"
        onAnnulla={() => setConferma(null)}
        onConferma={() => {
          const cosa = conferma
          setConferma(null)
          if (cosa === 'esci') navigate('/')
          else setModifica(null)
        }}
      />
    </AppShell>
  )
}
