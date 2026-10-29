import { Pencil } from 'lucide-react'
import type { Misura, Parametro } from '@/domain/tipi'
import { VociMisura } from './VociMisura'
import { vociMisura } from './voci'

interface ElencoOggiProps {
  misure: Misura[]
  /** Tutti i parametri dell'esperimento, archiviati compresi: una misura può averne. */
  parametri: Parametro[]
  attivaId: string | null
  onCorreggi: (m: Misura) => void
}

/** Le misure già fatte oggi con questo strumento, come righe di quaderno: toccandone una la si corregge. */
export function ElencoOggi({ misure, parametri, attivaId, onCorreggi }: ElencoOggiProps) {
  return (
    <ul aria-label="Misure già registrate" className="-mx-2 border-y border-riga">
      {misure.map(m => {
        const attiva = m.id === attivaId
        return (
          <li key={m.id} className="border-b border-riga last:border-b-0">
            <button
              type="button"
              aria-pressed={attiva}
              onClick={() => { if (!attiva) onCorreggi(m) }}
              className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left text-dato transition-colors hover:bg-riga/40 active:bg-riga/60 aria-pressed:bg-inchiostro-velato"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-grafite tabular-nums">{m.ora}</span>
                {' · '}
                <VociMisura voci={vociMisura(m, parametri)} />
              </span>
              {attiva ? (
                <span aria-hidden className="shrink-0 text-label text-inchiostro">in modifica</span>
              ) : (
                <Pencil aria-hidden className="size-4 shrink-0 text-grafite-tenue" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
