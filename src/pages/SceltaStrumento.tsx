import { useId, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useConfig, useMisureGiorno, useUltimeMisure } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { Caricamento } from '@/components/Caricamento'
import { BannerData } from '@/components/BannerData'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { VoceStrumento } from '@/components/VoceStrumento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { righeStrumenti, type Giro } from '@/domain/giro'
import type { ConfigEsperimento } from '@/domain/tipi'
import { formattaGiornoMese } from '@/lib/date'
import { percorsoHome, percorsoImpostazioni } from '@/lib/percorsi'
import { useAvviaMisura } from '@/lib/useAvviaMisura'
import { useLetturaInAnticipo } from '@/lib/letturaInAnticipo'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

/** Giro cominciato e non finito: lo strumento che si può riprendere. */
const inCorso = (g: Giro | null): g is Giro => g !== null && g.cominciato && g.fatte < g.totale

/**
 * La riga nel font dei dati sotto il nome. Mai un dato falso: finché le letture non arrivano "…", e se la prima fallisce
 * niente (la pagina si usa lo stesso); se fallisce una rilettura restano i dati già letti.
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
  // Come per le misure del giorno: una rilettura fallita lascia le date già lette.
  if (ultime.data === undefined) return ''
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

/** Il contenuto a configurazione caricata: data di rilievo, banner e l'elenco degli strumenti. */
function SceltaCaricata({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const oggi = useOggi()
  const { strumentoId, dataRilievo } = useCampoStore(s => s.dati(espId, oggi))
  const scegli = useAvviaMisura(espId)
  const misure = useMisureGiorno(espId, dataRilievo)
  const ultime = useUltimeMisure(espId)
  // I dati restano anche se una rilettura in background fallisce: il progresso e "Riprendi" non spariscono per questo.
  // Prima del primo successo non ci sono, e non si calcola nulla.
  const dati = misure.data

  const righe = useMemo(() => righeStrumenti(config, dati), [config, dati])
  // Lo strumento dello store sta in cima solo se il suo giro è cominciato e non finito alla data di rilievo.
  const inCima = righe.find(r => r.strumento.id === strumentoId && inCorso(r.giro))
  const ordinate = inCima ? [inCima, ...righe.filter(r => r !== inCima)] : righe

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
  // Con la rete si leggono in anticipo il giorno di rilievo e le piante (Piano E, Task E7): più tardi, senza rete, il giro
  // funziona anche sulle piante non aperte prima.
  const oggi = useOggi()
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  useLetturaInAnticipo(espId, dati, dataRilievo)

  return (
    <AppShell titolo="Nuova misura" indietro={percorsoHome(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <Caricamento />
      ) : (
        <SceltaCaricata espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
