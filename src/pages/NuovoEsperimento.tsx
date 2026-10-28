import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import type { BozzaEsperimento } from '@/domain/tipi'
import { bozzaVuota, clonaConfig } from '@/domain/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { useSessione } from '@/api/auth'
import { useConfig } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { messaggioErrore } from '@/lib/errori'
import { cn } from '@/lib/utils'
import {
  chiaveBozza, leggiBozza, modificato, nuovoLavoro, rimuoviBozza, salvaBozza, type Lavoro,
} from './wizard/bozzaSalvata'
import { Conferma } from './wizard/Conferma'
import { PassoGenerale } from './wizard/PassoGenerale'
import { PassoParametri } from './wizard/PassoParametri'
import { PassoPassate } from './wizard/PassoPassate'
import { PassoPiante } from './wizard/PassoPiante'
import { PassoRiepilogo } from './wizard/PassoRiepilogo'
import { motivoBlocco } from './wizard/righeTrattamenti'
import { SceltaIniziale } from './wizard/SceltaIniziale'

const PASSI = ['Generale', 'Fattori e piante', 'Parametri', 'Passate', 'Riepilogo'] as const
const ULTIMO = PASSI.length - 1
const TITOLO = 'Nuovo esperimento'

/** Il passo (da 0) scritto nell'indirizzo come `?passo=1…5`; il primo se manca o non è valido. */
function leggiPasso(valore: string | null): number {
  const n = Number(valore)
  return Number.isInteger(n) && n >= 1 && n <= PASSI.length ? n - 1 : 0
}

interface ProceduraProps {
  /** Dove si salva la bozza in sessionStorage. */
  chiave: string
  /** La bozza di partenza, oppure null per chiedere prima da dove partire. */
  crea: () => BozzaEsperimento | null
}

/**
 * La procedura guidata. Il passo sta nell'indirizzo (il "indietro" del telefono torna al passo prima)
 * e la bozza modificata in sessionStorage, così uscire dalla pagina (menu, ricarica) non la perde.
 */
function Procedura({ chiave, crea }: ProceduraProps) {
  const navigate = useNavigate()
  const [ricerca, setRicerca] = useSearchParams()
  const passo = leggiPasso(ricerca.get('passo'))

  const [avvio] = useState(() => {
    const salvato = leggiBozza(chiave)
    if (salvato) return { lavoro: salvato, ripristinato: true }
    const b = crea()
    return { lavoro: b ? nuovoLavoro(b) : null, ripristinato: false }
  })
  const [lavoro, setLavoro] = useState<Lavoro | null>(avvio.lavoro)
  const [ripristinato, setRipristinato] = useState(avvio.ripristinato)
  const [conferma, setConferma] = useState<'uscita' | 'ricomincia' | null>(null)
  const modificata = useMemo(() => lavoro !== null && modificato(lavoro), [lavoro])

  // La bozza si salva finché ha modifiche (o un tentativo di creazione in sospeso), altrimenti si toglie.
  useEffect(() => {
    if (lavoro && (modificata || lavoro.tentato)) salvaBozza(chiave, lavoro)
    else rimuoviBozza(chiave)
  }, [chiave, lavoro, modificata])

  // Chiudendo o ricaricando la scheda con modifiche il browser chiede conferma.
  useEffect(() => {
    if (!modificata) return
    const avvisa = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avvisa)
    return () => window.removeEventListener('beforeunload', avvisa)
  }, [modificata])

  // A ogni cambio di passo il focus va sul titolo: chi usa un lettore di schermo sa dov'è, e la pagina riparte dall'alto.
  const titolo = useRef<HTMLHeadingElement>(null)
  const vista = lavoro === null ? -1 : passo
  const vistaPrecedente = useRef(vista)
  useEffect(() => {
    if (vistaPrecedente.current === vista) return
    vistaPrecedente.current = vista
    titolo.current?.focus()
  }, [vista])

  /** Va a un passo aggiungendo una voce alla cronologia (o sostituendo quella attuale); `modello` e `da` restano. */
  function vaiAlPasso(i: number, sostituisci = false) {
    setRicerca(prima => {
      const dopo = new URLSearchParams(prima)
      dopo.set('passo', String(i + 1))
      return dopo
    }, { replace: sostituisci })
  }

  function parti(b: BozzaEsperimento | null) {
    setLavoro(b ? nuovoLavoro(b) : null)
    if (passo !== 0) vaiAlPasso(0, true)
  }

  function ricomincia() {
    rimuoviBozza(chiave)
    setConferma(null)
    setRipristinato(false)
    parti(crea())
  }

  function esciSenzaSalvare() {
    rimuoviBozza(chiave)
    setConferma(null)
    navigate('/')
  }

  function chiediPrimaDiUscire(e: MouseEvent<HTMLAnchorElement>) {
    if (!modificata) return
    e.preventDefault()
    setConferma('uscita')
  }

  const aggiorna = (modifica: Partial<Lavoro>) => setLavoro(l => (l ? { ...l, ...modifica } : l))
  const blocco = lavoro ? motivoBlocco(lavoro.bozza, lavoro.righe) : null

  return (
    <AppShell titolo={TITOLO} indietro="/" onIndietro={chiediPrimaDiUscire}>
      {ripristinato && (
        <div role="status" className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <p className="flex-1 text-sm">Bozza ripristinata.</p>
          <Button variant="outline" onClick={() => setConferma('ricomincia')} className="h-11">Ricomincia</Button>
          <Button variant="ghost" size="icon" aria-label="Chiudi l'avviso" onClick={() => setRipristinato(false)} className="size-11">
            <X className="size-5" />
          </Button>
        </div>
      )}

      {lavoro === null ? (
        <SceltaIniziale onModello={() => parti(bozzaHydrochar())} onDaZero={() => parti(bozzaVuota())} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{`Passo ${passo + 1} di ${PASSI.length}`}</p>
            <div aria-hidden className="flex gap-1">
              {PASSI.map((nome, i) => (
                <span key={nome} className={cn('h-1.5 flex-1 rounded-full', i <= passo ? 'bg-primary' : 'bg-muted')} />
              ))}
            </div>
            <h2 ref={titolo} tabIndex={-1} className="text-2xl font-bold outline-none">{PASSI[passo]}</h2>
          </div>

          {passo === 0 && <PassoGenerale bozza={lavoro.bozza} onChange={(bozza) => aggiorna({ bozza })} />}
          {passo === 1 && (
            <PassoPiante bozza={lavoro.bozza} righe={lavoro.righe} onChange={(bozza, righe) => aggiorna({ bozza, righe })} />
          )}
          {passo === 2 && <PassoParametri bozza={lavoro.bozza} onChange={(bozza) => aggiorna({ bozza })} />}
          {passo === 3 && <PassoPassate bozza={lavoro.bozza} onChange={(bozza) => aggiorna({ bozza })} />}
          {passo === ULTIMO && (
            <PassoRiepilogo
              bozza={lavoro.bozza}
              // Con "avanti" del browser si può saltare il blocco del passo 2: qui si ricontrolla.
              altriErrori={blocco ? [blocco] : []}
              giaTentato={lavoro.tentato}
              onTentativo={() => aggiorna({ tentato: true })}
              onCreato={() => rimuoviBozza(chiave)}
            />
          )}

          <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {passo === 1 && blocco && <p id="motivo-blocco" className="text-sm text-destructive">{blocco}</p>}
            <div className="flex gap-2">
              {passo > 0 && (
                <Button variant="outline" onClick={() => vaiAlPasso(passo - 1)} className="h-12 flex-1 text-base">
                  Passo precedente
                </Button>
              )}
              {passo < ULTIMO && (
                <Button
                  disabled={passo === 1 && blocco !== null}
                  aria-describedby={passo === 1 && blocco ? 'motivo-blocco' : undefined}
                  onClick={() => vaiAlPasso(passo + 1)}
                  className="h-12 flex-1 text-base"
                >
                  Avanti
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <Conferma
        aperta={conferma === 'uscita'}
        titolo="Uscire dalla creazione?"
        testo="Le modifiche non salvate andranno perse."
        annulla="Continua a modificare"
        conferma="Esci senza salvare"
        onAnnulla={() => setConferma(null)}
        onConferma={esciSenzaSalvare}
      />
      <Conferma
        aperta={conferma === 'ricomincia'}
        titolo="Ricominciare da capo?"
        testo="La bozza ripristinata andrà persa."
        annulla="Annulla"
        conferma="Ricomincia"
        onAnnulla={() => setConferma(null)}
        onConferma={ricomincia}
      />
    </AppShell>
  )
}

function ErroreConRiprova({ errore, onRiprova }: { errore: unknown; onRiprova: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="text-sm text-destructive">{messaggioErrore(errore)}</p>
      <Button variant="outline" onClick={onRiprova} className="h-11">Riprova</Button>
    </div>
  )
}

/** Duplicazione: la procedura parte da una copia della configurazione (non dei dati) di un esperimento. */
function Duplica({ espId, chiave }: { espId: string; chiave: string }) {
  const config = useConfig(espId)
  const copia = useMemo(() => {
    if (!config.data) return null
    try {
      return { bozza: clonaConfig(config.data), errore: null }
    } catch (e) {
      return { bozza: null, errore: e }
    }
  }, [config.data])

  if (copia?.bozza) {
    const bozza = copia.bozza
    return <Procedura chiave={chiave} crea={() => bozza} />
  }
  return (
    <AppShell titolo={TITOLO} indietro="/">
      {copia?.errore || config.isError
        ? <ErroreConRiprova errore={copia?.errore ?? config.error} onRiprova={() => void config.refetch()} />
        : <p role="status" className="text-muted-foreground">Caricamento…</p>}
    </AppShell>
  )
}

/** Nuovo esperimento: da zero o dal modello (`?modello=hydrochar`), oppure copia di un altro (`?da=<id>`). */
export function NuovoEsperimento() {
  const [ricerca] = useSearchParams()
  const { sessione } = useSessione()
  const da = ricerca.get('da')
  const hydrochar = ricerca.get('modello') === 'hydrochar'
  const modo = da ? `da:${da}` : hydrochar ? 'hydrochar' : 'nuovo'
  const chiave = chiaveBozza(sessione?.user.id ?? '', modo)

  if (da) return <Duplica key={chiave} espId={da} chiave={chiave} />
  return <Procedura key={chiave} chiave={chiave} crea={() => (hydrochar ? bozzaHydrochar() : null)} />
}
