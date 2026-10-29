import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { salvaMisura } from '@/api/misure'
import { chiavi } from '@/api/query'
import { BarraAzioni } from '@/components/BarraAzioni'
import { FormMisura } from '@/components/misura/FormMisura'
import { Button } from '@/components/ui/button'
import { validaMisura, valoreVuoto, valoriIniziali } from '@/domain/misure'
import type { ConfigEsperimento, Misura, Parametro, Passata, Pianta, ValoriMisura } from '@/domain/tipi'
import { formattaData, oraLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { percorsoPianta } from '@/lib/percorsi'
import { toastSalvato } from '@/lib/toastSalvato'
import { useCampoStore } from '@/store/campo'
import { CampoOra } from './CampoOra'
import { ErroreSalvataggio, EsitoControllo, type Controllo } from './MessaggiSalvataggio'
import { VociMisura } from './VociMisura'
import { vociMisura } from './voci'

/** Stato della navigazione verso una scheda: dopo "Salva e vai" il cursore va nel primo campo da compilare. */
interface ArrivoScheda { primoCampo?: boolean }

/** "vai": salva e apre la pianta successiva; "resta": salva e ricomincia con una misura nuova della stessa pianta. */
type Azione = 'vai' | 'resta'

type Stato =
  | { tipo: 'pronto' }
  | { tipo: 'salvando'; azione: Azione }
  | { tipo: 'errore'; azione: Azione; errore: unknown }

const confronta = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** I parametri da compilare con una passata: nel suo ordine, senza gli archiviati. */
function parametriDellaPassata(config: ConfigEsperimento, passata: Passata): Parametro[] {
  const perId = new Map(config.parametri.map(p => [p.id, p]))
  return [...passata.parametri]
    .sort((a, b) => a.ordine - b.ordine)
    .map(pp => perId.get(pp.parametro_id))
    .filter((p): p is Parametro => p !== undefined && !p.archiviato)
}

/** I valori di una misura già registrata per i soli parametri del modulo (gli altri restano nella misura). */
function valoriDellaMisura(parametri: Parametro[], m: Misura): ValoriMisura {
  return Object.fromEntries(parametri.map(p => [p.id, m.valori[p.id] ?? valoreVuoto(p)]))
}

interface RiquadroOggiProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  passata: Passata
  /** Tutte le misure della pianta, già caricate. */
  misure: Misura[]
  dataRilievo: string
  oggi: string
  /** La pianta che segue nell'ordine dell'esperimento; `null` sull'ultima. */
  successiva: Pianta | null
}

/**
 * Il riquadro "Oggi · 🌡 Termometro" della scheda: le misure già fatte con questa passata alla data di rilievo e il
 * modulo per una misura nuova o per correggerne una. Il modulo ha un id generato all'apertura (o quello della misura
 * che si corregge) e si rimonta quando cambia: così un "Annulla" in sospeso non finisce nella misura sbagliata.
 */
export function RiquadroOggi({ espId, config, pianta, passata, misure, dataRilievo, oggi, successiva }: RiquadroOggiProps) {
  const location = useLocation()
  // L'id di una misura nuova: cambia solo aprendo un modulo nuovo (dopo un salvataggio riuscito o con "+ Nuova
  // misura"). Un nuovo tentativo dopo un errore lo riusa, e l'upsert per id non crea doppioni.
  const [formId, setFormId] = useState(() => crypto.randomUUID())
  const [inCorrezione, setInCorrezione] = useState<Misura | null>(null)
  const [primoCampo, setPrimoCampo] = useState(() => (location.state as ArrivoScheda | null)?.primoCampo === true)

  const parametri = useMemo(() => parametriDellaPassata(config, passata), [config, passata])
  const obbligatori = useMemo(
    () => new Set(passata.parametri.filter(pp => pp.obbligatorio).map(pp => pp.parametro_id)),
    [passata],
  )
  const misureOggi = useMemo(
    () => misure
      .filter(m => m.passata_id === passata.id && m.data_rilievo === dataRilievo)
      .sort((a, b) => confronta(a.ora, b.ora)),
    [misure, passata.id, dataRilievo],
  )

  function nuovoModulo() {
    setInCorrezione(null)
    setFormId(crypto.randomUUID())
    setPrimoCampo(false)
  }

  function correggi(m: Misura) {
    setInCorrezione(m)
    setPrimoCampo(false)
  }

  const titolo = `${dataRilievo === oggi ? 'Oggi' : formattaData(dataRilievo)} · ${passata.icona ? `${passata.icona} ` : ''}${passata.nome}`

  return (
    <ModuloOggi
      key={`${pianta.id}:${inCorrezione ? `misura:${inCorrezione.id}` : `nuova:${formId}`}`}
      espId={espId}
      config={config}
      pianta={pianta}
      passata={passata}
      titolo={titolo}
      parametri={parametri}
      obbligatori={obbligatori}
      id={inCorrezione?.id ?? formId}
      misura={inCorrezione}
      misureOggi={misureOggi}
      misurePianta={misure}
      dataRilievo={dataRilievo}
      oggi={oggi}
      successiva={successiva}
      primoCampo={primoCampo}
      onCorreggi={correggi}
      onNuovo={nuovoModulo}
    />
  )
}

interface ModuloOggiProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  passata: Passata
  titolo: string
  parametri: Parametro[]
  obbligatori: Set<string>
  /** L'id con cui si salva: quello della misura in correzione, o quello del modulo nuovo. */
  id: string
  /** La misura che si sta correggendo; `null` per una misura nuova. */
  misura: Misura | null
  misureOggi: Misura[]
  misurePianta: Misura[]
  dataRilievo: string
  oggi: string
  successiva: Pianta | null
  /** Porta il cursore nel primo campo da compilare appena il modulo compare. */
  primoCampo: boolean
  onCorreggi: (m: Misura) => void
  onNuovo: () => void
}

function ModuloOggi({
  espId, config, pianta, passata, titolo, parametri, obbligatori, id, misura, misureOggi, misurePianta,
  dataRilievo, oggi, successiva, primoCampo, onCorreggi, onNuovo,
}: ModuloOggiProps) {
  const idTitolo = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ricordati = useCampoStore(s => s.dati(espId, oggi).ricordati)
  const ricorda = useCampoStore(s => s.ricorda)

  // I valori di partenza si calcolano una volta, all'apertura: un ricaricamento in background non cancella quel che si scrive.
  const [valori, setValori] = useState<ValoriMisura>(() =>
    misura ? valoriDellaMisura(parametri, misura) : valoriIniziali({ parametri, misurePianta, dataRilievo, ricordati }))
  const [ora, setOra] = useState<string | null>(misura?.ora ?? null)
  const [controllo, setControllo] = useState<Controllo | null>(null)
  const [avvisiVisti, setAvvisiVisti] = useState(false)
  const [stato, setStato] = useState<Stato>({ tipo: 'pronto' })
  const [fermate, setFermate] = useState(0)

  // Il blocco contro il doppio tocco: il pulsante disabilitato arriva solo al prossimo disegno, il ref subito.
  const inCorso = useRef(false)
  const montato = useRef(false)
  const campi = useRef<HTMLDivElement>(null)
  const messaggio = useRef<HTMLDivElement>(null)

  useEffect(() => {
    montato.current = true
    return () => { montato.current = false }
  }, [])

  // Dopo "Salva e vai" si continua a scrivere: il cursore va nel primo campo vuoto (Temp aria ricordata è già
  // compilata, si scrive Temp pianta). Se il browser non apre la tastiera da solo, pazienza.
  useEffect(() => {
    if (!primoCampo || !campi.current) return
    const elenco = [...campi.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea')]
    ;(elenco.find(c => c.value === '') ?? elenco[0])?.focus()
  }, [primoCampo])

  // Un salvataggio fermato (errori, avvisi, rete) porta il focus sul messaggio, che nomina il campo da guardare.
  useEffect(() => {
    if (fermate > 0) messaggio.current?.focus()
  }, [fermate])

  function cambia(nuovi: ValoriMisura) {
    setValori(nuovi)
    // I messaggi erano per i valori di prima: un valore nuovo si ricontrolla (e un avviso si riconferma).
    setControllo(null)
    setAvvisiVisti(false)
  }

  function ferma(c: Controllo) {
    setControllo(c)
    setStato({ tipo: 'pronto' })
    setFermate(n => n + 1)
  }

  async function salva(azione: Azione) {
    if (inCorso.current) return
    const { errori, avvisi } = validaMisura(parametri, obbligatori, valori)
    if (errori.length > 0) {
      ferma({ tipo: 'errori', messaggi: errori })
      return
    }
    if (avvisi.length > 0 && !avvisiVisti) {
      setAvvisiVisti(true)
      ferma({ tipo: 'avvisi', messaggi: avvisi })
      return
    }

    // L'ora di una misura nuova è quella del primo tentativo: un nuovo tentativo più tardi non la sposta.
    const oraMisura = ora ?? oraLocale()
    const daSalvare: Misura = {
      id,
      pianta_id: pianta.id,
      passata_id: misura?.passata_id ?? passata.id,
      data_rilievo: misura?.data_rilievo ?? dataRilievo,
      ora: oraMisura,
      // Correggendo si tengono le chiavi che il modulo non mostra (altre passate, parametri archiviati).
      valori: misura ? { ...misura.valori, ...valori } : valori,
    }

    inCorso.current = true
    setOra(oraMisura)
    setControllo(null)
    setStato({ tipo: 'salvando', azione })
    try {
      await salvaMisura(espId, daSalvare)
    } catch (e) {
      inCorso.current = false
      if (montato.current) {
        setStato({ tipo: 'errore', azione, errore: e })
        setFermate(n => n + 1)
      } else {
        // Chi è già uscito dalla scheda non vede più il modulo: l'esito non va perso in silenzio.
        toast.error(`Pianta #${pianta.etichetta} non salvata. ${messaggioErrore(e)}`)
      }
      return
    }
    inCorso.current = false
    salvata(daSalvare, azione)
  }

  function salvata(m: Misura, azione: Azione) {
    toastSalvato(`Pianta #${pianta.etichetta} salvata ✓`)
    ricorda(espId, parametri, valori)
    // La misura entra subito nella cache: l'elenco di oggi e i precompilati del modulo successivo la vedono già.
    queryClient.setQueryData<Misura[]>(chiavi.misurePianta(pianta.id), prima => [m, ...(prima ?? []).filter(x => x.id !== m.id)])
    void queryClient.invalidateQueries({ queryKey: chiavi.misurePianta(pianta.id) })
    void queryClient.invalidateQueries({ queryKey: chiavi.misureGiorno(espId, m.data_rilievo) })
    void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
    // Uscito dalla scheda durante il salvataggio, chi rileva non va riportato a una pianta.
    if (!montato.current) return
    if (azione === 'vai' && successiva) {
      const arrivo: ArrivoScheda = { primoCampo: true }
      navigate(percorsoPianta(espId, successiva.id), { state: arrivo })
    } else {
      onNuovo()
    }
  }

  const salvando = stato.tipo === 'salvando'
  const comunque = avvisiVisti ? ' comunque' : ''
  const etichetta = (azione: Azione): string => {
    if (stato.tipo === 'salvando' && stato.azione === azione) return 'Salvataggio…'
    return azione === 'vai' && successiva ? `Salva${comunque} e vai alla #${successiva.etichetta}` : `Salva${comunque}`
  }

  return (
    <section aria-labelledby={idTitolo} className="rounded-lg bg-carta-ombra p-4">
      {/* Mentre salva il modulo non si tocca: quel che si scrive adesso andrebbe perso con il modulo che si chiude. */}
      <div inert={salvando} className="flex flex-col gap-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h3 id={idTitolo} className="min-w-0 text-label text-grafite-tenue uppercase">{titolo}</h3>
          <CampoOra ora={ora} onChange={setOra} />
        </div>

        {misureOggi.length > 0 && (
          <div className="flex flex-col gap-2">
            <ElencoOggi misure={misureOggi} parametri={config.parametri} attivaId={misura?.id ?? null} onCorreggi={onCorreggi} />
            {misura && (
              <Button variant="ghost" size="sm" className="-ml-3 self-start" onClick={onNuovo}>+ Nuova misura</Button>
            )}
            <p className="pt-2 font-semibold text-grafite">
              {misura ? `Modifica della misura delle ${misura.ora}` : 'Nuova misura'}
            </p>
          </div>
        )}

        <div ref={campi}>
          {parametri.length > 0 ? (
            <FormMisura parametri={parametri} obbligatori={obbligatori} valori={valori} onChange={cambia} />
          ) : (
            <p className="text-grafite-tenue">Questa passata non ha parametri da compilare: aggiungili dalle impostazioni.</p>
          )}
        </div>
      </div>

      <BarraAzioni>
        {controllo ? (
          <EsitoControllo ref={messaggio} controllo={controllo} />
        ) : stato.tipo === 'errore' ? (
          <ErroreSalvataggio
            ref={messaggio}
            etichetta={pianta.etichetta}
            errore={stato.errore}
            onRiprova={() => void salva(stato.azione)}
          />
        ) : null}
        {/* Uno accanto all'altro finché ci stanno; con le etichette lunghe ("Salva comunque…") vanno a capo. */}
        <div className="flex flex-wrap gap-2">
          {successiva && (
            <Button variant="outline" size="lg" className="grow" disabled={salvando} onClick={() => void salva('resta')}>
              {etichetta('resta')}
            </Button>
          )}
          <Button
            size="lg"
            className="grow-3 basis-52"
            disabled={salvando}
            onClick={() => void salva(successiva ? 'vai' : 'resta')}
          >
            {etichetta(successiva ? 'vai' : 'resta')}
          </Button>
        </div>
      </BarraAzioni>
    </section>
  )
}

interface ElencoOggiProps {
  misure: Misura[]
  /** Tutti i parametri dell'esperimento, archiviati compresi: una misura può averne. */
  parametri: Parametro[]
  attivaId: string | null
  onCorreggi: (m: Misura) => void
}

/** Le misure già fatte oggi con questa passata, come righe di quaderno: toccandone una la si corregge. */
function ElencoOggi({ misure, parametri, attivaId, onCorreggi }: ElencoOggiProps) {
  return (
    <ul aria-label="Misure già registrate" className="-mx-2 border-y border-riga">
      {misure.map(m => {
        const attiva = m.id === attivaId
        return (
          <li key={m.id} className="border-b border-riga last:border-b-0">
            <button
              type="button"
              aria-pressed={attiva}
              onClick={() => { if (!attiva) onCorreggi(m) }}
              className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left text-dato transition-colors hover:bg-riga/40 active:bg-riga/60 aria-pressed:bg-inchiostro-velato"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-grafite tabular-nums">{m.ora}</span>
                {' · '}
                <VociMisura voci={vociMisura(m, parametri)} />
              </span>
              {attiva ? (
                <span aria-hidden className="shrink-0 text-label text-inchiostro">in modifica</span>
              ) : (
                <Pencil aria-hidden className="size-4 shrink-0 text-grafite-tenue" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
