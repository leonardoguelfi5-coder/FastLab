import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { salvaNota, segnaFatto } from '@/api/note'
import { chiavi, useConfig, useNote } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Conferma } from '@/components/Conferma'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { TestoErrore } from '@/components/TestoErrore'
import { Button } from '@/components/ui/button'
import { cancellaBozzaNota, leggiBozzaNota, notaAperta, scriviBozzaNota } from '@/components/note/bozzaNota'
import { EditorNota } from '@/components/note/EditorNota'
import { chiaveEliminazioneNota, eliminaNotaConAnnulla } from '@/components/note/eliminaNotaConAnnulla'
import { RigaNota } from '@/components/note/RigaNota'
import { spuntaNota } from '@/components/note/spuntaNota'
import {
  conData, daRiaprire, firma, notaDaStato, problemiNota, statoDaNota, statoVuoto, type StatoNota,
} from '@/components/note/statoNota'
import type { ConfigEsperimento, Nota } from '@/domain/tipi'
import { oggiLocale } from '@/lib/date'
import { inEliminazione } from '@/lib/eliminaConAnnulla'
import { messaggioErrore } from '@/lib/errori'
import { nuovoId } from '@/lib/id'
import { percorsoHome } from '@/lib/percorsi'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { toastSalvato } from '@/lib/toastSalvato'
import { useOggi } from '@/lib/useOggi'

/** La nota nell'editor: una nuova (`esistente` null) o la modifica di una già salvata. */
interface Modifica {
  /** L'id con cui la nota si salva. Per una nuova lo sceglie la pagina una volta sola: un nuovo tentativo è un upsert della stessa nota. */
  id: string
  esistente: Nota | null
  /** Com'era all'apertura: se lo stato è diverso, c'è qualcosa da perdere. */
  base: StatoNota
  stato: StatoNota
  /** Riparte da una bozza lasciata a metà. */
  ripresa: boolean
}

/** Lascia nella bozza solo ciò che esiste ancora: una pianta o un trattamento tolti nel frattempo farebbero fallire il salvataggio. */
function senzaIdSconosciuti(stato: StatoNota, config: ConfigEsperimento): StatoNota {
  const piante = new Set(config.piante.map(p => p.id))
  const trattamenti = new Set(config.trattamenti.map(t => t.id))
  return {
    ...stato,
    pianta_ids: stato.pianta_ids.filter(id => piante.has(id)),
    trattamento_ids: stato.trattamento_ids.filter(id => trattamenti.has(id)),
  }
}

/**
 * Lo stato con la casella "Ricordamelo quel giorno" coerente con il giorno di oggi: una data scelta ieri come
 * "domani" oggi non è più futura, e la casella (se non toccata a mano) deve mostrare ciò che si salverebbe.
 */
function coerenteConOggi(stato: StatoNota, esistente: Nota | null, oggi: string): StatoNota {
  return conData(stato, stato.data, oggi, esistente?.promemoria ?? false)
}

/**
 * Se l'ultima volta si è usciti dal Diario senza passare dall'app (gesto indietro, ricarica) con una nota a metà,
 * riparte da lì. Una nota che nel frattempo non c'è più (eliminata altrove) si riprende come nuova, con lo stesso id:
 * il testo scritto non va perso.
 */
function riprendi(espId: string, config: ConfigEsperimento, note: Nota[], oggi: string): Modifica | null {
  const id = notaAperta(espId)
  if (id === null) return null
  const bozza = leggiBozzaNota(espId, id)
  if (!bozza) return null
  const esistente = note.find(n => n.id === id) ?? null
  return {
    id,
    esistente,
    base: esistente ? statoDaNota(esistente) : statoVuoto(oggi),
    stato: coerenteConOggi(senzaIdSconosciuti(bozza.stato, config), esistente, oggi),
    ripresa: true,
  }
}

/** Il Diario dell'esperimento (spec §5.7): le note per data e, in pagina, l'editor per scriverne o ritoccarne una. */
export function Diario() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const note = useNote(espId)

  if (config.data === undefined || note.data === undefined) {
    return (
      <AppShell titolo="Diario" indietro={percorsoHome(espId)}>
        {config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : note.isError
            ? <ErroreConRiprova errore={note.error} onRiprova={() => void note.refetch()} />
            : <p role="status" className="text-grafite-tenue">Caricamento…</p>}
      </AppShell>
    )
  }
  return <DiarioCaricato key={espId} espId={espId} config={config.data} note={note.data} />
}

function DiarioCaricato({ espId, config, note }: { espId: string; config: ConfigEsperimento; note: Nota[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // A mezzanotte la nota aperta riapplica la regola del promemoria con il giorno nuovo: la casella mostra ciò che si salva.
  const oggi = useOggi((_prima, dopo) => {
    if (!modifica) return
    const stato = coerenteConOggi(modifica.stato, modifica.esistente, dopo)
    if (stato.promemoria !== modifica.stato.promemoria) cambia(stato)
  })

  const [modifica, setModifica] = useState<Modifica | null>(() => riprendi(espId, config, note, oggi))
  const [apertaId, setApertaId] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [conferma, setConferma] = useState<'esci' | 'chiudi' | null>(null)
  // Il doppio tocco si ferma subito, prima che il pulsante risulti disabilitato.
  const inCorso = useRef(false)
  // Quale nota è aperta e se la pagina c'è ancora: un salvataggio che finisce male dopo l'uscita lo deve sapere.
  const idAperto = useRef<string | null>(null)
  const montata = useRef(false)
  useEffect(() => { idAperto.current = modifica?.id ?? null }, [modifica?.id])
  useEffect(() => {
    montata.current = true
    return () => { montata.current = false }
  }, [])

  const modificato = modifica !== null && firma(modifica.stato) !== firma(modifica.base)
  const problemi = modifica === null ? [] : problemiNota(modifica.stato)

  // Chiudere o ricaricare la scheda con una nota non salvata: il browser chiede conferma.
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

  function apriNuova() {
    const stato = statoVuoto(oggi)
    setModifica({ id: nuovoId(), esistente: null, base: stato, stato, ripresa: false })
    setErrore(null)
  }

  function apriModifica(nota: Nota) {
    const base = statoDaNota(nota)
    // Una bozza lasciata a metà su questa nota (uscita senza passare dall'app) ha la precedenza.
    const bozza = leggiBozzaNota(espId, nota.id)
    setModifica({
      id: nota.id, esistente: nota, base, ripresa: bozza !== null,
      stato: bozza ? coerenteConOggi(senzaIdSconosciuti(bozza.stato, config), nota, oggi) : base,
    })
    setApertaId(null)
    setErrore(null)
  }

  /** Ogni modifica passa dalla bozza nel sessionStorage; tornata uguale all'originale, la bozza non serve più. */
  function cambia(stato: StatoNota) {
    // Durante il salvataggio non si tocca più nulla: una bozza riscritta dopo il salvataggio resterebbe orfana.
    if (!modifica || inCorso.current) return
    setModifica({ ...modifica, stato })
    if (firma(stato) === firma(modifica.base)) cancellaBozzaNota(espId, modifica.id)
    else scriviBozzaNota(espId, { id: modifica.id, esistente: modifica.esistente !== null, stato })
  }

  function chiudi() {
    if (modifica) cancellaBozzaNota(espId, modifica.id)
    setModifica(null)
    setErrore(null)
  }

  async function salva() {
    if (!modifica || inCorso.current) return
    if (modifica.stato.testo.trim() === '' || problemiNota(modifica.stato).length > 0 || !modificato) return
    inCorso.current = true
    setOccupato(true)
    setErrore(null)
    const { id, esistente } = modifica
    // Il giorno di adesso, non quello di quando si è aperto l'editor: a mezzanotte "futura" può non esserlo più.
    const adesso = oggiLocale()
    const nuova = notaDaStato(id, modifica.stato, esistente, adesso)
    try {
      // Un promemoria già fatto, spostato in avanti, torna da fare: prima la spunta, poi la nota.
      if (daRiaprire(esistente, nuova, adesso)) await segnaFatto(espId, id, false)
      await salvaNota(espId, nuova)
    } catch (e) {
      if (!montata.current || idAperto.current !== id) {
        // Si è usciti (o si è passati ad altro) mentre il salvataggio era in viaggio: nessun editor dove mostrare
        // l'errore. La bozza si riscrive (l'uscita l'aveva tolta) e il toast resta finché non lo si chiude.
        scriviBozzaNota(espId, { id, esistente: esistente !== null, stato: modifica.stato })
        toast.error(`La nota non è stata salvata: ${messaggioErrore(e)} Riapri il Diario: la trovi come bozza.`, OPZIONI_ERRORE_TARDIVO)
      } else {
        setErrore(messaggioErrore(e))
      }
      // La bozza e l'editor restano come sono: si riprova con lo stesso id. L'elenco si rilegge comunque, la nota
      // potrebbe essere arrivata a metà.
      void queryClient.invalidateQueries({ queryKey: chiavi.note(espId) })
      inCorso.current = false
      setOccupato(false)
      return
    }
    cancellaBozzaNota(espId, id)
    // Si aspetta l'elenco riletto prima di tornarci: la nota salvata compare subito.
    await queryClient.invalidateQueries({ queryKey: chiavi.note(espId) })
    toastSalvato(esistente ? 'Nota aggiornata.' : 'Nota salvata.')
    setModifica(null)
    inCorso.current = false
    setOccupato(false)
  }

  // Le note in attesa di eliminazione restano fuori anche se l'elenco viene riletto dal server nei 5 secondi.
  const visibili = note.filter(n => !inEliminazione(chiaveEliminazioneNota(n.id)))

  return (
    <AppShell
      titolo={modifica ? (modifica.esistente ? 'Modifica nota' : 'Nuova nota') : 'Diario'}
      indietro={percorsoHome(espId)}
      onIndietro={evento => {
        // Salvataggio in viaggio: né uscita né scarto, come per il pulsante Annulla. Scartare ora cancellerebbe la
        // bozza proprio mentre il salvataggio potrebbe fallire.
        if (inCorso.current) {
          evento.preventDefault()
          return
        }
        if (!modificato) return
        evento.preventDefault()
        setConferma('esci')
      }}
    >
      {modifica ? (
        <>
          <EditorNota
            espId={espId}
            config={config}
            stato={modifica.stato}
            onCambia={cambia}
            oggi={oggi}
            eraPromemoria={modifica.esistente?.promemoria ?? false}
            notaSalvataId={modifica.esistente?.id ?? null}
            nuova={modifica.esistente === null}
            ripresa={modifica.ripresa}
            problemi={problemi}
            disabilitato={occupato}
          />
          {errore && (
            <div role="alert">
              <TestoErrore className="text-base">{errore}</TestoErrore>
            </div>
          )}
          <BarraAzioni>
            <Button
              size="lg"
              disabled={!modificato || modifica.stato.testo.trim() === '' || problemi.length > 0 || occupato}
              onClick={() => void salva()}
            >
              {occupato ? 'Salvataggio…' : 'Salva'}
            </Button>
            <Button variant="outline" disabled={occupato} onClick={() => (modificato ? setConferma('chiudi') : chiudi())}>
              Annulla
            </Button>
          </BarraAzioni>
        </>
      ) : (
        <>
          {visibili.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-title text-grafite">Nessuna nota.</p>
              <p className="max-w-[65ch] text-grafite-tenue">
                Il diario raccoglie le osservazioni dell&apos;esperimento. Con una data futura una nota diventa un promemoria:
                quel giorno compare in Oggi.
              </p>
            </div>
          ) : (
            <ul aria-label="Note del diario" className="-mx-4 flex flex-col border-t border-riga">
              {visibili.map(n => (
                <RigaNota
                  key={n.id}
                  nota={n}
                  config={config}
                  aperta={apertaId === n.id}
                  onApri={() => setApertaId(prima => (prima === n.id ? null : n.id))}
                  onModifica={() => apriModifica(n)}
                  onElimina={() => {
                    setApertaId(null)
                    eliminaNotaConAnnulla(queryClient, espId, n)
                  }}
                  onSpunta={() => void spuntaNota(queryClient, espId, n)}
                />
              ))}
            </ul>
          )}
          <BarraAzioni>
            <Button size="lg" onClick={apriNuova}>+ Nuova nota</Button>
          </BarraAzioni>
        </>
      )}

      <Conferma
        aperta={conferma !== null}
        titolo="Scartare le modifiche non salvate?"
        testo="La nota che stai scrivendo andrà persa."
        annulla="Continua a modificare"
        conferma="Scarta"
        onAnnulla={() => setConferma(null)}
        onConferma={() => {
          const cosa = conferma
          setConferma(null)
          chiudi()
          if (cosa === 'esci') navigate(percorsoHome(espId))
        }}
      />
    </AppShell>
  )
}
