import type { VoceLegenda } from '@/domain/grafico'

/**
 * La legenda sotto il grafico, in HTML: per ogni serie il campione (un pezzo di linea con il suo marcatore, nel suo
 * colore e con il suo tratteggio) e il nome in Geist Mono grafite, mai nel colore della serie. Mai solo colore: il
 * marcatore e il nome ci sono sempre, anche con una serie sola.
 */
export function Legenda({ voci }: { voci: VoceLegenda[] }) {
  if (voci.length === 0) return null
  return (
    <ul aria-label="Legenda" className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-dato tabular-nums text-grafite">
      {voci.map(v => (
        <li key={v.indice} className="flex items-center gap-2">
          <svg aria-hidden width={26} height={14} viewBox="-13 -7 26 14" className="shrink-0" opacity={v.stile.tenue ? 0.4 : undefined}>
            <line
              x1={-12} x2={12} y1={0} y2={0} stroke={v.stile.colore} strokeWidth={v.stile.spessore}
              strokeDasharray={v.stile.tratteggio ?? undefined}
            />
            <path d={v.stile.marcatore} fill={v.stile.colore} />
          </svg>
          <span>{v.etichetta}</span>
          {v.senzaDati && <span className="text-grafite-tenue"> (nessun dato)</span>}
        </li>
      ))}
    </ul>
  )
}
