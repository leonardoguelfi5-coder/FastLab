import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useConfig, useFoto, useUrlFoto } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BarraAzioni } from '@/components/BarraAzioni'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { PulsanteAggiungiFoto, StatoCaricamentoFoto } from '@/components/foto/AggiungiFoto'
import { chiaveEliminazioneFoto } from '@/components/foto/eliminaFotoConAnnulla'
import { FotoConVisore } from '@/components/foto/FotoConVisore'
import { useCaricaFoto } from '@/components/foto/useCaricaFoto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { filtraFoto } from '@/domain/foto'
import type { ConfigEsperimento, Foto as FotoTipo } from '@/domain/tipi'
import { inEliminazione } from '@/lib/eliminaConAnnulla'
import { percorsoHome } from '@/lib/percorsi'
import { SOLO_LETTURA_FOTO } from '@/lib/ruoli'
import { usePermessi } from '@/lib/usePermessi'
import { cn } from '@/lib/utils'

const CHIP = 'inline-flex h-11 items-center gap-1.5 rounded-lg border px-3.5 text-base font-medium transition-colors'

interface GalleriaProps {
  espId: string
  config: ConfigEsperimento
  foto: FotoTipo[]
}

/** La galleria a foto e configurazione lette: filtri per pianta e trattamento, miniature per giorno e visore. */
function Galleria({ espId, config, foto }: GalleriaProps) {
  const [pianta, setPianta] = useState('')
  const [trattamentoId, setTrattamentoId] = useState<string | null>(null)

  // Gli URL si chiedono per tutte le foto dell'esperimento, non per quelle filtrate: cambiare un filtro non li rilegge.
  const percorsi = useMemo(() => foto.filter(f => !f.archiviata).map(f => f.percorso), [foto])
  const urls = useUrlFoto(percorsi).data

  // Le foto in attesa di eliminazione restano fuori anche se l'elenco viene riletto dal server nei 5 secondi.
  const visibili = foto.filter(f => !inEliminazione(chiaveEliminazioneFoto(f.id)))
  const filtrate = filtraFoto(visibili, config, { pianta, trattamentoId })
  const filtri = pianta.trim() !== '' || trattamentoId !== null
  const trattamenti = [...config.trattamenti].sort((a, b) => a.ordine - b.ordine)

  if (visibili.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-title text-grafite">Nessuna foto.</p>
        <p className="max-w-[65ch] text-grafite-tenue">
          Scatta con la fotocamera o scegli dalla galleria. Dal visore potrai collegare ogni foto a una pianta.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="foto-cerca-pianta">Cerca pianta</Label>
          <Input
            id="foto-cerca-pianta" type="search" variant="campo" autoComplete="off"
            value={pianta} onChange={e => setPianta(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button" aria-pressed={trattamentoId === null}
            onClick={() => setTrattamentoId(null)}
            className={cn(CHIP, trattamentoId === null ? 'border-inchiostro bg-inchiostro text-foglio active:bg-inchiostro-scuro' : 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra')}
          >
            {trattamentoId === null && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
            Tutti i trattamenti
          </button>
          {trattamenti.map(t => {
            const attivo = trattamentoId === t.id
            return (
              <button
                key={t.id} type="button" aria-pressed={attivo}
                onClick={() => setTrattamentoId(attivo ? null : t.id)}
                className={cn(CHIP, 'font-mono tabular-nums', attivo ? 'border-inchiostro bg-inchiostro text-foglio active:bg-inchiostro-scuro' : 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra')}
              >
                {attivo && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
                {t.etichetta}
              </button>
            )
          })}
        </div>
      </div>

      <p className="font-mono text-dato tabular-nums text-grafite-tenue">{filtrate.length === 1 ? '1 foto' : `${filtrate.length} foto`}</p>

      {filtrate.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-grafite">Nessuna foto con questi filtri.</p>
          {filtri && (
            <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => { setPianta(''); setTrattamentoId(null) }}>
              Azzera i filtri
            </Button>
          )}
        </div>
      ) : (
        <FotoConVisore espId={espId} config={config} foto={filtrate} urls={urls} perGiorno nome="Foto" />
      )}
    </>
  )
}

/** La pagina a configurazione e foto caricate: lo stato dei caricamenti, la galleria e «+ Aggiungi foto» nella barra. */
function FotoCaricate({ espId, config, foto }: GalleriaProps) {
  const carica = useCaricaFoto(espId)
  const { puoMisurare } = usePermessi(espId)
  return (
    <>
      <StatoCaricamentoFoto carica={carica} />
      <Galleria espId={espId} config={config} foto={foto} />
      {puoMisurare ? (
        <BarraAzioni>
          <PulsanteAggiungiFoto carica={carica} variante="principale" />
        </BarraAzioni>
      ) : (
        <p className="text-grafite-tenue">{SOLO_LETTURA_FOTO}</p>
      )}
    </>
  )
}

/** Le foto dell'esperimento (spec §5.8): galleria per giorno, filtri, visore a schermo intero e aggiunta da fotocamera o galleria. */
export function Foto() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const foto = useFoto(espId)

  return (
    <AppShell titolo="Foto" indietro={percorsoHome(espId)}>
      {config.data === undefined || foto.data === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : foto.isError
            ? <ErroreConRiprova errore={foto.error} onRiprova={() => void foto.refetch()} />
            : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <FotoCaricate key={espId} espId={espId} config={config.data} foto={foto.data} />
      )}
    </AppShell>
  )
}
