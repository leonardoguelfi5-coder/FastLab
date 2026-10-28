import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EspandibileProps {
  titolo: string
  riassunto: string
  aperto: boolean
  onCambia: () => void
  children: ReactNode
}

/** Voce di un elenco che mostra un riassunto e, toccandola, si apre per la modifica. */
export function Espandibile({ titolo, riassunto, aperto, onCambia, children }: EspandibileProps) {
  const id = useId()
  return (
    <li className="rounded-xl border">
      <button
        type="button"
        aria-expanded={aperto}
        aria-controls={aperto ? id : undefined}
        onClick={onCambia}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{titolo}</span>
          <span className="block text-sm text-muted-foreground">{riassunto}</span>
        </span>
        <ChevronDown aria-hidden className={cn('size-5 shrink-0 transition-transform', aperto && 'rotate-180')} />
      </button>
      {aperto && <div id={id} className="flex flex-col gap-3 border-t p-4">{children}</div>}
    </li>
  )
}
