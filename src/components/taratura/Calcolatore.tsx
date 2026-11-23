import { useId, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { NumericField } from '@/components/NumericField'
import { SceltaSingola } from '@/components/SceltaSingola'
import {
  calcolaLettura, calcolaPercentuale, decimaliLetturaTarget,
  type CalcoloSubstrato, type CurveSubstrato, type ValoreCalcolato,
} from '@/domain/pesatura/curva'
import { nomeLettura } from '@/domain/pesatura/export'
import type { Sensore } from '@/domain/pesatura/tipi'
import { formattaDecimali } from '@/lib/numeri'

type Modo = 'cc' | 'lettura'

interface CalcolatoreProps {
  gruppi: CurveSubstrato[]
  sensore: Sensore
}

const FUORI_CAMPO = 'fuori dai valori misurati'

function Avviso() {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-attenzione">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {FUORI_CAMPO}
    </span>
  )
}

/**
 * Il calcolatore delle curve: si scrive la % di capacità di campo e esce la lettura dello strumento, oppure si scrive la
 * lettura e esce la % CC. Per ogni substrato: la curva media e una riga per vaso. Un valore oltre le letture misurate è
 * estrapolato: lo dice a parole.
 */
export function Calcolatore({ gruppi, sensore }: CalcolatoreProps) {
  const idTitolo = useId()
  const [modo, setModo] = useState<Modo>('cc')
  const [valore, setValore] = useState<number | null>(null)
  const decimaliLettura = useMemo(() => decimaliLetturaTarget(gruppi), [gruppi])

  const calcoli: CalcoloSubstrato[] | null = useMemo(() => {
    if (valore === null || !Number.isFinite(valore)) return null
    return modo === 'cc' ? calcolaLettura(gruppi, valore) : calcolaPercentuale(gruppi, valore)
  }, [gruppi, modo, valore])

  const testo = (v: ValoreCalcolato): string => {
    if (v.valore === null) return '—'
    return modo === 'cc' ? formattaDecimali(v.valore, decimaliLettura) : `${formattaDecimali(v.valore, 1)} %`
  }
  const nomeVaso = (g: CurveSubstrato, i: number) => g.vasi[i].campione.nome?.trim() || g.vasi[i].campione.id

  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-4">
      <h2 id={idTitolo} className="text-title text-grafite">Calcolatore</h2>
      <SceltaSingola
        nome="Che cosa conosci"
        opzioni={[
          { valore: 'cc', testo: '% di capacità di campo' },
          { valore: 'lettura', testo: 'Lettura dello strumento' },
        ]}
        scelto={modo}
        onScegli={m => { setModo(m); setValore(null) }}
      />
      <NumericField
        key={modo}
        label={modo === 'cc' ? '% di capacità di campo' : nomeLettura(sensore)}
        unita={modo === 'cc' ? '%' : null}
        value={valore}
        onChange={setValore}
        negativo={modo === 'lettura'}
      />

      <div role="region" aria-label="Risultato del calcolatore" className="flex flex-col gap-4">
        {calcoli === null ? (
          <p className="text-grafite-tenue">Scrivi un valore per vedere il risultato.</p>
        ) : (
          calcoli.map(c => {
            const gruppo = gruppi.find(g => g.substrato === c.substrato) as CurveSubstrato
            return (
              <section key={c.substrato} aria-label={`Substrato ${c.substrato}`} className="flex flex-col gap-1 rounded-2xl border border-riga bg-foglio p-4">
                <h3 className="text-title text-grafite">{c.substrato}</h3>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-riga py-2 font-medium text-grafite">
                  <span>Curva media</span>
                  <span className="flex flex-wrap items-center gap-x-3">
                    <span className="font-mono text-title tabular-nums">{testo(c.media)}</span>
                    {c.media.fuoriCampo && <Avviso />}
                  </span>
                </div>
                <ul className="flex flex-col">
                  {c.vasi.map((v, i) => (
                    <li key={v.vaso} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-riga py-2 last:border-0">
                      <span className="font-mono tabular-nums text-grafite">{nomeVaso(gruppo, i)}</span>
                      <span className="flex flex-wrap items-center gap-x-3">
                        <span className="font-mono tabular-nums text-grafite">{testo(v)}</span>
                        {v.fuoriCampo && <Avviso />}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </section>
  )
}
