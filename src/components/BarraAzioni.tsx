import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BarraAzioniProps {
  /** L'azione principale (a larghezza piena) ed eventualmente un'azione secondaria o un messaggio sopra. */
  children: ReactNode
  className?: string
}

/** Variabile CSS con l'altezza della barra: AppShell la usa come spazio sotto il contenuto, i toast per stare sopra. */
const ALTEZZA = '--altezza-barra-azioni'

/** Variabile CSS con i pixel di pagina coperti dalla tastiera: i toast salgono di tanto, per non finirle sotto. */
const TASTIERA = '--tastiera-coperta'

/**
 * Da quanti pixel di tastiera in su la barra smette di tenere lo spazio dell'area sicura del telefono (la barra
 * del gesto home): la tastiera la copre già. Sotto questa soglia ci sono solo i piccoli scarti della barra del browser.
 */
const TASTIERA_MIN = 120

/**
 * Barra d'azione fissa in basso (DESIGN.md §5, Navigation): fondo carta, linea riga sopra,
 * padding 12px più l'area sicura del telefono; il contenuto sta nella colonna centrale.
 *
 * La sua altezza (che cresce se compare un messaggio) è pubblicata in `--altezza-barra-azioni`:
 * AppShell aggiunge quello spazio in fondo alla pagina, così la barra non copre mai il contenuto.
 *
 * Con la tastiera a schermo la barra resta visibile sopra di essa. iOS non ridimensiona mai la pagina per la
 * tastiera (e Android solo con `interactive-widget=resizes-content`, in index.html), e le tastiere numeriche non
 * hanno il tasto Invio: senza questo, l'azione principale finirebbe sotto la tastiera. Si segue `visualViewport`,
 * la parte di pagina davvero visibile: la barra sale della parte di pagina che la tastiera copre in basso.
 */
export function BarraAzioni({ children, className }: BarraAzioniProps) {
  const barra = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const elemento = barra.current
    if (!elemento) return
    const radice = document.documentElement
    const aggiornaAltezza = () => radice.style.setProperty(ALTEZZA, `${elemento.offsetHeight}px`)
    aggiornaAltezza()
    // ResizeObserver manca solo in ambienti senza impaginazione (jsdom): lì l'altezza è comunque 0.
    const osservatore = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(aggiornaAltezza)
    osservatore?.observe(elemento)

    // Senza visualViewport (browser molto vecchi) la barra resta in fondo alla pagina, come prima.
    const vista = window.visualViewport
    const seguiTastiera = () => {
      if (!vista) return
      const coperto = Math.max(0, window.innerHeight - vista.height - vista.offsetTop)
      elemento.style.bottom = `${coperto}px`
      radice.style.setProperty(TASTIERA, `${coperto}px`)
      elemento.toggleAttribute('data-tastiera', coperto >= TASTIERA_MIN)
    }
    seguiTastiera()
    vista?.addEventListener('resize', seguiTastiera)
    vista?.addEventListener('scroll', seguiTastiera)

    return () => {
      osservatore?.disconnect()
      radice.style.removeProperty(ALTEZZA)
      radice.style.removeProperty(TASTIERA)
      vista?.removeEventListener('resize', seguiTastiera)
      vista?.removeEventListener('scroll', seguiTastiera)
    }
  }, [])

  return (
    <div
      ref={barra}
      data-slot="barra-azioni"
      className="group/barra fixed inset-x-0 bottom-0 z-10 border-t border-riga bg-carta"
    >
      <div
        className={cn(
          'mx-auto flex max-w-lg flex-col gap-2 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] group-data-[tastiera]/barra:pb-3',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
