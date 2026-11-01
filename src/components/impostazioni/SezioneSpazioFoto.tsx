import { TriangleAlert } from 'lucide-react'
import { useSpazioFoto } from '@/api/query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { formattaMegabyte, LIMITE_SPAZIO_BYTE, quotaSpazio } from '@/domain/foto'
import { cn } from '@/lib/utils'
import type { ConfigEsperimento } from '@/domain/tipi'
import { ArchivioFoto } from './ArchivioFoto'
import { Sezione, Spiegazione } from './Sezione'

/**
 * Lo spazio delle foto (Piano C, Decisione 5): quanto occupano nell'esperimento e in tutti gli esperimenti di cui si è
 * membri, contro 1 GB del piano gratuito. Il limite vero è dell'intero progetto, e da qui si vedono solo gli esperimenti
 * a cui si ha accesso: lo dice l'etichetta. Oltre l'80% la barra e l'avviso passano al tono attenzione (mai verde: il
 * verde è solo di "salvato"); il numero resta quello vero anche oltre il 100%. Senza il calcolo non c'è nessun numero.
 * Sotto c'è l'archivio .zip con «Libera lo spazio» (`ArchivioFoto`).
 */
export function SezioneSpazioFoto({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const spazio = useSpazioFoto(espId)
  const dati = spazio.data
  const quota = dati ? quotaSpazio(dati.progetto) : null

  return (
    <Sezione titolo="Spazio delle foto">
      <Spiegazione>
        {`Le foto stanno nello spazio gratuito del progetto: ${formattaMegabyte(LIMITE_SPAZIO_BYTE)} (1 GB) in tutto. Il limite è dell'intero progetto; il totale qui sotto conta solo gli esperimenti di cui sei membro, quindi lo spazio realmente usato può essere maggiore.`}
      </Spiegazione>

      {dati === undefined || quota === null ? (
        spazio.isError
          ? <ErroreConRiprova errore={spazio.error} onRiprova={() => void spazio.refetch()} />
          : <p role="status" className="text-sm text-grafite-tenue">Calcolo dello spazio…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="-mx-4 flex flex-col border-t border-riga">
            <div className="flex items-baseline justify-between gap-4 border-b border-riga px-4 py-3">
              <dt className="text-base text-grafite">Questo esperimento</dt>
              <dd className="font-mono text-base font-medium tabular-nums text-grafite">{formattaMegabyte(dati.esperimento)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-riga px-4 py-3">
              <dt className="min-w-0 text-base text-grafite">Totale degli esperimenti di cui sei membro</dt>
              <dd className="shrink-0 text-right">
                <span className="font-mono text-base font-medium tabular-nums text-grafite">{formattaMegabyte(dati.progetto)}</span>
                <span className="block font-mono text-sm tabular-nums text-grafite-tenue">
                  {`${quota.percentuale}% su ${formattaMegabyte(LIMITE_SPAZIO_BYTE)}`}
                </span>
              </dd>
            </div>
          </dl>

          <div
            role="progressbar"
            aria-label="Spazio usato"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, quota.percentuale)}
            className="h-1.5 w-full overflow-hidden rounded-sm bg-riga"
          >
            <div
              className={cn('h-full', quota.oltreSoglia ? 'bg-attenzione' : 'bg-grafite-tenue')}
              style={{ width: `${Math.min(100, quota.percentuale)}%` }}
            />
          </div>

          {quota.oltreSoglia && (
            <p role="status" className="flex items-start gap-2 text-sm text-attenzione">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>Oltre l&apos;80% dello spazio del progetto: conviene scaricare e liberare le foto degli esperimenti conclusi.</span>
            </p>
          )}
        </div>
      )}

      <ArchivioFoto espId={espId} config={config} />
    </Sezione>
  )
}
