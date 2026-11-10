import { strumentiPerScelta } from '@/domain/dataset'
import type { ConfigEsperimento } from '@/domain/tipi'
import { TestoErrore } from '@/components/TestoErrore'
import { Chip } from './Chip'

interface SceltaCosaProps {
  config: ConfigEsperimento
  /** Gli ids degli strumenti scelti. */
  scelti: string[]
  problema?: string
  onCambia: (scelti: string[]) => void
}

/**
 * «1 · Cosa»: gli strumenti dell'esperimento (e la tabella fenologica) a scelta multipla, nell'ordine della
 * configurazione con gli archiviati in fondo, segnati. Almeno uno.
 */
export function SceltaCosa({ config, scelti, problema, onCambia }: SceltaCosaProps) {
  const set = new Set(scelti)
  const alterna = (id: string) => onCambia(set.has(id) ? scelti.filter(x => x !== id) : [...scelti, id])
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Strumenti" className="flex flex-wrap gap-2">
        {strumentiPerScelta(config).map(s => (
          <Chip key={s.id} scelto={set.has(s.id)} onClick={() => alterna(s.id)}>
            {s.icona && <span aria-hidden>{s.icona}</span>}
            {s.archiviato ? `${s.nome} (archiviato)` : s.nome}
          </Chip>
        ))}
      </div>
      {problema && <TestoErrore>{problema}</TestoErrore>}
    </div>
  )
}
