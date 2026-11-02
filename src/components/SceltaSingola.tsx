import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const RIGA_SCELTA = 'flex min-h-11 w-full items-center gap-2 border-b border-riga py-2 text-left text-base text-grafite transition-colors hover:bg-carta-ombra active:bg-carta-ombra'

interface SceltaSingolaProps<T extends string> {
  nome: string
  opzioni: { valore: T; testo: ReactNode }[]
  scelto: T | null
  /** La scelta cambia: con un tocco, con Invio o Spazio e anche con le frecce (come in un `radiogroup`). */
  onScegli: (valore: T) => void
  /**
   * La scelta è confermata: solo con un tocco, Invio o Spazio, mai con le frecce. Chi tiene la scelta in un pannello che
   * si chiude dopo la scelta lo chiude qui: con le frecce si scorre tra le voci senza perdere il fuoco.
   */
  onConferma?: (valore: T) => void
}

/** Una scelta tra poche: righe da quaderno, `radiogroup` con la sola scelta attiva in tabulazione e le frecce che spostano. */
export function SceltaSingola<T extends string>({ nome, opzioni, scelto, onScegli, onConferma }: SceltaSingolaProps<T>) {
  const gruppo = useRef<HTMLDivElement>(null)

  function frecce(evento: KeyboardEvent<HTMLDivElement>) {
    const passo = evento.key === 'ArrowDown' || evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowUp' || evento.key === 'ArrowLeft' ? -1 : 0
    if (passo === 0) return
    evento.preventDefault()
    const adesso = Math.max(0, opzioni.findIndex(o => o.valore === scelto))
    const prossima = opzioni[(adesso + passo + opzioni.length) % opzioni.length]
    onScegli(prossima.valore)
    Array.from(gruppo.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []).find(el => el.dataset.valore === prossima.valore)?.focus()
  }

  return (
    <div ref={gruppo} role="radiogroup" aria-label={nome} onKeyDown={frecce} className="flex flex-col border-t border-riga">
      {opzioni.map((o, i) => {
        const attiva = o.valore === scelto
        return (
          <button
            key={o.valore}
            type="button"
            role="radio"
            data-valore={o.valore}
            aria-checked={attiva}
            tabIndex={attiva || (scelto === null && i === 0) ? 0 : -1}
            onClick={() => { onScegli(o.valore); onConferma?.(o.valore) }}
            className={cn(RIGA_SCELTA, attiva && 'font-semibold')}
          >
            <Check aria-hidden strokeWidth={2.5} className={cn('size-4 shrink-0 text-inchiostro', !attiva && 'invisible')} />
            <span className="min-w-0 flex-1">{o.testo}</span>
          </button>
        )
      })}
    </div>
  )
}
