import type { Parametro } from '@/domain/tipi'
import { descriviIntervallo } from '@/domain/misure'
import { NumericField } from '@/components/NumericField'

interface CampoNumeroProps {
  parametro: Parametro
  /** Una lettura per campo; `NaN` per un testo non numerico. */
  valore: (number | null)[]
  onChange: (valore: (number | null)[]) => void
  obbligatorio?: boolean
}

/** Il messaggio (non bloccante) per una lettura fuori dall'intervallo atteso del parametro. */
function avvisoFuoriIntervallo(p: Parametro, x: number | null): string | undefined {
  if (x === null || !Number.isFinite(x)) return undefined
  const sotto = p.valore_min !== null && x < p.valore_min
  const sopra = p.valore_max !== null && x > p.valore_max
  return sotto || sopra ? `Fuori dall'intervallo atteso (${descriviIntervallo(p)}).` : undefined
}

/** Un campo numerico per lettura: "SPAD · lettura 1", "SPAD · lettura 2"…, o solo il nome se la lettura è una. */
export function CampoNumero({ parametro, valore, onChange, obbligatorio }: CampoNumeroProps) {
  const letture = Array.from({ length: parametro.n_letture }, (_, i) => valore[i] ?? null)
  // La tastiera decimale non ha il segno meno: se il parametro ammette negativi serve quella normale.
  const negativo = parametro.valore_min !== null && parametro.valore_min < 0

  return (
    <div className="flex flex-col gap-4">
      {letture.map((x, i) => (
        <NumericField
          key={i}
          label={parametro.n_letture > 1 ? `${parametro.nome} · lettura ${i + 1}` : parametro.nome}
          unita={parametro.unita}
          value={x}
          avviso={avvisoFuoriIntervallo(parametro, x)}
          obbligatorio={obbligatorio}
          negativo={negativo}
          onChange={(v) => onChange(letture.map((y, j) => (j === i ? v : y)))}
        />
      ))}
    </div>
  )
}
