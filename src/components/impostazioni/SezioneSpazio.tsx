import { TriangleAlert } from 'lucide-react'
import { useSpazioProgetto } from '@/api/query'
import type { SpazioEsperimento } from '@/api/spazio'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { migliaia } from '@/domain/export/riepilogo'
import { LIMITE_DATABASE_BYTE, LIMITE_FOTO_BYTE, megabyte, quota } from '@/domain/spazio'
import { cn } from '@/lib/utils'
import type { ConfigEsperimento } from '@/domain/tipi'
// Con l'estensione: su Windows './ArchivioFoto' si confonderebbe con './archivioFoto.ts' (cambia solo la maiuscola).
import { ArchivioFoto } from './ArchivioFoto.tsx'
import { Sezione, Spiegazione } from './Sezione'

const parola = (n: number, una: string, tante: string) => `${migliaia(n)} ${n === 1 ? una : tante}`

/** «Questo esperimento: 3.120 misure, 14 note, 85 foto · circa 31 MB» (righe e file insieme). */
function testoEsperimento(e: SpazioEsperimento): string {
  return `Questo esperimento: ${parola(e.misure, 'misura', 'misure')}, ${parola(e.note, 'nota', 'note')}, `
    + `${parola(e.foto, 'foto', 'foto')} · circa ${megabyte(e.dati_byte + e.foto_byte)} MB`
}

/**
 * Una riga con la sua barra: «Database 38 / 500 MB». Le cifre nel font dei dati, a destra; la barra grafite tenue, in
 * tono attenzione oltre l'80% (mai verde: il verde è solo di "salvato"), ferma al 100 anche quando il numero lo supera.
 */
function RigaSpazio({ nome, etichetta, byte, limite }: { nome: string; etichetta: string; byte: number; limite: number }) {
  const q = quota(byte, limite)
  const pieno = Math.min(100, q.percentuale)
  return (
    <div className="flex flex-col gap-2 border-b border-riga px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-base text-grafite">{nome}</span>
        <span className="font-mono text-base font-medium tabular-nums text-grafite">{`${megabyte(byte)} / ${megabyte(limite)} MB`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={etichetta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pieno}
        aria-valuetext={`${megabyte(byte)} MB su ${megabyte(limite)} MB, ${q.percentuale}%`}
        className="h-1.5 w-full overflow-hidden rounded-sm bg-riga"
      >
        <div className={cn('h-full', q.oltreSoglia ? 'bg-attenzione' : 'bg-grafite-tenue')} style={{ width: `${pieno}%` }} />
      </div>
    </div>
  )
}

function Avviso({ children }: { children: string }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-attenzione">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Lo spazio del progetto (Piano E, Decisione 5): il database e le foto di tutto il progetto Supabase contro i limiti del
 * piano gratuito, 500 MB e 1000 MB, e i conteggi di questo esperimento. I totali sono di tutti gli esperimenti, anche di
 * altri utenti, perché i limiti sono del progetto: lo dice. Senza il calcolo non c'è nessun numero. Sotto c'è l'archivio
 * .zip con «Libera lo spazio» (`ArchivioFoto`), che è del proprietario: gli altri leggono i numeri e basta (`puoGestire`).
 */
export function SezioneSpazio({ espId, config, puoGestire = true }: { espId: string; config: ConfigEsperimento; puoGestire?: boolean }) {
  const spazio = useSpazioProgetto(espId)
  const dati = spazio.data

  return (
    <Sezione titolo="Spazio">
      <Spiegazione>
        Il piano gratuito di Supabase ha due limiti, per tutto il progetto: il database (misure, note, configurazione) e le foto.
      </Spiegazione>

      {dati === undefined ? (
        spazio.isError
          ? <ErroreConRiprova errore={spazio.error} onRiprova={() => void spazio.refetch()} />
          : <p role="status" className="text-sm text-grafite-tenue">Calcolo dello spazio…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="-mx-4 flex flex-col border-t border-riga">
            <RigaSpazio nome="Database" etichetta="Database del progetto" byte={dati.database_byte} limite={LIMITE_DATABASE_BYTE} />
            <RigaSpazio nome="Foto" etichetta="Foto del progetto" byte={dati.foto_byte} limite={LIMITE_FOTO_BYTE} />
          </div>
          {quota(dati.database_byte, LIMITE_DATABASE_BYTE).oltreSoglia && (
            <Avviso>
              Oltre l&apos;80% del database del progetto: vicino al limite il piano gratuito può fermare i salvataggi. Conviene scaricare l&apos;Excel degli esperimenti conclusi.
            </Avviso>
          )}
          {quota(dati.foto_byte, LIMITE_FOTO_BYTE).oltreSoglia && (
            <Avviso>
              Oltre l&apos;80% dello spazio delle foto del progetto: conviene scaricare e liberare le foto degli esperimenti conclusi.
            </Avviso>
          )}
          {dati.esperimento && <p className="text-base text-grafite">{testoEsperimento(dati.esperimento)}</p>}
          <Spiegazione>Anche vuoto, il database occupa qualche decina di MB (tabelle e sistema di Supabase).</Spiegazione>
          <Spiegazione>I numeri sono di tutto il progetto, anche degli esperimenti di altri.</Spiegazione>
        </div>
      )}

      {puoGestire
        ? <ArchivioFoto espId={espId} config={config} />
        : <Spiegazione>Solo il proprietario scarica l&apos;archivio delle foto e libera lo spazio.</Spiegazione>}
    </Sezione>
  )
}
