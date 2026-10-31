import { useId, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useConfig, useMisureGiorno, useUltimeMisure } from '@/api/query'
import { AppShell } from '@/components/AppShell'
import { BannerData } from '@/components/BannerData'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { VoceStrumento } from '@/components/VoceStrumento'
import { Badge } from '@/components/ui/badge'
import { righeStrumenti, type Giro } from '@/domain/giro'
import { daSistemare } from '@/domain/statistiche'
import type { ConfigEsperimento } from '@/domain/tipi'
import { daQuanto, formattaData, formattaGiornoMese, giorniTra } from '@/lib/date'
import { formattaConUnita } from '@/lib/numeri'
import { percorsoHome, percorsoImpostazioni, percorsoModificaMisura, type ArrivoMisura } from '@/lib/percorsi'
import { useAvviaMisura } from '@/lib/useAvviaMisura'
import { useOggi } from '@/lib/useOggi'
import { useCampoStore } from '@/store/campo'

/**
 * La riga in Geist Mono sotto il nome di uno strumento. Mai un dato falso: finché le letture non arrivano "…", e se
 * la prima fallisce niente (la pagina si usa lo stesso); se fallisce una rilettura restano i dati già letti.
 *  - giro finito oggi: "fatto ✓";
 *  - giro iniziato oggi: "34/56";
 *  - altrimenti da quanto non si misura: "ultima 14/10 (14 giorni fa)", o "mai misurato".
 * Il progresso viene dalle misure di oggi e vale anche se le ultime date non arrivano; "ultima" e "mai misurato"
 * servono entrambe le letture (senza sapere cosa è stato fatto oggi non si può dire "mai").
 */
function testoStrumento(
  giro: Giro | null,
  misureCaricano: boolean,
  ultime: ReturnType<typeof useUltimeMisure>,
  strumentoId: string,
  oggi: string,
): string {
  if (misureCaricano) return '…'
  if (!giro) return ''
  if (giro.totale > 0 && giro.fatte === giro.totale) return 'fatto ✓'
  if (giro.cominciato) return `${giro.fatte}/${giro.totale}`
  if (ultime.isPending) return '…'
  if (ultime.data === undefined) return ''
  const ultima = ultime.data.get(strumentoId)
  if (!ultima) return 'mai misurato'
  // Una data oltre oggi (rilievo registrato in anticipo) non si dice "fra N giorni": resta la sola data.
  return giorniTra(ultima, oggi) < 0
    ? `ultima ${formattaGiornoMese(ultima)}`
    : `ultima ${formattaGiornoMese(ultima)} (${daQuanto(ultima, oggi)})`
}

/**
 * Gli strumenti con il progresso di oggi e da quanto non si misurano. "Oggi" è il giorno di calendario (`useOggi()`),
 * non la data di rilievo dello store: questa pagina dice cosa è stato fatto oggi, anche se chi rileva sta
 * registrando con un'altra data. Il tocco però fa partire la misura sulla data di rilievo, come "Nuova misura", e
 * riprende dal giro di quella data (la stessa lettura, se coincide con oggi): chi registra con una data diversa lo
 * vede nel banner qui sopra.
 */
function Strumenti({ espId, config, oggi }: { espId: string; config: ConfigEsperimento; oggi: string }) {
  const dataRilievo = useCampoStore(s => s.dati(espId, oggi).dataRilievo)
  const misureOggi = useMisureGiorno(espId, oggi)
  // Con la data di rilievo di oggi è la stessa query di sopra: una sola lettura.
  const misureRilievo = useMisureGiorno(espId, dataRilievo)
  const ultime = useUltimeMisure(espId)
  const avvia = useAvviaMisura(espId)

  // I dati restano anche se una rilettura in background fallisce; prima del primo successo non c'è nulla da calcolare.
  const righe = useMemo(() => righeStrumenti(config, misureOggi.data), [config, misureOggi.data])
  const righeRilievo = useMemo(() => righeStrumenti(config, misureRilievo.data), [config, misureRilievo.data])

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
    <ul aria-label="Strumenti" className="-mx-4 flex flex-col">
      {righe.map(riga => (
        <li key={riga.strumento.id} className="border-b border-riga first:border-t">
          <VoceStrumento
            strumento={riga.strumento}
            testo={testoStrumento(riga.giro, misureOggi.isPending, ultime, riga.strumento.id, oggi)}
            // Si parte dalla pianta giusta per la data su cui si registra (la riga dello stesso strumento a quella data).
            onScegli={() => avvia(righeRilievo.find(r => r.strumento.id === riga.strumento.id) ?? riga)}
          />
        </li>
      ))}
    </ul>
  )
}

/** Si torna a Oggi dopo la correzione, non alla scheda della pianta: la modifica torna indietro di una voce. */
const arrivo: ArrivoMisura = { daScheda: true }

/**
 * I valori di oggi molto lontani dalla media del loro trattamento (`daSistemare`), forse un errore di battitura.
 * Ogni riga è in tono attenzione velato, discreta, con il segno a parole ("fuori dal gruppo") oltre al colore; il
 * tocco apre la misura che porta il valore. Senza le misure di oggi non si può dire che va tutto bene: "Caricamento…",
 * o l'errore con "Riprova".
 */
function DaSistemare({ espId, config, oggi }: { espId: string; config: ConfigEsperimento; oggi: string }) {
  const idTitolo = useId()
  const misure = useMisureGiorno(espId, oggi)
  const dati = misure.data

  const voci = useMemo(() => {
    if (!dati) return []
    const piante = new Map(config.piante.map(p => [p.id, p]))
    const strumenti = new Map(config.strumenti.map(s => [s.id, s]))
    const parametri = new Map(config.parametri.map(p => [p.id, p]))
    const misurePerId = new Map(dati.map(m => [m.id, m]))
    return daSistemare(config, dati, oggi).flatMap(v => {
      const pianta = piante.get(v.piantaId)
      const parametro = parametri.get(v.parametroId)
      const strumento = strumenti.get(misurePerId.get(v.misuraId)?.strumento_id ?? '')
      return pianta && parametro && strumento ? [{ ...v, pianta, parametro, strumento }] : []
    })
  }, [dati, config, oggi])

  return (
    <section aria-labelledby={idTitolo} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={idTitolo} className="text-label text-grafite-tenue uppercase">Da sistemare</h2>
        <p className="text-dato font-sans text-grafite-tenue">
          Valori molto lontani dalla media del loro trattamento: forse un errore di battitura.
        </p>
      </div>
      {dati === undefined ? (
        misure.isError
          ? <ErroreConRiprova errore={misure.error} onRiprova={() => void misure.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : voci.length === 0 ? (
        <p className="text-grafite-tenue">Nessun valore da controllare.</p>
      ) : (
        <ul className="-mx-4 flex flex-col">
          {voci.map(v => (
            <li key={`${v.misuraId}-${v.parametroId}`} className="border-b border-riga first:border-t">
              <Link
                to={percorsoModificaMisura(espId, v.misuraId)}
                state={arrivo}
                className="flex min-h-14 items-center gap-3 bg-attenzione-velato/60 px-4 py-3 transition-colors -outline-offset-2 hover:bg-attenzione-velato active:bg-attenzione-velato"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono font-[550] tabular-nums text-grafite">{`Pianta ${v.pianta.etichetta}`}</span>
                    <Badge variant="attenzione" className="font-sans">
                      <TriangleAlert aria-hidden />
                      fuori dal gruppo
                    </Badge>
                  </span>
                  {/* Strumento e parametro spesso si chiamano uguale (SPAD): una volta sola. */}
                  <span className="text-dato font-sans text-grafite-tenue">
                    {v.parametro.nome === v.strumento.nome ? v.strumento.nome : `${v.strumento.nome} · ${v.parametro.nome}`}
                  </span>
                  <span className="flex flex-wrap gap-x-3 font-mono text-dato tabular-nums">
                    <span className="text-grafite">{formattaConUnita(v.valore, v.parametro.unita)}</span>
                    <span className="text-grafite-tenue">{`media trattamento ${formattaConUnita(v.media, v.parametro.unita)}`}</span>
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Il contenuto a configurazione caricata: la data, il banner della data di rilievo, gli strumenti e i valori da sistemare. */
function OggiCaricato({ espId, config }: { espId: string; config: ConfigEsperimento }) {
  const idStrumenti = useId()
  const oggi = useOggi()

  return (
    <>
      <div className="flex flex-col gap-4">
        <p className="font-mono text-dato tabular-nums text-grafite-tenue">{formattaData(oggi)}</p>
        <BannerData espId={espId} />
      </div>
      <section aria-labelledby={idStrumenti} className="flex flex-col gap-3">
        <h2 id={idStrumenti} className="text-label text-grafite-tenue uppercase">Strumenti</h2>
        <Strumenti espId={espId} config={config} oggi={oggi} />
      </section>
      <DaSistemare espId={espId} config={config} oggi={oggi} />
    </>
  )
}

/**
 * "Oggi": cosa si è misurato oggi e cosa manca (gli strumenti con il loro giro), e i valori da controllare. I
 * promemoria arrivano con il Diario (Piano C).
 */
export function Oggi() {
  const { espId = '' } = useParams()
  const config = useConfig(espId)
  const dati = config.data

  return (
    <AppShell titolo="Oggi" indietro={percorsoHome(espId)}>
      {dati === undefined ? (
        config.isError
          ? <ErroreConRiprova errore={config.error} onRiprova={() => void config.refetch()} />
          : <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : (
        <OggiCaricato espId={espId} config={dati} />
      )}
    </AppShell>
  )
}
