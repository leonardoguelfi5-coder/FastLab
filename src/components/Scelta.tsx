import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Scelta nativa (sul telefono apre il selettore di sistema) vestita come gli altri campi: foglio, bordo riga
 * controllo, alta 52px. Le opzioni sono gli `<option>` figli.
 */
export function Scelta({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          'h-13 w-full cursor-pointer appearance-none truncate rounded-md border border-riga-controllo bg-foglio pr-11 pl-3.5 text-base text-grafite transition-colors outline-none hover:border-grafite-tenue focus:border-inchiostro focus:ring-3 focus:ring-inchiostro-velato disabled:cursor-not-allowed disabled:border-riga disabled:bg-carta-ombra disabled:text-grafite-tenue',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-grafite-tenue" />
    </div>
  )
}
