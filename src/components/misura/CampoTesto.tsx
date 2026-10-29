import { useId } from 'react'
import type { Parametro } from '@/domain/tipi'
import { Asterisco } from '@/components/Asterisco'
import { SegnoMantenuto } from '@/components/SegnoMantenuto'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface CampoTestoProps {
  parametro: Parametro
  valore: string
  onChange: (valore: string) => void
  obbligatorio?: boolean
  /** Parte dal valore mantenuto dalla pianta di prima: accanto al nome compare il segno "mantenuto". */
  mantenuto?: boolean
}

/** Testo libero (note, osservazioni): alto come un campo, cresce con quel che si scrive. */
export function CampoTesto({ parametro, valore, onChange, obbligatorio, mantenuto }: CampoTestoProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>
          {parametro.nome}
          {obbligatorio && <Asterisco />}
        </Label>
        {mantenuto && <SegnoMantenuto id={`${id}-mantenuto`} />}
      </div>
      <Textarea
        id={id}
        value={valore}
        aria-required={obbligatorio || undefined}
        aria-describedby={mantenuto ? `${id}-mantenuto` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-13"
      />
    </div>
  )
}
