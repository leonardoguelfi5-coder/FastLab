import { Fragment } from 'react'
import type { Voce } from './voci'

/**
 * I valori di una misura in linea, separati da " · ": nome in grafite tenue, valore in Geist Mono con cifre
 * tabellari (DESIGN.md, "dato in colonna"). Sono testo in linea: il nome accessibile della riga che li contiene
 * si legge come la riga stessa, es. "Temp aria 24,5 °C · Temp pianta 25,1 °C".
 */
export function VociMisura({ voci }: { voci: Voce[] }) {
  if (voci.length === 0) return <span className="text-grafite-tenue">nessun valore</span>
  return voci.map((v, i) => (
    <Fragment key={v.id}>
      {i > 0 && ' · '}
      <span className="text-grafite-tenue">{v.nome}</span>{' '}
      <span className="font-mono text-grafite tabular-nums">{v.valore}</span>
    </Fragment>
  ))
}
