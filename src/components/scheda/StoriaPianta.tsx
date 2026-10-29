import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { raggruppaStoria } from '@/domain/misure'
import type { ConfigEsperimento, Misura, Passata } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { percorsoMisura, type ArrivoMisura } from '@/lib/percorsi'
import { VociMisura } from './VociMisura'
import { vociMisura } from './voci'

/** L'icona della passata scelta dall'utente; a chi non la vede si legge il nome. Senza icona, il nome in chiaro. */
function NomePassata({ passata }: { passata: Passata }) {
  if (!passata.icona) return <span className="text-grafite-tenue">{passata.nome}</span>
  return (
    <>
      <span aria-hidden>{passata.icona}</span>
      <span className="sr-only">{passata.nome}</span>
    </>
  )
}

const arrivo: ArrivoMisura = { daScheda: true }

interface StoriaPiantaProps {
  espId: string
  config: ConfigEsperimento
  /** Tutte le misure della pianta. */
  misure: Misura[]
}

/**
 * La storia della pianta: un gruppo per giorno, dal più recente, e dentro una riga di quaderno per misura
 * ("09:12 · 🌡 · Temp aria 24,5 °C · …"), che apre la misura per correggerla. I parametri archiviati si vedono
 * ancora, con " (archiviato)": il dato resta.
 */
export function StoriaPianta({ espId, config, misure }: StoriaPiantaProps) {
  const id = useId()
  const giorni = useMemo(() => raggruppaStoria(misure), [misure])
  const passate = useMemo(() => new Map(config.passate.map(p => [p.id, p])), [config.passate])

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Storia</h3>
      {giorni.length === 0 ? (
        <p className="text-grafite-tenue">Ancora nessuna misura per questa pianta.</p>
      ) : (
        <ol className="flex flex-col gap-5">
          {giorni.map(g => (
            <li key={g.data}>
              <h4 className="pb-1.5 font-mono text-dato font-medium text-grafite tabular-nums">{formattaData(g.data)}</h4>
              <ul className="border-t border-riga">
                {g.misure.map(m => {
                  const passata = passate.get(m.passata_id)
                  return (
                    <li key={m.id} className="border-b border-riga">
                      <Link
                        to={percorsoMisura(espId, m.id)}
                        state={arrivo}
                        className="flex min-h-11 items-center gap-3 py-3 text-dato transition-colors hover:bg-carta-ombra active:bg-carta-ombra"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-grafite tabular-nums">{m.ora}</span>
                          {passata && <>{' · '}<NomePassata passata={passata} /></>}
                          {' · '}
                          <VociMisura voci={vociMisura(m, config.parametri)} />
                        </span>
                        <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
