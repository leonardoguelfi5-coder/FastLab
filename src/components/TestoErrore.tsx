import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TestoErroreProps {
  id?: string
  role?: 'alert'
  className?: string
  children: ReactNode
}

/**
 * Messaggio d'errore sotto un campo o un'azione: testo errore con l'icona davanti (mai solo colore).
 * Il testo resta un nodo di testo diretto del paragrafo, così lo trovano lettori di schermo e test.
 */
export function TestoErrore({ id, role, className, children }: TestoErroreProps) {
  return (
    <p id={id} role={role} className={cn('flex items-start gap-1.5 text-sm font-medium text-errore', className)}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}
