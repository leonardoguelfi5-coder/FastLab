import type { ReactNode } from 'react'
import type { RigaTabella, RigaTesto, ScalaGrafico, Serie } from '@/domain/dataset'
import { etichettaSerie, stili, valoreScritto } from '@/domain/grafico'
import { formattaData } from '@/lib/date'
import { cn } from '@/lib/utils'

/**
 * Il contenitore che fa scorrere la tabella in orizzontale: sul telefono una riga lunga scorre qui dentro, e non fa
 * scorrere tutta la pagina.
 */
function Scorrevole({ children }: { children: ReactNode }) {
  return <div data-slot="tabella-valori" className="overflow-x-auto border-y border-riga">{children}</div>
}

const CELLA = 'px-3 py-2.5 align-top'
const INTESTAZIONE = 'px-3 py-2 text-left text-label font-medium text-grafite-tenue'
const DATA = 'bg-carta-ombra px-3 py-1.5 text-left font-mono text-dato font-medium tabular-nums text-grafite'

/** Le righe, nell'ordine dato, raggruppate per data (le righe di una stessa data sono una dietro l'altra). */
function perData<T extends { data: string }>(righe: T[]): { data: string; righe: T[] }[] {
  const gruppi: { data: string; righe: T[] }[] = []
  for (const riga of righe) {
    const ultimo = gruppi[gruppi.length - 1]
    if (ultimo && ultimo.data === riga.data) ultimo.righe.push(riga)
    else gruppi.push({ data: riga.data, righe: [riga] })
  }
  return gruppi
}

interface TabellaValoriProps {
  /** Le serie del grafico: servono per il marcatore e il colore di ogni riga, gli stessi della legenda. */
  serie: Serie[]
  /** Le righe di `righeTabella(serie)`: i punti del grafico, non ricalcolati. */
  righe: RigaTabella[]
  scala: ScalaGrafico
  /** Per i lettori di schermo: che cosa contiene la tabella (`SPAD, media per trattamento ± ES`). */
  descrizione: string
}

/**
 * "Mostra i valori": esattamente i punti del grafico, in righe da quaderno raggruppate per data, dalla più recente.
 * Per ogni serie il marcatore e l'etichetta (la stessa della legenda), `41,2 ± 0,8` e `n 7` in Geist Mono; le serie
 * di riferimento (la media del trattamento accanto alle piante cercate) in grafite tenue. Nessuna griglia da foglio
 * di calcolo; è anche l'alternativa accessibile al disegno.
 */
export function TabellaValori({ serie, righe, scala, descrizione }: TabellaValoriProps) {
  const tutti = stili(serie)
  const posto = new Map(serie.map((s, i) => [s, i]))
  return (
    <Scorrevole>
      <table className="w-full min-w-72 border-collapse text-base text-grafite">
        <caption className="sr-only">{descrizione}</caption>
        <thead>
          <tr className="border-b border-riga">
            <th scope="col" className={INTESTAZIONE}>Serie</th>
            <th scope="col" className={cn(INTESTAZIONE, 'text-right')}>{scala === 'percentuale' ? '% di sì' : 'Valore ± ES'}</th>
            <th scope="col" className={cn(INTESTAZIONE, 'text-right')}>n</th>
          </tr>
        </thead>
        {perData(righe).map(gruppo => (
          <tbody key={gruppo.data}>
            <tr>
              <th scope="colgroup" colSpan={3} data-testid="data-gruppo" className={DATA}>{formattaData(gruppo.data)}</th>
            </tr>
            {gruppo.righe.map(riga => {
              const indice = posto.get(riga.serie) ?? 0
              const s = tutti[indice]
              return (
                <tr key={`${gruppo.data}-${indice}`} className="border-b border-riga last:border-b-0">
                  <th scope="row" className={cn(CELLA, 'text-left font-normal', riga.serie.riferimento && 'text-grafite-tenue')}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <svg aria-hidden width={12} height={12} viewBox="-6 -6 12 12" className="shrink-0" opacity={s.tenue ? 0.4 : undefined}>
                        <path d={s.marcatore} fill={s.colore} />
                      </svg>
                      {etichettaSerie(riga.serie)}
                    </span>
                  </th>
                  <td className={cn(CELLA, 'text-right font-mono text-dato tabular-nums whitespace-nowrap', riga.serie.riferimento && 'text-grafite-tenue')}>
                    {valoreScritto(riga, scala)}
                  </td>
                  <td className={cn(CELLA, 'text-right font-mono text-dato tabular-nums whitespace-nowrap text-grafite-tenue')}>{`n ${riga.n}`}</td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </Scorrevole>
  )
}

/**
 * La tabella di un parametro di testo, che non si disegna: per ogni data, dalla più recente, la pianta, il suo
 * trattamento e l'ultimo testo del giorno.
 */
export function TabellaTesto({ righe, descrizione }: { righe: RigaTesto[]; descrizione: string }) {
  return (
    <Scorrevole>
      <table className="w-full min-w-72 border-collapse text-base text-grafite">
        <caption className="sr-only">{descrizione}</caption>
        <thead>
          <tr className="border-b border-riga">
            <th scope="col" className={INTESTAZIONE}>Pianta</th>
            <th scope="col" className={INTESTAZIONE}>Testo</th>
          </tr>
        </thead>
        {perData(righe).map(gruppo => (
          <tbody key={gruppo.data}>
            <tr>
              <th scope="colgroup" colSpan={2} data-testid="data-gruppo" className={DATA}>{formattaData(gruppo.data)}</th>
            </tr>
            {gruppo.righe.map(riga => (
              <tr key={`${gruppo.data}-${riga.pianta.id}`} className="border-b border-riga last:border-b-0">
                <th scope="row" className={cn(CELLA, 'text-left font-normal')}>
                  <span className="block font-mono text-dato tabular-nums whitespace-nowrap">{riga.pianta.etichetta}</span>
                  {riga.trattamento && <span className="block text-label text-grafite-tenue whitespace-nowrap">{riga.trattamento.etichetta}</span>}
                </th>
                <td className={cn(CELLA, 'min-w-48 whitespace-pre-line')}>{riga.testo}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Scorrevole>
  )
}
