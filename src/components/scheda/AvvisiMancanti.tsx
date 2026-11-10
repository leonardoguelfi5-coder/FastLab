import { useMemo } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useUltimeMisure } from '@/api/query'
import { avvisiMancanti } from '@/domain/statistiche'
import type { ConfigEsperimento, Misura } from '@/domain/tipi'

interface AvvisiMancantiProps {
  espId: string
  config: ConfigEsperimento
  /** Tutte le misure della pianta. */
  misure: Misura[]
  oggi: string
}

/**
 * Gli avvisi di dati mancanti ("SPAD non misurato da 9 giorni"), una riga discreta ciascuno, con l'icona di attenzione
 * (mai solo colore). Servono le ultime date degli strumenti nell'esperimento: finché non arrivano, o se non arrivano,
 * non si dice nulla: è un aiuto, non una condizione per usare la scheda.
 */
export function AvvisiMancanti({ espId, config, misure, oggi }: AvvisiMancantiProps) {
  const ultime = useUltimeMisure(espId)
  const avvisi = useMemo(
    () => (ultime.data ? avvisiMancanti(config, misure, ultime.data, oggi) : []),
    [ultime.data, config, misure, oggi],
  )
  if (avvisi.length === 0) return null

  return (
    <ul aria-label="Dati mancanti" className="flex flex-col gap-1.5">
      {avvisi.map(avviso => (
        <li key={avviso} className="flex items-start gap-2 text-dato font-sans text-grafite-tenue">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-attenzione" />
          <span>{avviso}</span>
        </li>
      ))}
    </ul>
  )
}
