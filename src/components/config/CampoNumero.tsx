import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formattaNumero } from '@/lib/numeri'

interface CampoNumeroProps {
  etichetta: string
  aiuto?: string
  valore: number | null
  /** Chiamato solo con valori validi. */
  onChange: (valore: number | null) => void
  /** Legge il testo digitato: un numero, `null` (campo vuoto ammesso) o `NaN` se non è valido. */
  leggi: (testo: string) => number | null
  /** Il messaggio mostrato mentre il testo non è valido. */
  errore: string
  intero?: boolean
}

/**
 * Campo numerico di configurazione. Mentre si scrive il testo resta com'è (es. "1,") e l'errore
 * compare sotto il campo; uscendo dal campo con un testo non valido torna l'ultimo valore valido,
 * così quel che si vede è sempre quel che è salvato.
 */
export function CampoNumero({ etichetta, aiuto, valore, onChange, leggi, errore, intero }: CampoNumeroProps) {
  const id = useId()
  const [testo, setTesto] = useState(() => formattaNumero(valore))
  const [ultimo, setUltimo] = useState(valore)

  // Valore cambiato da fuori (non da questo campo): il testo lo segue.
  if (!Object.is(valore, ultimo)) {
    setUltimo(valore)
    if (!Object.is(leggi(testo), valore)) setTesto(formattaNumero(valore))
  }

  const sbagliato = Number.isNaN(leggi(testo))
  const descrizione = [aiuto && `${id}-aiuto`, sbagliato && `${id}-errore`].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-sm font-medium">{etichetta}</Label>
      <Input
        id={id}
        type="text"
        inputMode={intero ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={testo}
        aria-invalid={sbagliato || undefined}
        aria-describedby={descrizione || undefined}
        onChange={(e) => {
          const nuovo = e.target.value
          setTesto(nuovo)
          const letto = leggi(nuovo)
          if (Number.isNaN(letto)) return
          setUltimo(letto)
          onChange(letto)
        }}
        onBlur={() => { if (sbagliato) setTesto(formattaNumero(valore)) }}
        className="h-12 text-lg"
      />
      {aiuto && <p id={`${id}-aiuto`} className="text-sm text-muted-foreground">{aiuto}</p>}
      {sbagliato && <p id={`${id}-errore`} className="text-sm text-destructive">{errore}</p>}
    </div>
  )
}
