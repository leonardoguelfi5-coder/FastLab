import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EspandibileProps {
  titolo: ReactNode
  riassunto: string
  /** Uno stato da notare anche a voce chiusa, es. "Modifiche non salvate": sotto il riassunto, in attenzione. */
  nota?: string
  aperto: boolean
  onCambia: () => void
  children: ReactNode
}

/**
 * Voce di un elenco che mostra un riassunto e, toccandola, si apre per la modifica. È una riga di quaderno
 * larga quanto la colonna; aperta, diventa un riquadro carta ombra che tiene insieme intestazione e modifica.
 */
export function Espandibile({ titolo, riassunto, nota, aperto, onCambia, children }: EspandibileProps) {
  const id = useId()
  return (
    <li className={cn('border-b border-riga', aperto && 'bg-carta-ombra')}>
      <button
        type="button"
        aria-expanded={aperto}
        aria-controls={aperto ? id : undefined}
        onClick={onCambia}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-title text-grafite">{titolo}</span>
          <span className="block text-dato font-sans text-grafite-tenue">{riassunto}</span>
          {nota && <span className="block text-sm font-medium text-attenzione">{nota}</span>}
        </span>
        <ChevronDown aria-hidden className={cn('size-5 shrink-0 text-grafite-tenue', aperto && 'rotate-180')} />
      </button>
      {aperto && <div id={id} className="flex flex-col gap-4 px-4 pt-1 pb-5">{children}</div>}
    </li>
  )
}
