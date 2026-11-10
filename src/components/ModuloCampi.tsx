import { createContext, useContext, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

/**
 * I campi che il tasto "Avanti" può raggiungere: caselle, radio, date e campi spenti o in sola lettura no.
 * Il `date` si salta perché Invio lì aprirebbe il calendario. Una sola definizione, usata anche da `ModuloOggi`
 * per trovare il primo campo vuoto.
 */
export const SELETTORE_CAMPI =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="date"]):not([disabled]):not([readonly]), textarea:not([disabled])'

function visibile(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) return false
  const stile = getComputedStyle(el)
  return stile.display !== 'none' && stile.visibility !== 'hidden'
}

/** I campi del contenitore nell'ordine del documento, solo quelli che si vedono. */
// eslint-disable-next-line react-refresh/only-export-components
export function campiDi(contenitore: HTMLElement): HTMLElement[] {
  return [...contenitore.querySelectorAll<HTMLElement>(SELETTORE_CAMPI)].filter(visibile)
}

// Un modulo dentro un altro (un editor di strumento dentro un passo): il <form> esterno fa già tutto, e due <form>
// annidati non sono HTML valido.
const DentroUnModulo = createContext(false)

interface ModuloCampiProps {
  children: ReactNode
  className?: string
}

/**
 * Contenitore dei campi di una schermata. Sul telefono il tasto della tastiera ("Avanti"/"Fatto") deve fare una cosa
 * sola: portare al campo seguente di QUESTO modulo, e sull'ultimo chiudere la tastiera. Il browser da solo salta
 * al campo seguente di tutta la pagina, apre il calendario di una data o chiude la tastiera, e la barra in basso
 * scende sotto il dito. Qui Invio non salva mai e non preme mai un pulsante: salvare resta un gesto esplicito.
 */
export function ModuloCampi({ children, className }: ModuloCampiProps) {
  const annidato = useContext(DentroUnModulo)
  const radice = useRef<HTMLFormElement>(null)

  // `enterkeyhint` dice alla tastiera quale tasto disegnare: "next" su ogni campo tranne l'ultimo, che ha "done".
  // Le righe di una lista e le letture si aggiungono dopo il primo disegno, quindi si osserva il contenitore.
  useEffect(() => {
    const el = radice.current
    if (!el) return
    const aggiorna = () => {
      const campi = campiDi(el)
      campi.forEach((c, i) => {
        if (c.tagName === 'TEXTAREA') return // Invio va a capo: niente tasto "Avanti"
        const suggerimento = i === campi.length - 1 ? 'done' : 'next'
        if (c.getAttribute('enterkeyhint') !== suggerimento) c.setAttribute('enterkeyhint', suggerimento)
      })
    }
    aggiorna()
    // Gli attributi toccati qui non sono osservati: nessun giro infinito.
    const osservatore = new MutationObserver(aggiorna)
    osservatore.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'readonly', 'type'] })
    return () => osservatore.disconnect()
  }, [])

  if (annidato) return <div className={className}>{children}</div>

  function suInvio(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const campo = e.target
    // Una textarea va a capo; solo un input passa al seguente. Pulsanti e altro mantengono il loro comportamento.
    if (!(campo instanceof HTMLInputElement) || !radice.current) return
    if (!campo.matches(SELETTORE_CAMPI)) {
      // Anche su un date o una casella Invio non deve inviare nulla.
      e.preventDefault()
      return
    }
    e.preventDefault()
    const campi = campiDi(radice.current)
    const i = campi.indexOf(campo)
    const seguente = i >= 0 ? campi[i + 1] : undefined
    if (seguente) seguente.focus()
    else campo.blur() // l'ultimo: si chiude solo la tastiera
  }

  return (
    <DentroUnModulo.Provider value>
      <form ref={radice} noValidate className={className} onSubmit={e => e.preventDefault()} onKeyDown={suInvio}>
        {children}
      </form>
    </DentroUnModulo.Provider>
  )
}
