import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CircleUser, LogOut, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { esci, useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { messaggioErrore } from '@/lib/errori'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AppShellProps {
  titolo: string
  /** Percorso a cui porta la freccia indietro (es. `/` o `/esperimenti/ID`); senza, la freccia non c'è. */
  indietro?: string
  /** Chiamato al tocco della freccia indietro: con `evento.preventDefault()` la pagina resta (es. per chiedere conferma). */
  onIndietro?: (evento: MouseEvent<HTMLAnchorElement>) => void
  /** Pulsanti della pagina, a destra del titolo e prima del menu. */
  azioni?: ReactNode
  children: ReactNode
}

const VOCE_MENU = 'flex h-11 w-full items-center gap-2.5 rounded-sm px-3 text-left text-base text-grafite transition-colors hover:bg-carta-ombra active:bg-carta-ombra [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-grafite-tenue'

/**
 * Intestazione e menu dell'utente comuni a tutte le pagine dopo l'accesso. La barra in alto è alta 56px
 * (fondo carta, linea riga sotto) e resta ferma mentre si scorre; il contenuto sta in una colonna centrale.
 * Se la pagina ha una BarraAzioni, sotto il contenuto resta lo spazio per non esserne coperto.
 */
export function AppShell({ titolo, indietro, onIndietro, azioni, children }: AppShellProps) {
  const { sessione } = useSessione()
  const { data: amministratore } = useSonoAdmin()

  const [aperto, setAperto] = useState(false)
  const radiceMenu = useRef<HTMLDivElement>(null)
  const pulsanteMenu = useRef<HTMLButtonElement>(null)

  // Il menu si chiude con Escape (riportando il focus sul pulsante) o toccando fuori.
  useEffect(() => {
    if (!aperto) return

    const fuori = (evento: PointerEvent) => {
      if (!radiceMenu.current?.contains(evento.target as Node)) setAperto(false)
    }
    const tasto = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      setAperto(false)
      pulsanteMenu.current?.focus()
    }

    document.addEventListener('pointerdown', fuori)
    document.addEventListener('keydown', tasto)
    return () => {
      document.removeEventListener('pointerdown', fuori)
      document.removeEventListener('keydown', tasto)
    }
  }, [aperto])

  // Dopo l'uscita ci pensano gli altri pezzi, come per ogni altra fine di sessione:
  // RequireAuth rimanda a /accedi e svuotaCacheAlCambioUtente (main.tsx) svuota la cache.
  async function uscire() {
    setAperto(false)
    try {
      await esci()
    } catch (e) {
      toast.error(messaggioErrore(e))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-riga bg-carta pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
          {indietro && (
            <Link
              to={indietro}
              onClick={onIndietro}
              aria-label="Indietro"
              className={buttonVariants({ variant: 'quiet', size: 'icon' })}
            >
              <ArrowLeft className="size-6" />
            </Link>
          )}
          <h1 className={cn('min-w-0 flex-1 truncate text-headline text-grafite', !indietro && 'pl-2')}>{titolo}</h1>
          {azioni}
          <div ref={radiceMenu} className="relative">
            <button
              ref={pulsanteMenu}
              type="button"
              aria-label="Menu"
              aria-expanded={aperto}
              aria-controls="menu-utente"
              onClick={() => setAperto(v => !v)}
              className={buttonVariants({ variant: 'quiet', size: 'icon' })}
            >
              <CircleUser className="size-6" />
            </button>
            {aperto && (
              <div
                id="menu-utente"
                className="absolute top-full right-0 z-30 mt-1.5 w-64 rounded-md border border-riga bg-foglio p-1 text-grafite shadow-galleggiante"
              >
                <p className="mb-1 truncate border-b border-riga px-3 pt-2 pb-2.5 text-sm text-grafite-tenue">{sessione?.user.email}</p>
                {amministratore === true && (
                  <Link to="/admin/inviti" onClick={() => setAperto(false)} className={VOCE_MENU}>
                    <UserPlus aria-hidden />
                    Inviti
                  </Link>
                )}
                <button type="button" onClick={uscire} className={VOCE_MENU}>
                  <LogOut aria-hidden />
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 pt-6 pb-[calc(var(--altezza-barra-azioni,0px)+2.5rem)]">
        {children}
      </main>
    </div>
  )
}
