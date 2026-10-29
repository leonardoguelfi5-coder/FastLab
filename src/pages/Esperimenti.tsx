import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Ellipsis } from 'lucide-react'
import type { RiepilogoEsperimento } from '@/api/esperimenti'
import { useEsperimenti } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { buttonVariants } from '@/components/ui/button'
import { formattaData, oggiLocale } from '@/lib/date'
import { cn } from '@/lib/utils'

const VOCE_MENU = 'flex h-11 w-full items-center gap-2.5 rounded-sm px-3 text-left text-base text-grafite transition-colors hover:bg-carta-ombra active:bg-carta-ombra [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-grafite-tenue'

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
    <div ref={radice} className="relative flex shrink-0 items-start pt-2 pr-1">
      <button
        ref={pulsante}
        type="button"
        aria-label={`Altre azioni per ${esperimento.nome}`}
        aria-expanded={aperto}
        aria-controls={aperto ? idMenu : undefined}
        onClick={() => setAperto(v => !v)}
        className={buttonVariants({ variant: 'quiet', size: 'icon' })}
      >
        <Ellipsis aria-hidden className="size-6 text-grafite-tenue" />
      </button>
      {aperto && (
        <div
          id={idMenu}
          className="absolute top-full right-1 z-20 mt-1 w-48 rounded-md border border-riga bg-foglio p-1 text-grafite shadow-galleggiante"
        >
          <Link
            to={`/esperimenti/nuovo?da=${encodeURIComponent(esperimento.id)}`}
            onClick={() => setAperto(false)}
            className={VOCE_MENU}
          >
            <Copy aria-hidden />
            Duplica
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Una riga di quaderno: il tocco sul corpo apre l'esperimento, il menu ⋯ è un controllo a parte (mai uno dentro
 * l'altro). Le righe arrivano ai bordi della colonna, separate da linee di 1px.
 */
function SchedaEsperimento({ esperimento }: { esperimento: RiepilogoEsperimento }) {
  return (
    <li className="flex items-stretch border-b border-riga">
      <Link
        to={`/esperimenti/${encodeURIComponent(esperimento.id)}`}
        className="flex min-h-11 min-w-0 flex-1 flex-col gap-1 py-4 pr-2 pl-4 transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
      >
        <h2 className="text-title break-words text-grafite">{esperimento.nome}</h2>
        <p className="text-dato font-sans text-grafite-tenue tabular-nums">{riepilogo(esperimento)}</p>
        {esperimento.ultima_data !== null && (
          <p className="text-dato font-sans text-grafite-tenue tabular-nums">
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
    <div className="flex flex-col gap-3 pt-6">
      <p className="text-title text-grafite">Non hai ancora esperimenti.</p>
      <p className="max-w-[65ch] text-grafite-tenue">Crea il primo da zero oppure parti dal modello Hydrochar.</p>
      <Link to="/esperimenti/nuovo" className={cn(buttonVariants({ size: 'lg' }), 'mt-3')}>Crea esperimento</Link>
      <Link
        to="/esperimenti/nuovo?modello=hydrochar"
        className={buttonVariants({ variant: 'outline' })}
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
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : elenco.length === 0 ? (
        <NessunEsperimento />
      ) : (
        <>
          <ul aria-label="Esperimenti" className="-mx-4 flex flex-col border-t border-riga">
            {elenco.map(e => <SchedaEsperimento key={e.id} esperimento={e} />)}
          </ul>
          {/* L'azione principale della schermata, in basso dove arriva il pollice. */}
          <BarraAzioni>
            <Link to="/esperimenti/nuovo" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>+ Nuovo esperimento</Link>
          </BarraAzioni>
        </>
      )}
    </AppShell>
  )
}
