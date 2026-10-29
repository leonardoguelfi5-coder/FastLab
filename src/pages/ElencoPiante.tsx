import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import type { ConfigEsperimento } from '@/domain/tipi'
import { percorsoHome, percorsoPianta } from '@/lib/percorsi'

/**
 * Le piante come righe da quaderno: etichetta (Geist Mono) e trattamento; il tocco apre la scheda. Provvisorio: il
 * Piano B lo rifà con lo stato di ogni pianta.
 */
function Righe({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const piante = useMemo(() => [...config.piante].sort((a, b) => a.ordine - b.ordine), [config.piante])
  const trattamenti = useMemo(() => new Map(config.trattamenti.map(t => [t.id, t.etichetta])), [config.trattamenti])

  if (piante.length === 0) return <p className="text-grafite-tenue">Questo esperimento non ha piante.</p>

  return (
    <ul aria-label="Piante" className="-mx-4 flex flex-col">
      {piante.map(p => (
        <li key={p.id} className="border-b border-riga first:border-t">
          <Link
            to={percorsoPianta(espId, p.id)}
            className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
          >
            <span className="w-14 shrink-0 font-mono text-dato tabular-nums text-grafite">{p.etichetta}</span>
            <span className="min-w-0 flex-1 truncate text-grafite-tenue">{trattamenti.get(p.trattamento_id) ?? ''}</span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Elenco provvisorio delle piante di un esperimento. */
export function ElencoPiante() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const dati = config.data

  return (
    <AppShell titolo="Piante" indietro={percorsoHome(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <Righe espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
