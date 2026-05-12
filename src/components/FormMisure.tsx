import { NumericField } from './NumericField'
import { RilevazionePrincipale } from '@/types'

type MisureKeys = 'altezza' | 'n_palchi_totali' | 'n_fiori_fioriti' | 'n_frutti' | 'n_frutti_invaiati' | 'spad' | 'temp_aria' | 'temp_pianta'

interface FormMisureProps {
  values: Pick<RilevazionePrincipale, MisureKeys>
  onChange: (key: MisureKeys, value: number | null) => void
}

const FIELDS: { key: MisureKeys; label: string }[] = [
  { key: 'altezza', label: 'Altezza (cm)' },
  { key: 'n_palchi_totali', label: 'N. palchi totali' },
  { key: 'n_fiori_fioriti', label: 'N. fiori fioriti' },
  { key: 'n_frutti', label: 'N. frutti' },
  { key: 'n_frutti_invaiati', label: 'N. frutti invaiati' },
  { key: 'spad', label: 'SPAD' },
  { key: 'temp_aria', label: 'Temp. aria (°C)' },
  { key: 'temp_pianta', label: 'Temp. pianta (°C)' },
]

export function FormMisure({ values, onChange }: FormMisureProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map(({ key, label }) => (
        <NumericField
          key={key}
          label={label}
          value={values[key]}
          onChange={(v) => onChange(key, v)}
        />
      ))}
    </div>
  )
}
