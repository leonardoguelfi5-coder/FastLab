import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { riassuntoParametro } from '@/components/config/riassunti'
import { Button } from '@/components/ui/button'
import type { Parametro } from '@/domain/tipi'
import { cn } from '@/lib/utils'
import { Spiegazione } from './Sezione'

interface ParametriArchiviatiProps {
  archiviati: Parametro[]
  inCorso: boolean
  onRipristina: (p: Parametro) => void
}

/** I parametri archiviati, a parte e chiusi finché non si aprono, ognuno con "Ripristina". */
export function ParametriArchiviati({ archiviati, inCorso, onRipristina }: ParametriArchiviatiProps) {
  const id = useId()
  const [aperti, setAperti] = useState(false)
  if (archiviati.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="quiet"
        aria-expanded={aperti}
        aria-controls={aperti ? id : undefined}
        onClick={() => setAperti(a => !a)}
        className="-ml-3 self-start"
      >
        {`Parametri archiviati (${archiviati.length})`}
        <ChevronDown aria-hidden className={cn('text-grafite-tenue', aperti && 'rotate-180')} />
      </Button>
      {aperti && (
        <div id={id} className="flex flex-col gap-2">
          <Spiegazione>
            Non compaiono nei moduli degli strumenti; i loro dati restano nella storia delle piante e nell'export.
          </Spiegazione>
          <ul className="flex flex-col border-t border-riga">
            {archiviati.map(p => (
              <li key={p.id} className="flex items-center gap-3 border-b border-riga py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-grafite">{p.nome}</span>
                  <span className="block text-sm text-grafite-tenue">{riassuntoParametro(p)}</span>
                </span>
                <Button variant="outline" size="sm" disabled={inCorso} onClick={() => onRipristina(p)}>Ripristina</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
