import { useId } from 'react'
import { SceltaSingola } from '@/components/SceltaSingola'
import { TestoErrore } from '@/components/TestoErrore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ModoPeriodo } from './scelteUi'

interface SceltaPeriodoProps {
  modo: ModoPeriodo
  settimane: number
  da: string
  a: string
  problema?: string
  onModo: (modo: ModoPeriodo) => void
  onDate: (da: string, a: string) => void
}

/** «Ultime 4 settimane»: il numero è quello della scelta (una scelta salvata può averne altre, senza limiti). */
const ultimeSettimane = (n: number) => (n === 1 ? 'Ultima settimana' : `Ultime ${n} settimane`)

/**
 * «3 · Periodo»: tutto, le ultime N settimane (di base 4; un export salvato con altre settimane le mostra) o dal… al….
 * Le settimane restano relative: contano da oggi (o dall'ultima misura, se l'esperimento è concluso) a ogni download.
 */
export function SceltaPeriodo({ modo, settimane, da, a, problema, onModo, onDate }: SceltaPeriodoProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3">
      <SceltaSingola
        nome="Periodo"
        scelto={modo}
        opzioni={[
          { valore: 'tutto', testo: 'Tutto' },
          { valore: 'settimane', testo: ultimeSettimane(settimane) },
          { valore: 'intervallo', testo: 'Dal… al…' },
        ]}
        onScegli={onModo}
      />
      {modo === 'intervallo' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-dal`}>Dal</Label>
            <Input id={`${id}-dal`} type="date" variant="campo" value={da} onChange={e => onDate(e.target.value, a)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-al`}>Al</Label>
            <Input id={`${id}-al`} type="date" variant="campo" value={a} onChange={e => onDate(da, e.target.value)} />
          </div>
        </div>
      )}
      {problema && <TestoErrore>{problema}</TestoErrore>}
    </div>
  )
}
