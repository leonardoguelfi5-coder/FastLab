import { useEffect, useId, useReducer, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { oraLocale } from '@/lib/date'

interface CampoOraProps {
  /** L'ora della misura (HH:MM), o `null` per "adesso": allora si prende al momento del salvataggio. */
  ora: string | null
  /** All'apertura del selettore: l'ora mostrata diventa quella della misura (non è ancora una modifica). */
  onApri: (ora: string) => void
  /** L'ora cambiata a mano. */
  onChange: (ora: string) => void
}

/**
 * L'ora della misura, di solito da non toccare: un pulsante discreto "Ora: 09:12 ✎". Toccandolo l'ora mostrata
 * diventa quella della misura e compare il selettore per cambiarla.
 */
export function CampoOra({ ora, onApri, onChange }: CampoOraProps) {
  const id = useId()
  const [aperto, setAperto] = useState(false)
  const [, ridisegna] = useReducer((n: number) => n + 1, 0)

  // "Adesso" va avanti: il pulsante deve mostrare l'ora con cui la misura verrebbe salvata.
  useEffect(() => {
    if (ora !== null) return
    const timer = setInterval(ridisegna, 15_000)
    return () => clearInterval(timer)
  }, [ora])

  const mostrata = ora ?? oraLocale()

  if (!aperto) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-mr-3 shrink-0"
        onClick={() => {
          onApri(mostrata)
          setAperto(true)
        }}
      >
        <span>Ora: <span className="font-mono tabular-nums">{mostrata}</span></span>
        <Pencil aria-hidden className="size-4" />
      </Button>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor={id}>Ora</Label>
      <Input
        id={id}
        type="time"
        variant="campo"
        autoFocus
        value={mostrata}
        // Svuotare il selettore non è un'ora: resta quella di prima.
        onChange={e => {
          const nuova = e.target.value.slice(0, 5)
          if (nuova && nuova !== mostrata) onChange(nuova)
        }}
        className="w-36"
      />
    </div>
  )
}
