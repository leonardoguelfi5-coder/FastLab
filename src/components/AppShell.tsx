import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleUser, LogOut } from 'lucide-react'
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
  /** Pulsanti della pagina, a destra del titolo e prima del menu. */
  azioni?: ReactNode
  children: ReactNode
}

const VOCE_MENU = 'flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-base hover:bg-muted'

/** Intestazione e menu dell'utente comuni a tutte le pagine dopo l'accesso. */
export function AppShell({ titolo, indietro, azioni, children }: AppShellProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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

  async function uscire() {
    setAperto(false)
    try {
      await esci()
    } catch (e) {
      toast.error(messaggioErrore(e))
      return
    }
    // La cache delle query non è legata all'utente: va svuotata, o il prossimo vedrebbe i dati del precedente.
    queryClient.clear()
    navigate('/accedi', { replace: true })
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-lg items-center gap-1 p-2">
          {indietro && (
            <Link
              to={indietro}
              aria-label="Indietro"
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-11')}
            >
              <ArrowLeft className="size-6" />
            </Link>
          )}
          <h1 className={cn('min-w-0 flex-1 truncate text-xl font-bold', !indietro && 'pl-2')}>{titolo}</h1>
          {azioni}
          <div ref={radiceMenu} className="relative">
            <button
              ref={pulsanteMenu}
              type="button"
              aria-label="Menu"
              aria-expanded={aperto}
              aria-controls="menu-utente"
              onClick={() => setAperto(v => !v)}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-11')}
            >
              <CircleUser className="size-6" />
            </button>
            {aperto && (
              <div
                id="menu-utente"
                className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
              >
                <p className="truncate border-b px-3 py-2 text-sm text-muted-foreground">{sessione?.user.email}</p>
                {amministratore === true && (
                  <Link to="/admin/inviti" onClick={() => setAperto(false)} className={VOCE_MENU}>Inviti</Link>
                )}
                <button type="button" onClick={uscire} className={VOCE_MENU}>
                  <LogOut aria-hidden className="size-4" />
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">{children}</main>
    </div>
  )
}
