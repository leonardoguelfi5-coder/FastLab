import { useId, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useConfig, useMisureGiorno, useUltimeMisure } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { prossimaDaMisurare, riepilogoGiro, statiPiante, type StatoPianta } from '@/domain/giro'
import type { ConfigEsperimento, Pianta, Strumento } from '@/domain/tipi'
import { formattaGiornoMese } from '@/lib/date'
import { percorsoFineGiro, percorsoHome, percorsoImpostazioni, percorsoMisura } from '@/lib/percorsi'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

/** Il giro di uno strumento alla data di rilievo: quante piante fatte, se è cominciato e da dove si riprende. */
interface Giro {
  fatte: number
  totale: number
  /** Almeno una pianta già toccata (anche a metà): da qui in poi la riga parla di oggi, non dell'ultima volta. */
  cominciato: boolean
}

interface RigaStrumento {
  strumento: Strumento
  /** `null` finché le misure del giorno non sono arrivate (o se non arrivano): nessun progresso inventato. */
  giro: Giro | null
  /** La prima pianta da misurare; `null` se non ce ne sono (si va alla fine del giro). */
  prossima: Pianta | null
}

/**
 * Gli strumenti non archiviati, nell'ordine dello strumento. Gli stati delle piante si calcolano solo a misure del
 * giorno arrivate: senza, con i parametri e le misure ancora vuoti, ogni strumento risulterebbe "senza parametri
 * attivi" e le sue piante "fatte". Se le misure non arrivano (o non sono ancora arrivate) la prossima pianta è la
 * prima del giro: il modulo di misura chiederà lui cosa fare se ha già misure.
 */
function righeStrumenti(config: ConfigEsperimento, misure: Parameters<typeof statiPiante>[2] | undefined): RigaStrumento[] {
  return config.strumenti
    .filter(s => !s.archiviato)
    .sort((a, b) => a.ordine - b.ordine)
    .map(strumento => {
      if (!misure) return { strumento, giro: null, prossima: prossimaDaMisurare(config.piante, new Map<string, StatoPianta>(), null) }
      const stati = statiPiante(strumento, config.parametri, misure, config.piante)
      const { fatte, totale } = riepilogoGiro(config.piante, stati)
      const cominciato = [...stati.values()].some(stato => stato !== 'da_fare')
      return { strumento, giro: { fatte, totale, cominciato }, prossima: prossimaDaMisurare(config.piante, stati, null) }
    })
}

/** Giro cominciato e non finito: lo strumento che si può riprendere. */
const inCorso = (g: Giro | null): g is Giro => g !== null && g.cominciato && g.fatte < g.totale

/**
 * La riga in Geist Mono sotto il nome. Mai un dato falso: finché le letture non arrivano "…", e se falliscono niente
 * (la pagina si usa lo stesso).
 *  - giro finito: "fatto ✓";
 *  - giro iniziato: "34/56 oggi", o "34/56 il 27/10" se la data di rilievo non è oggi;
 *  - altrimenti la data dell'ultima misura ("ultima volta 21/10"), o "mai misurato".
 * Il progresso viene dalle misure del giorno e vale anche se le ultime date non arrivano; "ultima volta" e "mai
 * misurato" servono entrambe le letture (senza sapere cosa è stato fatto oggi non si può dire "mai").
 */
function testoSecondario(
  giro: Giro | null,
  misureCaricano: boolean,
  ultime: ReturnType<typeof useUltimeMisure>,
  strumentoId: string,
  oggi: string,
  dataRilievo: string,
): string {
  if (misureCaricano) return '…'
  if (!giro) return ''
  if (giro.totale > 0 && giro.fatte === giro.totale) return 'fatto ✓'
  if (giro.cominciato) return `${giro.fatte}/${giro.totale} ${dataRilievo === oggi ? 'oggi' : `il ${formattaGiornoMese(dataRilievo)}`}`
  if (ultime.isPending) return '…'
  if (!ultime.isSuccess) return ''
  const ultima = ultime.data.get(strumentoId)
  return ultima ? `ultima volta ${formattaGiornoMese(ultima)}` : 'mai misurato'
}

function DataRilievo({ espId }: { espId: string }) {
  const id = useId()
  const oggi = useOggi()
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  const setData = useCampoStore(s => s.setData)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Data di rilievo</Label>
      <Input
        id={id}
        type="date"
        variant="campo"
        value={dataRilievo}
        // Svuotare il selettore non è una data: resta quella di prima.
        onChange={e => { if (e.target.value) setData(espId, e.target.value) }}
      />
    </div>
  )
}

/** La riga di uno strumento: icona, nome e il progresso. Un tocco lo sceglie (`onScegli`). */
function VoceStrumento({ strumento, testo, onScegli }: { strumento: Strumento; testo: string; onScegli: () => void }) {
  const idTesto = useId()
  return (
    <button
      type="button"
      onClick={onScegli}
      // Il nome del pulsante è quello dello strumento; il progresso (nascosto al nome) ne è la descrizione.
      aria-describedby={idTesto}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
    >
      <span aria-hidden className="w-7 shrink-0 text-center text-[22px] leading-none">{strumento.icona}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-[550] text-grafite">{strumento.nome}</span>
        {/* Sempre presente, anche vuota: la riga non cambia altezza quando i dati arrivano. */}
        <span id={idTesto} aria-hidden className="min-h-[1.3em] font-mono text-dato tabular-nums text-grafite-tenue">{testo}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
    </button>
  )
}

/** Il contenuto a configurazione caricata: data di rilievo, banner e l'elenco degli strumenti. */
function SceltaCaricata({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const navigate = useNavigate()
  const oggi = useOggi()
  const { strumentoId, dataRilievo } = useCampoStore(s => s.dati(espId, oggi))
  const setStrumento = useCampoStore(s => s.setStrumento)
  const misure = useMisureGiorno(espId, dataRilievo)
  const ultime = useUltimeMisure(espId)
  const dati = misure.isSuccess ? misure.data : undefined

  const righe = useMemo(() => righeStrumenti(config, dati), [config, dati])
  // Lo strumento dello store sta in cima solo se il suo giro è cominciato e non finito alla data di rilievo.
  const inCima = righe.find(r => r.strumento.id === strumentoId && inCorso(r.giro))
  const ordinate = inCima ? [inCima, ...righe.filter(r => r !== inCima)] : righe

  function scegli({ strumento, prossima }: RigaStrumento) {
    setStrumento(espId, strumento.id)
    navigate(prossima ? percorsoMisura(espId, strumento.id, prossima.id) : percorsoFineGiro(espId, strumento.id))
  }

  if (righe.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-grafite-tenue">Questo esperimento non ha strumenti attivi.</p>
        <Link
          to={percorsoImpostazioni(espId)}
          className="inline-flex min-h-11 items-center font-medium text-inchiostro underline decoration-1 underline-offset-4"
        >
          Aggiungine uno dalle Impostazioni
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <DataRilievo espId={espId} />
        <BannerData espId={espId} />
      </div>
      <ul aria-label="Strumenti" className="-mx-4 flex flex-col">
        {ordinate.map(riga => (
          <li key={riga.strumento.id} className="border-b border-riga first:border-t">
            <VoceStrumento
              strumento={riga.strumento}
              testo={testoSecondario(riga.giro, misure.isPending, ultime, riga.strumento.id, oggi, dataRilievo)}
              onScegli={() => scegli(riga)}
            />
            {riga === inCima && riga.prossima && (
              <div className="px-4 pb-3">
                <Button size="lg" className="h-14 w-full" onClick={() => scegli(riga)}>
                  {`Riprendi dalla pianta ${riga.prossima.etichetta}`}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** "Nuova misura": si sceglie lo strumento del giro, con a che punto è oggi, e si parte dalla prima pianta da misurare. */
export function SceltaStrumento() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const dati = config.data

  return (
    <AppShell titolo="Nuova misura" indietro={percorsoHome(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <SceltaCaricata espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
