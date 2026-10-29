import { useId } from 'react'
import { Check } from 'lucide-react'
import type { Parametro } from '@/domain/tipi'
import { Asterisco } from '@/components/Asterisco'
import { Button } from '@/components/ui/button'

interface CampoSiNoProps {
  parametro: Parametro
  valore: boolean | null
  onChange: (valore: boolean | null) => void
  obbligatorio?: boolean
}

interface SceltaProps {
  etichetta: string
  attiva: boolean
  onClick: () => void
}

/** Un pulsante grande della coppia: scelto → inchiostro pieno con il segno ✓ (non solo colore). */
function Scelta({ etichetta, attiva, onClick }: SceltaProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      aria-pressed={attiva}
      onClick={onClick}
      className="flex-1 text-title aria-pressed:border-inchiostro aria-pressed:bg-inchiostro aria-pressed:text-foglio aria-pressed:hover:bg-inchiostro-scuro aria-pressed:active:bg-inchiostro-scuro"
    >
      {attiva && <Check aria-hidden />}
      {etichetta}
    </Button>
  )
}

/** Sì / No in due pulsanti grandi. Ritoccare quello scelto toglie la risposta (`null`). */
export function CampoSiNo({ parametro, valore, onChange, obbligatorio }: CampoSiNoProps) {
  const id = useId()
  return (
    <div
      role="group"
      aria-labelledby={`${id}-nome`}
      aria-describedby={obbligatorio ? `${id}-obbligatorio` : undefined}
      className="flex flex-col gap-1.5"
    >
      <p id={`${id}-nome`} className="flex items-center gap-2 text-label text-grafite-tenue select-none">
        {parametro.nome}
        {obbligatorio && <Asterisco />}
      </p>
      {obbligatorio && <span id={`${id}-obbligatorio`} className="sr-only">Obbligatorio</span>}
      <div className="flex gap-3">
        <Scelta etichetta="Sì" attiva={valore === true} onClick={() => onChange(valore === true ? null : true)} />
        <Scelta etichetta="No" attiva={valore === false} onClick={() => onChange(valore === false ? null : false)} />
      </div>
    </div>
  )
}
