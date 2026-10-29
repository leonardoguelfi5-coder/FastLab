import { useId, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Asterisco } from '@/components/Asterisco'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { TestoErrore } from '@/components/TestoErrore'
import { formattaNumero, parseNumero } from '@/lib/numeri'

interface NumericFieldProps {
  label: string
  value: number | null
  /** Il numero letto dal testo, `null` se il campo è vuoto, `NaN` se il testo non è un numero. */
  onChange: (value: number | null) => void
  /** Unità di misura, a destra dentro il campo. */
  unita?: string | null
  /** Messaggio che non blocca (es. valore fuori dall'intervallo atteso): bordo e testo di attenzione. */
  avviso?: string
  placeholder?: string
  /** Campo richiesto: asterisco dopo l'etichetta e `aria-required`. */
  obbligatorio?: boolean
  /** Ammette valori negativi: tastiera con il segno meno, che quella decimale di iOS non ha. */
  negativo?: boolean
  /** Solo per i moduli della versione 2, che lo usano ancora: attributo `required` nativo. */
  required?: boolean
}

const ERRORE = 'Scrivi un numero, es. 12,5.'
// Inizi di numero ancora incompleti ("-", ",", "-,"): non sono un errore finché si sta scrivendo.
const IN_CORSO = /^-?[.,]?$/

/** Il testo da mostrare per un valore che arriva da fuori: vuoto per `null` e per `NaN`. */
const testoDa = (v: number | null) => (v === null || Number.isNaN(v) ? '' : formattaNumero(v))

/**
 * Campo numerico delle misure. Tiene il testo digitato (es. "24," o "abc") e comunica a ogni tasto
 * `parseNumero(testo)`: un numero, `null` se vuoto, `NaN` se non è un numero. A differenza dei campi di
 * configurazione non riscrive mai quel che è stato digitato: il `NaN` arriva fino al salvataggio,
 * che si ferma. Il testo si riallinea a `value` solo se `value` cambia da fuori e non coincide già.
 */
export function NumericField({ label, value, onChange, unita, avviso, placeholder, obbligatorio, negativo, required }: NumericFieldProps) {
  const id = useId()
  const [testo, setTesto] = useState(() => testoDa(value))
  const [valorePrecedente, setValorePrecedente] = useState(value)
  const [messoAFuoco, setMessoAFuoco] = useState(false)

  if (!Object.is(value, valorePrecedente)) {
    setValorePrecedente(value)
    if (!Object.is(parseNumero(testo), value)) setTesto(testoDa(value))
  }

  // Errore se il testo non è un numero (ma non per un inizio di numero mentre lo si scrive) o se da fuori
  // arriva NaN con il campo vuoto (es. dopo un rimontaggio): il testo andato perso non diventa un campo vuoto qualunque.
  const testoNonValido = Number.isNaN(parseNumero(testo)) && !(messoAFuoco && IN_CORSO.test(testo.trim()))
  const errore = testoNonValido || (Number.isNaN(value) && testo.trim() === '')
  const descrizione = [unita && `${id}-unita`, avviso && `${id}-avviso`, errore && `${id}-errore`].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {obbligatorio && <Asterisco />}
      </Label>
      <div className="relative">
        <Input
          id={id}
          variant="campo"
          type="text"
          inputMode={negativo ? 'text' : 'decimal'}
          autoComplete="off"
          value={testo}
          placeholder={placeholder}
          required={required}
          aria-required={obbligatorio || undefined}
          aria-invalid={errore || undefined}
          aria-describedby={descrizione || undefined}
          // Con un'unità il testo non deve finirle sotto: spazio a destra in proporzione alle sue lettere.
          style={unita ? { paddingRight: `${1.5 + unita.length * 0.5}rem` } : undefined}
          className={avviso ? 'border-attenzione hover:border-attenzione focus:border-attenzione focus:ring-attenzione-velato' : undefined}
          onChange={(e) => {
            setTesto(e.target.value)
            onChange(parseNumero(e.target.value))
          }}
          onFocus={(e) => {
            setMessoAFuoco(true)
            // Un valore precompilato (ricordato o progressivo) si sostituisce: scrivere non lo allunga ("24,5" + "31").
            // Safari su iOS rimette il cursore dopo il tocco, quindi la selezione si ripete un attimo dopo.
            const campo = e.currentTarget
            campo.select()
            setTimeout(() => {
              if (document.activeElement === campo) campo.setSelectionRange(0, campo.value.length)
            }, 0)
          }}
          onBlur={() => {
            setMessoAFuoco(false)
            // Un numero valido passa alla scrittura italiana ("24.5" → "24,5", ",5" → "0,5"); il valore non cambia.
            // Se il testo normalizzato non si rilegge uguale (es. "1e-7") resta quello digitato.
            const n = parseNumero(testo)
            if (n === null || Number.isNaN(n)) return
            const italiano = formattaNumero(n)
            if (Object.is(parseNumero(italiano), n)) setTesto(italiano)
          }}
        />
        {unita && (
          <span id={`${id}-unita`} className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-label text-grafite-tenue">
            {unita}
          </span>
        )}
      </div>
      {avviso && (
        <p id={`${id}-avviso`} className="flex items-start gap-1.5 text-sm font-medium text-attenzione">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {avviso}
        </p>
      )}
      {errore && <TestoErrore id={`${id}-errore`}>{ERRORE}</TestoErrore>}
    </div>
  )
}
