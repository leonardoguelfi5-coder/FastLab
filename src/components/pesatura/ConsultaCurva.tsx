import { useId, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { NumericField } from '@/components/NumericField'
import { SceltaSingola } from '@/components/SceltaSingola'
import {
  consultaPerCC, consultaPerLettura, decimaliDeficit, decimaliLetturaTarget, deficitInMl, PERCENTUALI_TABELLA, sogliaDelSubstrato,
  type CurveSubstrato, type RispostaConsulta, type Soglia,
} from '@/domain/pesatura/curva'
import { nomeLettura } from '@/domain/pesatura/export'
import type { Sensore, UnitaPeso } from '@/domain/pesatura/tipi'
import { decimaliMassimi, formattaDecimali } from '@/lib/numeri'

type Modo = 'cc' | 'lettura'

interface ConsultaCurvaProps {
  gruppi: CurveSubstrato[]
  sensore: Sensore
  /** L'unità di peso della sessione, accanto ai pesi. */
  unita: UnitaPeso
}

const FUORI_CAMPO = 'fuori dai valori misurati'
/** Un peso ricavato: con i decimali dei pesi dei vasi (secco e capacità di campo), come le medie. */
const peso = (n: number | null, decimali: number, unita: string): string => (n === null ? '—' : `${formattaDecimali(n, decimali)} ${unita}`)

function Avviso() {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-attenzione">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {FUORI_CAMPO}
    </span>
  )
}

/**
 * La consultazione delle curve: a che peso portare ogni vaso. Si scrive la % di capacità di campo che si vuole, oppure
 * la lettura del sensore, e per ogni substrato escono il peso di ogni vaso e la media. Sotto, la tabella già pronta con
 * le % CC di `PERCENTUALI_TABELLA`. Un peso ricavato oltre le letture misurate è estrapolato: lo dice a parole.
 */
export function ConsultaCurva({ gruppi, sensore, unita }: ConsultaCurvaProps) {
  const idTitolo = useId()
  const [modo, setModo] = useState<Modo>('cc')
  const [valore, setValore] = useState<number | null>(null)
  const decimali = useMemo(
    () => decimaliMassimi(gruppi.flatMap(g => g.vasi.flatMap(v => [v.secco, v.cc].filter((x): x is number => x !== null)))),
    [gruppi],
  )

  const risposte: RispostaConsulta[] | null = useMemo(() => {
    if (valore === null || !Number.isFinite(valore)) return null
    return modo === 'cc' ? consultaPerCC(gruppi, valore) : consultaPerLettura(gruppi, valore)
  }, [gruppi, modo, valore])
  const tabella = useMemo(() => PERCENTUALI_TABELLA.map(p => ({ p, risposte: consultaPerCC(gruppi, p) })), [gruppi])
  // le soglie di irrigazione si impostano una volta sola sui logger: solo per il TDR
  const conSoglie = sensore.tipo === 'tdr'
  const decimaliTarget = useMemo(() => decimaliLetturaTarget(gruppi), [gruppi])
  const soglie = useMemo(
    () => (conSoglie ? PERCENTUALI_TABELLA.map(p => gruppi.map(g => sogliaDelSubstrato(g, p))) : []),
    [conSoglie, gruppi],
  )
  const rispostaSoglie = useMemo(
    () => (conSoglie && modo === 'cc' && valore !== null && Number.isFinite(valore) ? gruppi.map(g => sogliaDelSubstrato(g, valore)) : null),
    [conSoglie, modo, valore, gruppi],
  )
  const unitaDeficit = deficitInMl(0, unita).unita
  /** Il deficit medio con i decimali dei pesi (spostati se è convertito in mL), "—" se manca. */
  const deficit = (s: Soglia): string =>
    s.deficitMedio === null ? '—' : formattaDecimali(deficitInMl(s.deficitMedio, unita).valore, decimaliDeficit(decimali, unita))
  const target = (s: Soglia): string => (s.letturaTarget === null ? '—' : formattaDecimali(s.letturaTarget, decimaliTarget))
  const nomeVaso = (g: CurveSubstrato, i: number) => g.vasi[i].campione.nome?.trim() || g.vasi[i].campione.id

  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-4">
      <h2 id={idTitolo} className="text-title text-grafite">A che peso portare i vasi</h2>
      <SceltaSingola
        nome="Che cosa conosci"
        opzioni={[
          { valore: 'cc', testo: '% di capacità di campo' },
          { valore: 'lettura', testo: 'Lettura del sensore' },
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

      <div role="region" aria-label="Peso dei vasi" className="flex flex-col gap-4">
        {risposte === null ? (
          <p className="text-grafite-tenue">Scrivi un valore per vedere il peso di ogni vaso.</p>
        ) : (
          risposte.map((r, ri) => {
            const gruppo = gruppi.find(g => g.substrato === r.substrato) as CurveSubstrato
            return (
              <section key={r.substrato} aria-label={`Substrato ${r.substrato}`} className="flex flex-col gap-1 rounded-2xl border border-riga bg-foglio p-4">
                <h3 className="text-title text-grafite">{r.substrato}</h3>
                <ul className="flex flex-col">
                  {r.vasi.map((v, i) => (
                    <li key={v.vaso} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-riga py-2 last:border-0">
                      <span className="font-mono tabular-nums text-grafite">{nomeVaso(gruppo, i)}</span>
                      <span className="flex flex-wrap items-center gap-x-3">
                        <span className="font-mono text-title tabular-nums text-grafite">{peso(v.peso, decimali, unita)}</span>
                        {v.fuoriCampo && <Avviso />}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex flex-wrap items-center gap-x-3 pt-2 font-medium text-grafite">
                  <span>Media {peso(r.media, decimali, unita)}</span>
                  {r.fuoriCampo && <Avviso />}
                </p>
                {rispostaSoglie && (
                  <p className="flex flex-wrap gap-x-4 font-medium text-grafite">
                    <span>TDR target {target(rispostaSoglie[ri])}</span>
                    <span>Deficit medio {deficit(rispostaSoglie[ri])} {unitaDeficit}</span>
                  </p>
                )}
              </section>
            )
          })
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-title text-grafite">Pesi a % CC fisse</h3>
        <div className="overflow-x-auto rounded-2xl border border-riga bg-foglio">
          <table className="w-full min-w-max text-left font-mono text-base tabular-nums text-grafite">
            <caption className="sr-only">Peso dei vasi ({unita}) a ogni percentuale di capacità di campo</caption>
            <thead>
              <tr className="border-b border-riga text-sm text-grafite-tenue">
                <th scope="col" className="px-3 py-3 font-sans font-medium">Vaso ({unita})</th>
                {tabella.map(({ p }) => <th key={p} scope="col" className="px-3 py-3 text-right font-sans font-medium">{p} %</th>)}
              </tr>
            </thead>
            {gruppi.map((g, gi) => (
              <tbody key={g.substrato} className="border-b border-riga last:border-0">
                <tr>
                  <th scope="rowgroup" colSpan={PERCENTUALI_TABELLA.length + 1} className="px-3 pt-3 text-left font-sans text-sm font-medium text-grafite-tenue">
                    {g.substrato}
                  </th>
                </tr>
                {g.vasi.map((v, vi) => (
                  <tr key={v.campione.id}>
                    <th scope="row" className="min-h-11 px-3 py-2.5 text-left font-normal">{nomeVaso(g, vi)}</th>
                    {tabella.map(({ p, risposte: r }) => <td key={p} className="px-3 py-2.5 text-right">{r[gi].vasi[vi].peso === null ? '—' : formattaDecimali(r[gi].vasi[vi].peso as number, decimali)}</td>)}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <th scope="row" className="px-3 py-2.5 text-left font-semibold">Media</th>
                  {tabella.map(({ p, risposte: r }) => <td key={p} className="px-3 py-2.5 text-right">{r[gi].media === null ? '—' : formattaDecimali(r[gi].media as number, decimali)}</td>)}
                </tr>
                {conSoglie && (
                  <>
                    <tr>
                      <th scope="row" className="px-3 py-2.5 text-left font-normal">TDR target</th>
                      {soglie.map((sg, k) => <td key={PERCENTUALI_TABELLA[k]} className="px-3 py-2.5 text-right">{target(sg[gi])}</td>)}
                    </tr>
                    <tr>
                      <th scope="row" className="px-3 py-2.5 text-left font-normal">Deficit medio ({unitaDeficit})</th>
                      {soglie.map((sg, k) => <td key={PERCENTUALI_TABELLA[k]} className="px-3 py-2.5 text-right">{deficit(sg[gi])}</td>)}
                    </tr>
                  </>
                )}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </section>
  )
}
