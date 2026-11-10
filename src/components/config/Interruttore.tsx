import { useId } from 'react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface InterruttoreProps {
  etichetta: string
  /** Spiegazione sotto l'etichetta, letta anche dai lettori di schermo. */
  aiuto?: string
  checked: boolean
  onCheckedChange: (acceso: boolean) => void
  disabled?: boolean
  /** id di un elemento il cui testo precede l'etichetta nel nome accessibile (es. il nome della riga). */
  contesto?: string
  className?: string
}

/** Interruttore con etichetta cliccabile e spiegazione facoltativa. */
export function Interruttore({ etichetta, aiuto, checked, onCheckedChange, disabled, contesto, className }: InterruttoreProps) {
  const id = useId()
  const idEtichetta = `${id}-etichetta`
  const idAiuto = `${id}-aiuto`

  return (
    <div className={cn('flex items-start gap-3.5', className)}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(acceso) => onCheckedChange(acceso)}
        disabled={disabled}
        aria-labelledby={contesto ? `${contesto} ${idEtichetta}` : idEtichetta}
        aria-describedby={aiuto ? idAiuto : undefined}
      />
      {/* Spento non vuol dire illeggibile: niente opacità, il testo passa a grafite tenue (oltre 7:1). */}
      <div className="flex min-w-0 flex-col gap-0.5 pt-[3px]">
        <label
          id={idEtichetta}
          htmlFor={id}
          className={cn('text-base leading-snug font-medium text-grafite', disabled ? 'text-grafite-tenue' : 'cursor-pointer')}
        >
          {etichetta}
        </label>
        {aiuto && <p id={idAiuto} className="text-sm text-grafite-tenue">{aiuto}</p>}
      </div>
    </div>
  )
}
