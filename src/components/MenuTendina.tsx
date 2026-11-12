import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Label } from '@/components/ui/label'

interface MenuTendinaProps<T extends string> {
  etichetta: string
  opzioni: { valore: T; testo: string }[]
  valore: T
  onCambia: (valore: T) => void
  /** Una riga sotto al menu (es. cosa fa la scelta), letta anche dai lettori di schermo. */
  aiuto?: string
}

/**
 * Un menu a tendina con il `<select>` del sistema: sul telefono apre la scelta nativa, grande e comoda col pollice.
 * Ha l'aspetto dei campi (DESIGN.md §5: foglio, bordo che resta visibile al sole, alto 52px).
 */
export function MenuTendina<T extends string>({ etichetta, opzioni, valore, onCambia, aiuto }: MenuTendinaProps<T>) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etichetta}</Label>
      <div className="relative">
        <select
          id={id}
          value={valore}
          aria-describedby={aiuto ? `${id}-aiuto` : undefined}
          onChange={e => onCambia(e.target.value as T)}
          className="h-13 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-riga-controllo bg-foglio pr-11 pl-3.5 text-base text-grafite transition-colors outline-none hover:border-grafite-tenue focus:border-inchiostro focus:ring-3 focus:ring-inchiostro-velato"
        >
          {opzioni.map(o => <option key={o.valore} value={o.valore}>{o.testo}</option>)}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-grafite-tenue" />
      </div>
      {aiuto && <p id={`${id}-aiuto`} className="text-sm text-grafite-tenue">{aiuto}</p>}
    </div>
  )
}
