import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TestoErrore } from '@/components/TestoErrore'
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
  /** Solo interi senza segno: tastiera numerica. Altrimenti tastiera normale, che ha anche il segno meno. */
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etichetta}</Label>
      <Input
        id={id}
        variant="campo"
        type="text"
        // I decimali possono essere negativi (es. un minimo di temperatura): la tastiera "decimal"
        // di iOS non ha il segno meno, quindi tastiera normale.
        inputMode={intero ? 'numeric' : 'text'}
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
      />
      {aiuto && <p id={`${id}-aiuto`} className="text-sm text-grafite-tenue">{aiuto}</p>}
      {sbagliato && <TestoErrore id={`${id}-errore`}>{errore}</TestoErrore>}
    </div>
  )
}
