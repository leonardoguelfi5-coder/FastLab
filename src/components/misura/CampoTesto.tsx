import { useId } from 'react'
import type { Parametro } from '@/domain/tipi'
import { Asterisco } from '@/components/Asterisco'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface CampoTestoProps {
  parametro: Parametro
  valore: string
  onChange: (valore: string) => void
  obbligatorio?: boolean
}

/** Testo libero (note, osservazioni): alto come un campo, cresce con quel che si scrive. */
export function CampoTesto({ parametro, valore, onChange, obbligatorio }: CampoTestoProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {parametro.nome}
        {obbligatorio && <Asterisco />}
      </Label>
      <Textarea
        id={id}
        value={valore}
        aria-required={obbligatorio || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-13"
      />
    </div>
  )
}
