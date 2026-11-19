import { conSegno, intestazioniLetturaCC, parametriDelSubstrato, type CurveSubstrato } from '@/domain/pesatura/curva'
import type { Sensore } from '@/domain/pesatura/tipi'

/** Un valore con `decimali` cifre, "—" se manca o non è un numero finito. */
const valore = (n: number | null, decimali: number): string => (n === null || !Number.isFinite(n) ? '—' : conSegno(n, decimali))

/** I parametri delle curve di un substrato: una riga per vaso e la curva media, come la Tabella 4 della tesi (senza le soglie). */
export function TabellaParametri({ gruppo, sensore }: { gruppo: CurveSubstrato; sensore: Sensore }) {
  const lettura = intestazioniLetturaCC(sensore)
  const intestazioni = ['a', 'b', 'R²', lettura.curva, lettura.misurato, 'n']
  return (
    <div className="overflow-x-auto rounded-2xl border border-riga bg-foglio">
      <table className="w-full min-w-max text-left font-mono text-base tabular-nums text-grafite">
        <caption className="sr-only">Parametri delle curve del substrato {gruppo.substrato}</caption>
        <thead>
          <tr>
            <th scope="col" className="px-3 py-3 font-sans font-medium">Vaso</th>
            {intestazioni.map(t => <th key={t} scope="col" className="px-3 py-3 text-right font-sans font-medium">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {parametriDelSubstrato(gruppo).map((r, i) => (
            <tr key={r.media ? 'media' : i} className="border-t border-riga">
              <th scope="row" className={`px-3 py-2.5 text-left ${r.media ? 'font-semibold' : 'font-normal'}`}>{r.nome}</th>
              <td className="px-3 py-2.5 text-right">{valore(r.a, 2)}</td>
              <td className="px-3 py-2.5 text-right">{valore(r.b, 4)}</td>
              <td className="px-3 py-2.5 text-right">{valore(r.r2, 3)}</td>
              <td className="px-3 py-2.5 text-right">{valore(r.letturaCCCurva, 1)}</td>
              <td className="px-3 py-2.5 text-right">{valore(r.letturaCCMisurata, 1)}</td>
              <td className="px-3 py-2.5 text-right">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
