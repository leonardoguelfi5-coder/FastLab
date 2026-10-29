import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Ellipsis } from 'lucide-react'
import type { RiepilogoEsperimento } from '@/api/esperimenti'
import { useEsperimenti } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Button, buttonVariants } from '@/components/ui/button'
import { formattaData, oggiLocale } from '@/lib/date'
import { messaggioErrore } from '@/lib/errori'
import { cn } from '@/lib/utils'

const VOCE_MENU = 'flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-base hover:bg-muted'

/** "oggi", "ieri" o la data GG/MM/AAAA. Si confronta la data locale (mai UTC): a mezzanotte il giorno cambia per chi è in laboratorio. */
function quando(ultimaData: string, adesso: Date = new Date()): string {
  if (ultimaData === oggiLocale(adesso)) return 'oggi'
  const ieri = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() - 1)
  if (ultimaData === oggiLocale(ieri)) return 'ieri'
  return formattaData(ultimaData)
}

function riepilogo(e: RiepilogoEsperimento): string {
  const piante = e.n_piante === 1 ? '1 pianta' : `${e.n_piante} piante`
  const trattamenti = e.n_trattamenti === 1 ? '1 trattamento' : `${e.n_trattamenti} trattamenti`
  return `${piante} · ${trattamenti} · ${e.stato === 'concluso' ? 'concluso' : 'in corso'}`
}

function ErroreConRiprova({ errore, onRiprova }: { errore: unknown; onRiprova: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="text-sm text-destructive">{messaggioErrore(errore)}</p>
      <Button variant="outline" onClick={onRiprova} className="h-11">Riprova</Button>
    </div>
  )
}

/** Menu ⋯ della scheda: un pulsante che apre l'elenco delle azioni; si chiude con Escape o toccando fuori. */
function MenuScheda({ esperimento }: { esperimento: RiepilogoEsperimento }) {
  const [aperto, setAperto] = useState(false)
  const radice = useRef<HTMLDivElement>(null)
  const pulsante = useRef<HTMLButtonElement>(null)
  const idMenu = useId()

  useEffect(() => {
    if (!aperto) return

    const fuori = (evento: PointerEvent) => {
      if (!radice.current?.contains(evento.target as Node)) setAperto(false)
    }
    const tasto = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      setAperto(false)
      pulsante.current?.focus()
    }

    document.addEventListener('pointerdown', fuori)
    document.addEventListener('keydown', tasto)
    return () => {
      document.removeEventListener('pointerdown', fuori)
      document.removeEventListener('keydown', tasto)
    }
  }, [aperto])

  return (
    <div ref={radice} className="relative shrink-0 p-0.5">
      <button
        ref={pulsante}
        type="button"
        aria-label={`Altre azioni per ${esperimento.nome}`}
        aria-expanded={aperto}
        aria-controls={aperto ? idMenu : undefined}
        onClick={() => setAperto(v => !v)}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-11')}
      >
        <Ellipsis aria-hidden className="size-6" />
      </button>
      {aperto && (
        <div
          id={idMenu}
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Link
            to={`/esperimenti/nuovo?da=${encodeURIComponent(esperimento.id)}`}
            onClick={() => setAperto(false)}
            className={VOCE_MENU}
          >
            <Copy aria-hidden className="size-4" />
            Duplica
          </Link>
        </div>
      )}
    </div>
  )
}

/** Una scheda: il tocco sul corpo apre l'esperimento, il menu ⋯ è un controllo a parte (mai uno dentro l'altro). */
function SchedaEsperimento({ esperimento }: { esperimento: RiepilogoEsperimento }) {
  return (
    <li className="flex items-start rounded-lg border bg-card text-card-foreground">
      <Link
        to={`/esperimenti/${encodeURIComponent(esperimento.id)}`}
        className="flex min-h-11 min-w-0 flex-1 flex-col gap-1 rounded-lg p-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <h2 className="break-words text-lg font-semibold leading-snug">{esperimento.nome}</h2>
        <p className="text-sm text-muted-foreground">{riepilogo(esperimento)}</p>
        {esperimento.ultima_data !== null && (
          <p className="text-sm text-muted-foreground">
            {`Ultimo rilievo: ${quando(esperimento.ultima_data)}, ${esperimento.piante_ultima_data}/${esperimento.n_piante} piante`}
          </p>
        )}
      </Link>
      <MenuScheda esperimento={esperimento} />
    </li>
  )
}

function NessunEsperimento() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-medium">Non hai ancora esperimenti.</p>
      <p className="text-muted-foreground">Crea il primo da zero oppure parti dal modello Hydrochar.</p>
      <Link to="/esperimenti/nuovo" className={cn(buttonVariants(), 'h-12 text-base')}>Crea esperimento</Link>
      <Link
        to="/esperimenti/nuovo?modello=hydrochar"
        className={cn(buttonVariants({ variant: 'outline' }), 'h-12 text-base')}
      >
        Usa il modello Hydrochar
      </Link>
    </div>
  )
}

/** Home dopo l'accesso: gli esperimenti dell'utente, dal più recente. */
export function Esperimenti() {
  const esperimenti = useEsperimenti()
  const elenco = esperimenti.data

  return (
    <AppShell titolo="Esperimenti">
      {elenco === undefined ? (
        esperimenti.isError
          ? <ErroreConRiprova errore={esperimenti.error} onRiprova={() => void esperimenti.refetch()} />
          : <p role="status" className="text-muted-foreground">Caricamento…</p>
      ) : elenco.length === 0 ? (
        <NessunEsperimento />
      ) : (
        <>
          <Link to="/esperimenti/nuovo" className={cn(buttonVariants(), 'h-12 text-base')}>+ Nuovo esperimento</Link>
          <ul aria-label="Esperimenti" className="flex flex-col gap-3">
            {elenco.map(e => <SchedaEsperimento key={e.id} esperimento={e} />)}
          </ul>
        </>
      )}
    </AppShell>
  )
}
