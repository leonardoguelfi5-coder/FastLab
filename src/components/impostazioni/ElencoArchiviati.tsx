import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Spiegazione } from './Sezione'

export interface VoceArchiviata {
  id: string
  nome: string
  dettaglio: string
}

interface ElencoArchiviatiProps {
  /** Il titolo del pulsante che apre l'elenco, es. "Strumenti archiviati": segue il numero tra parentesi. */
  titolo: string
  spiegazione: string
  voci: VoceArchiviata[]
  inCorso: boolean
  onRipristina: (id: string) => void
  /** Altre azioni di una voce, prima di "Ripristina" (es. "Elimina" per gli strumenti). */
  altreAzioni?: (id: string) => ReactNode
}

/** Gli archiviati di una sezione, a parte e chiusi finché non si aprono, ognuno con "Ripristina" (e le altre azioni, se ce ne sono). */
export function ElencoArchiviati({ titolo, spiegazione, voci, inCorso, onRipristina, altreAzioni }: ElencoArchiviatiProps) {
  const id = useId()
  const [aperti, setAperti] = useState(false)
  if (voci.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="quiet"
        aria-expanded={aperti}
        aria-controls={aperti ? id : undefined}
        onClick={() => setAperti(a => !a)}
        className="-ml-3 self-start"
      >
        {`${titolo} (${voci.length})`}
        <ChevronDown aria-hidden className={cn('text-grafite-tenue', aperti && 'rotate-180')} />
      </Button>
      {aperti && (
        <div id={id} className="flex flex-col gap-2">
          <Spiegazione>{spiegazione}</Spiegazione>
          <ul className="flex flex-col border-t border-riga">
            {voci.map(v => (
              <li key={v.id} className="flex items-center gap-3 border-b border-riga py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-grafite">{v.nome}</span>
                  <span className="block text-sm text-grafite-tenue">{v.dettaglio}</span>
                </span>
                {altreAzioni?.(v.id)}
                <Button variant="outline" size="sm" disabled={inCorso} onClick={() => onRipristina(v.id)}>Ripristina</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
