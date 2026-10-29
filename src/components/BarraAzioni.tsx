import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BarraAzioniProps {
  /** L'azione principale (a larghezza piena) ed eventualmente un'azione secondaria o un messaggio sopra. */
  children: ReactNode
  className?: string
}

/** Variabile CSS con l'altezza della barra: AppShell la usa come spazio sotto il contenuto, i toast per stare sopra. */
const ALTEZZA = '--altezza-barra-azioni'

/**
 * Barra d'azione fissa in basso (DESIGN.md §5, Navigation): fondo carta, linea riga sopra,
 * padding 12px più l'area sicura del telefono; il contenuto sta nella colonna centrale.
 *
 * La sua altezza (che cresce se compare un messaggio) è pubblicata in `--altezza-barra-azioni`:
 * AppShell aggiunge quello spazio in fondo alla pagina, così la barra non copre mai il contenuto.
 */
export function BarraAzioni({ children, className }: BarraAzioniProps) {
  const barra = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const elemento = barra.current
    if (!elemento) return
    const radice = document.documentElement
    const aggiorna = () => radice.style.setProperty(ALTEZZA, `${elemento.offsetHeight}px`)
    aggiorna()
    // ResizeObserver manca solo in ambienti senza impaginazione (jsdom): lì l'altezza è comunque 0.
    const osservatore = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(aggiorna)
    osservatore?.observe(elemento)
    return () => {
      osservatore?.disconnect()
      radice.style.removeProperty(ALTEZZA)
    }
  }, [])

  return (
    <div
      ref={barra}
      data-slot="barra-azioni"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-riga bg-carta"
    >
      <div className={cn('mx-auto flex max-w-lg flex-col gap-2 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]', className)}>
        {children}
      </div>
    </div>
  )
}
