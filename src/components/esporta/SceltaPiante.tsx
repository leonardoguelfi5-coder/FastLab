import { useId } from 'react'
import { SceltaSingola } from '@/components/SceltaSingola'
import { TestoErrore } from '@/components/TestoErrore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MASSIMO_PEZZI_CERCA, limitaCerca } from '@/domain/dataset'
import type { ConfigEsperimento } from '@/domain/tipi'
import { Chip } from './Chip'
import type { ModoPiante } from './scelteUi'

interface SceltaPianteProps {
  config: ConfigEsperimento
  modo: ModoPiante
  trattamenti: string[]
  cercato: string
  /** Le etichette scritte nel campo che ci sono e quelle che non ci sono. */
  trovate: string[]
  nonTrovate: string[]
  problema?: string
  onModo: (modo: ModoPiante) => void
  onTrattamenti: (ids: string[]) => void
  onCercato: (testo: string) => void
}

/** «Non trovata: 99» / «Non trovate: 99, 100»: come nel Dataset. */
function descriviNonTrovate(nonTrovate: string[]): string {
  return `${nonTrovate.length === 1 ? 'Non trovata' : 'Non trovate'}: ${nonTrovate.join(', ')}`
}

/** Le etichette trovate, al più 12: oltre, «e altre N» (con centinaia di piante la riga non deve riempire lo schermo). */
function elencoEtichette(etichette: string[]): string {
  const MASSIMO = 12
  return etichette.length <= MASSIMO ? etichette.join(', ') : `${etichette.slice(0, MASSIMO).join(', ')} e altre ${etichette.length - MASSIMO}`
}

/**
 * «2 · Quali piante»: tutte, per trattamento (almeno uno) o piante precise. Le piante precise si scrivono come in
 * «Cerca piante» del Dataset: etichette esatte separate da virgola, `3` non trova la `13`. Cambiando modo, le scelte
 * degli altri modi restano: tornando indietro si ritrovano.
 */
export function SceltaPiante({ config, modo, trattamenti, cercato, trovate, nonTrovate, problema, onModo, onTrattamenti, onCercato }: SceltaPianteProps) {
  const idCampo = useId()
  const scelti = new Set(trattamenti)
  const ordinati = [...config.trattamenti].sort((a, b) => a.ordine - b.ordine)
  const alterna = (id: string) => onTrattamenti(ordinati.filter(t => (t.id === id ? !scelti.has(id) : scelti.has(t.id))).map(t => t.id))

  return (
    <div className="flex flex-col gap-3">
      <SceltaSingola
        nome="Quali piante"
        scelto={modo}
        opzioni={[
          { valore: 'tutte', testo: 'Tutte' },
          { valore: 'trattamenti', testo: 'Per trattamento…' },
          { valore: 'piante', testo: 'Piante…' },
        ]}
        onScegli={onModo}
      />
      {modo === 'trattamenti' && (
        <div role="group" aria-label="Trattamenti" className="flex flex-wrap gap-2">
          {ordinati.map(t => (
            <Chip key={t.id} scelto={scelti.has(t.id)} onClick={() => alterna(t.id)} mono>{t.etichetta}</Chip>
          ))}
        </div>
      )}
      {modo === 'piante' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idCampo}-piante`}>Piante</Label>
          <Input
            id={`${idCampo}-piante`} type="text" variant="campo" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="es. 35, 36" value={cercato} onChange={e => onCercato(e.target.value)}
          />
          <p className="text-label text-grafite-tenue">Le etichette separate da virgola. Il numero esatto: 3 non trova la 13.</p>
          {limitaCerca(cercato) !== cercato && (
            <p role="status" className="text-base text-grafite-tenue">{`Si cercano solo i primi ${MASSIMO_PEZZI_CERCA} pezzi.`}</p>
          )}
          {trovate.length > 0 && (
            <p className="text-base text-grafite-tenue">
              {trovate.length === 1 ? 'Trovata: ' : 'Trovate: '}
              <span className="font-mono tabular-nums">{elencoEtichette(trovate)}</span>
            </p>
          )}
          {nonTrovate.length > 0 && <p role="status" className="text-base text-grafite-tenue">{descriviNonTrovate(nonTrovate)}</p>}
        </div>
      )}
      {problema && <TestoErrore>{problema}</TestoErrore>}
    </div>
  )
}
