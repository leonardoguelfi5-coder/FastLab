import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { salvaMisura } from '@/api/misure'
import { chiavi } from '@/api/query'
import { BarraAzioni } from '@/components/BarraAzioni'
import { FormMisura } from '@/components/misura/FormMisura'
import { Button } from '@/components/ui/button'
import { validaMisura, valoriDaSalvare, valoriDeiParametri, valoriIniziali } from '@/domain/misure'
import type { ConfigEsperimento, Misura, Parametro, Passata, Pianta, ValoriMisura } from '@/domain/tipi'
import { formattaData, oggiLocale, oraLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { percorsoPianta } from '@/lib/percorsi'
import { toastSalvato } from '@/lib/toastSalvato'
import { useCampoStore } from '@/store/campo'
import { cancellaBozza, leggiBozza, scriviAperto, scriviBozza } from './bozza'
import { CampoOra } from './CampoOra'
import { ElencoOggi } from './ElencoOggi'
import { ErroreSalvataggio, EsitoControllo, type Controllo } from './MessaggiSalvataggio'
import { ATTESA_CONFERMA_MS, istante } from './salvataggio'

/** Quel che la pagina deve sapere del modulo aperto per non farne perdere i valori: se è cambiato e come scartarlo. */
export interface StatoModulo { modificato: boolean; scarta: () => void }

/** Stato della navigazione verso una scheda: dopo "Salva e vai" il cursore va nel primo campo da compilare. */
export interface ArrivoScheda { primoCampo?: boolean }

/** "vai": salva e apre la pianta successiva; "resta": salva e ricomincia con una misura nuova della stessa pianta. */
type Azione = 'vai' | 'resta'

type Stato =
  | { tipo: 'pronto' }
  | { tipo: 'salvando'; azione: Azione }
  | { tipo: 'errore'; azione: Azione; errore: unknown }

/**
 * Il messaggio di un salvataggio fallito quando chi rileva è già uscito dalla scheda. Dice se i valori sono rimasti
 * (in una bozza) e, se la misura non è di oggi, con quale data riaprire la pianta: riaprendola si vede il giorno scelto.
 */
function nonSalvataDopoUscita(etichetta: string, errore: unknown, dataRilievo: string, valoriRimasti: boolean): string {
  const motivo = messaggioErrore(errore)
  const conData = dataRilievo === oggiLocale() ? '' : ` con data ${formattaData(dataRilievo)}`
  const cosaFare = valoriRimasti
    ? `I valori sono rimasti: riapri la pianta${conData} per riprovare.`
    : `Controlla i valori della pianta${conData} e salvali di nuovo.`
  return `Pianta #${etichetta} non salvata. ${/[.!?…]$/.test(motivo) ? motivo : `${motivo}.`} ${cosaFare}`
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
  /** Dove sta la bozza di questo modulo nel sessionStorage. */
  chiave: string
  /** Dove il riquadro ricorda quale modulo era aperto (vedi `chiaveAperto`): si scrive e si cancella con la bozza. */
  aperto: string
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
  onNuovaMisura: () => void
  onSalvata: (m: Misura) => void
  /** Dopo "Scarta" sulla bozza ripresa: lo stesso modulo, da capo. */
  onDaCapo: () => void
  onModifiche: (stato: StatoModulo | null) => void
}

/**
 * Il modulo di una misura nel riquadro di oggi: valori, ora, controlli e salvataggio. Si rimonta per ogni misura
 * (id diverso), quindi lo stato qui dentro vale per un solo modulo.
 */
export function ModuloOggi({
  espId, config, pianta, passata, titolo, parametri, obbligatori, id, chiave, aperto, misura, misureOggi, misurePianta,
  dataRilievo, oggi, successiva, primoCampo, onCorreggi, onNuovaMisura, onSalvata, onDaCapo, onModifiche,
}: ModuloOggiProps) {
  const idTitolo = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ricorda = useCampoStore(s => s.ricorda)

  // I valori di partenza si calcolano una volta, all'apertura: un ricaricamento in background non cancella quel che
  // si scrive. Prima la bozza lasciata da un'uscita senza salvare, poi la misura che si corregge, poi i precompilati.
  const [iniziale] = useState(() => {
    const bozza = leggiBozza(chiave)
    if (bozza && bozza.id === id) return { valori: valoriDeiParametri(parametri, bozza.valori), ora: bozza.ora, ripresa: true }
    // I valori ricordati si leggono dallo store adesso, non dall'ultimo disegno: dopo un salvataggio sono già aggiornati.
    const ricordati = useCampoStore.getState().dati(espId, oggi).ricordati
    return {
      valori: misura ? valoriDeiParametri(parametri, misura.valori) : valoriIniziali({ parametri, misurePianta, dataRilievo, ricordati }),
      ora: misura?.ora ?? null,
      ripresa: false,
    }
  })
  const [valori, setValori] = useState<ValoriMisura>(iniziale.valori)
  const [ora, setOra] = useState<string | null>(iniziale.ora)
  const [modificato, setModificato] = useState(iniziale.ripresa)
  const [controllo, setControllo] = useState<Controllo | null>(null)
  const [avvisiVisti, setAvvisiVisti] = useState(false)
  const [stato, setStato] = useState<Stato>({ tipo: 'pronto' })
  const [fermate, setFermate] = useState(0)

  // Il blocco contro il doppio tocco: il pulsante disabilitato arriva solo al prossimo disegno, il ref subito.
  const inCorso = useRef(false)
  const avvisoAlle = useRef(0)
  // Salvata la misura, il modulo è chiuso: nessuna bozza va più scritta (tornerebbe come "ripristinata" con lo stesso id).
  const chiuso = useRef(false)
  const montato = useRef(false)
  const campi = useRef<HTMLDivElement>(null)
  const messaggio = useRef<HTMLDivElement>(null)

  useEffect(() => {
    montato.current = true
    return () => { montato.current = false }
  }, [])

  // La bozza e il ricordo di quale modulo era aperto vanno insieme: tornando, si riapre questo modulo con i suoi valori.
  const misuraId = misura?.id ?? null
  /**
   * Cancella la bozza di questo modulo. Una bozza con un altro id alla stessa chiave è di un modulo aperto dopo
   * (si è rientrati nella scheda mentre questo salvava): resta com'è.
   */
  function cancellaTutto() {
    const bozza = leggiBozza(chiave)
    if (bozza && bozza.id !== id) return
    cancellaBozza(chiave)
    scriviAperto(aperto, null)
  }

  // La pagina chiede conferma prima di azioni che chiudono il modulo (indietro, un'altra misura, un'altra data).
  // Durante il salvataggio no: i valori sono già partiti, e se il salvataggio fallisce la bozza resta e lo si dice.
  const salvando = stato.tipo === 'salvando'
  useEffect(() => {
    onModifiche({
      modificato: modificato && !salvando,
      scarta: () => {
        cancellaBozza(chiave)
        scriviAperto(aperto, null)
      },
    })
  }, [onModifiche, modificato, salvando, chiave, aperto])
  useEffect(() => () => onModifiche(null), [onModifiche])

  // Per le uscite che l'app non può fermare (gesto indietro del telefono, menu, ricarica) i valori restano in una bozza.
  useEffect(() => {
    if (!modificato || chiuso.current) return
    scriviBozza(chiave, { id, valori, ora })
    scriviAperto(aperto, misuraId)
  }, [chiave, aperto, misuraId, id, valori, ora, modificato])

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
    setModificato(true)
    // I messaggi erano per i valori di prima: un valore nuovo si ricontrolla (e un avviso si riconferma).
    setControllo(null)
    setAvvisiVisti(false)
  }

  function cambiaOra(nuova: string) {
    setOra(nuova)
    setModificato(true)
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
    if (avvisi.length > 0) {
      if (!avvisiVisti) {
        avvisoAlle.current = istante()
        setAvvisiVisti(true)
        ferma({ tipo: 'avvisi', messaggi: avvisi })
        return
      }
      if (istante() - avvisoAlle.current < ATTESA_CONFERMA_MS) return
    }

    // L'ora di una misura nuova è quella del primo tentativo: un nuovo tentativo più tardi non la sposta.
    const oraMisura = ora ?? oraLocale()
    const daSalvare: Misura = {
      id,
      pianta_id: pianta.id,
      passata_id: misura?.passata_id ?? passata.id,
      data_rilievo: misura?.data_rilievo ?? dataRilievo,
      ora: oraMisura,
      // Correggendo si tengono le chiavi che il modulo non mostra (altre passate, parametri archiviati); un parametro
      // lasciato vuoto che la misura non aveva non si scrive (la chiave direbbe "ha dati").
      valori: valoriDaSalvare(misura?.valori ?? null, valori),
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
        // Chi è già uscito dalla scheda non vede più il modulo: l'esito non va perso in silenzio. I valori restano
        // nella bozza (scritta anche se non erano stati toccati, come i precompilati), così riaprendo la pianta tornano.
        // Una bozza che c'è già non si tocca: con lo stesso id ha questi valori o quelli scritti dopo, rientrando;
        // con un altro id è di un modulo aperto dopo, e questi valori non hanno più dove stare (il messaggio lo dice).
        const presente = leggiBozza(chiave)
        if (!presente) {
          scriviBozza(chiave, { id, valori, ora: oraMisura })
          scriviAperto(aperto, misuraId)
        }
        toast.error(nonSalvataDopoUscita(pianta.etichetta, e, daSalvare.data_rilievo, !presente || presente.id === id))
      }
      return
    }
    inCorso.current = false
    salvata(daSalvare, azione)
  }

  function salvata(m: Misura, azione: Azione) {
    chiuso.current = true
    cancellaTutto()
    toastSalvato(`Pianta #${pianta.etichetta} salvata ✓`)
    // Solo una misura nuova è "l'ultima inserita": correggere quella del mattino non cambia la Temp aria del pomeriggio.
    if (!misura) ricorda(espId, parametri, valori)
    // La misura entra subito nella cache: l'elenco di oggi la mostra senza aspettare il ricaricamento.
    queryClient.setQueryData<Misura[]>(chiavi.misurePianta(pianta.id), prima => [m, ...(prima ?? []).filter(x => x.id !== m.id)])
    void queryClient.invalidateQueries({ queryKey: chiavi.misurePianta(pianta.id) })
    void queryClient.invalidateQueries({ queryKey: chiavi.misureGiorno(espId, m.data_rilievo) })
    void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti })
    // Uscito dalla scheda durante il salvataggio, chi rileva non va riportato a una pianta.
    if (!montato.current) return
    if (azione === 'vai' && successiva) {
      // Al posto della scheda appena fatta: il gesto indietro riporta alla schermata in campo, non a ogni pianta.
      const arrivo: ArrivoScheda = { primoCampo: true }
      navigate(percorsoPianta(espId, successiva.id), { replace: true, state: arrivo })
    } else {
      onSalvata(m)
    }
  }

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
          <CampoOra ora={ora} onApri={setOra} onChange={cambiaOra} />
        </div>

        {iniziale.ripresa && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-riga-controllo bg-foglio py-1 pr-1 pl-3">
            <p className="text-sm text-grafite">Bozza ripristinata.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                cancellaTutto()
                onDaCapo()
              }}
            >
              Scarta
            </Button>
          </div>
        )}

        {misureOggi.length > 0 && (
          <div className="flex flex-col gap-2">
            <ElencoOggi misure={misureOggi} parametri={config.parametri} attivaId={misura?.id ?? null} onCorreggi={onCorreggi} />
            {misura && (
              <Button variant="ghost" size="sm" className="-ml-3 self-start" onClick={onNuovaMisura}>+ Nuova misura</Button>
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
