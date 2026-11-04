import { Fragment, useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useFoto, useNote, useUrlFoto } from '@/api/query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { chiaveEliminazioneFoto } from '@/components/foto/eliminaFotoConAnnulla'
import { FotoConVisore } from '@/components/foto/FotoConVisore'
import { senzaNoteInEliminazione } from '@/components/note/eliminaNotaConAnnulla'
import { fotoDellaPianta } from '@/domain/foto'
import { descriviCollegamento, noteDellaPianta } from '@/domain/note'
import { storiaPianta } from '@/domain/storia'
import type { ConfigEsperimento, Misura, Nota, Pianta, Strumento } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { inEliminazione } from '@/lib/eliminaConAnnulla'
import { percorsoDiario, percorsoModificaMisura, type ArrivoDiario, type ArrivoMisura } from '@/lib/percorsi'
import { cn } from '@/lib/utils'
import { vociMisura } from './voci'

/** Il nome dello strumento sempre scritto (un archiviato lo dice); l'icona che l'utente ha scelto è solo decorazione. */
function NomeStrumento({ strumento }: { strumento: Strumento }) {
  return (
    <>
      {strumento.icona && <><span aria-hidden>{strumento.icona}</span>{' '}</>}
      <span>{strumento.archiviato ? `${strumento.nome} (archiviato)` : strumento.nome}</span>
    </>
  )
}

/**
 * I valori di una misura su due colonne, come un foglio: il nome del parametro a sinistra in grafite tenue, il valore
 * a destra nel font dei dati con le cifre incolonnate. Ogni valore ha la sua riga, così niente si tronca a 360 px.
 */
function ValoriInColonna({ misura, config }: { misura: Misura; config: ConfigEsperimento }) {
  const voci = vociMisura(misura, config.parametri)
  if (voci.length === 0) return <p className="text-grafite-tenue">nessun valore</p>
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
      {voci.map(v => (
        <Fragment key={v.id}>
          <dt className="min-w-0 break-words text-grafite-tenue">{v.nome}</dt>
          <dd className="max-w-[60vw] break-words text-right font-mono tabular-nums text-grafite">{v.valore}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

const arrivo: ArrivoMisura = { daScheda: true }

/**
 * Una nota nella storia: sopra, nel font dei dati, che cosa è e a cosa è collegata ("Nota · Tutto l'esperimento",
 * "Promemoria · W1"); sotto il testo (3 righe, barrato se è un promemoria fatto). Il tocco la apre nel Diario.
 */
function RigaNotaStoria({ espId, config, nota }: { espId: string; config: ConfigEsperimento; nota: Nota }) {
  const fatto = nota.promemoria && nota.fatto_il !== null
  const stato: ArrivoDiario = { apriNota: nota.id }
  return (
    <li className="border-b border-riga">
      <Link
        to={percorsoDiario(espId)}
        state={stato}
        className="flex min-h-11 items-center gap-3 py-3 text-dato transition-colors hover:bg-carta-ombra active:bg-carta-ombra"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="break-words text-label text-grafite-tenue">
            {nota.promemoria ? 'Promemoria' : 'Nota'}
            {' · '}
            <span className="font-mono text-sm tabular-nums">{descriviCollegamento(nota, config)}</span>
          </span>
          <span className={cn('line-clamp-3 break-words whitespace-pre-line text-base', fatto ? 'text-grafite-tenue line-through' : 'text-grafite')}>
            {nota.testo}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
      </Link>
    </li>
  )
}

interface StoriaPiantaProps {
  espId: string
  config: ConfigEsperimento
  pianta: Pianta
  /** Tutte le misure della pianta. */
  misure: Misura[]
}

/**
 * La storia della pianta, in una sola linea del tempo: un gruppo per giorno, dal più recente, e dentro le righe di
 * quaderno delle misure (prima riga "09:12 · 🌡 Termometro", sotto i valori su due colonne; aprono la misura per
 * correggerla), le note che la riguardano (anche via trattamento ed esperimento, con il collegamento detto) e le
 * miniature delle sue foto, che aprono il visore. I parametri archiviati si vedono ancora, con " (archiviato)": il dato resta. Note e foto hanno
 * ognuna la sua lettura: se una non arriva lo dice, con «Riprova», e le misure restano. Quelle in attesa di eliminazione
 * (con «Annulla» ancora aperto) restano fuori anche se gli elenchi vengono riletti dal server.
 */
export function StoriaPianta({ espId, config, pianta, misure }: StoriaPiantaProps) {
  const id = useId()
  const note = useNote(espId)
  const foto = useFoto(espId)
  // Senza memoria: dipendono anche da ciò che è "in attesa" (fuori da React), e gli elenchi di una pianta sono brevi.
  const dellaPianta = note.data ? noteDellaPianta(senzaNoteInEliminazione(note.data), pianta) : []
  const fotoDella = foto.data
    ? fotoDellaPianta(foto.data.filter(f => !inEliminazione(chiaveEliminazioneFoto(f.id))), pianta.id)
    : []
  const urls = useUrlFoto(fotoDella.filter(f => !f.archiviata).map(f => f.percorso)).data
  const giorni = storiaPianta(misure, dellaPianta, fotoDella)
  const strumenti = useMemo(() => new Map(config.strumenti.map(p => [p.id, p])), [config.strumenti])

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-label text-grafite-tenue uppercase">Storia</h3>
      {note.isError && note.data === undefined && (
        <ErroreConRiprova errore={note.error} onRiprova={() => void note.refetch()} />
      )}
      {foto.isError && foto.data === undefined && (
        <ErroreConRiprova errore={foto.error} onRiprova={() => void foto.refetch()} />
      )}
      {giorni.length === 0 ? (
        <p className="text-grafite-tenue">Ancora nessuna misura per questa pianta.</p>
      ) : (
        <ol className="flex flex-col gap-5">
          {giorni.map(g => (
            <li key={g.data}>
              <h4 className="pb-1.5 font-mono text-dato font-medium text-grafite tabular-nums">{formattaData(g.data)}</h4>
              <ul className="border-t border-riga">
                {g.misure.map(m => {
                  const strumento = strumenti.get(m.strumento_id)
                  return (
                    <li key={m.id} className="border-b border-riga">
                      <Link
                        to={percorsoModificaMisura(espId, m.id)}
                        state={arrivo}
                        className="flex min-h-11 items-center gap-3 py-3 text-dato transition-colors hover:bg-carta-ombra active:bg-carta-ombra"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p>
                            <span className="font-mono text-grafite tabular-nums">{m.ora}</span>
                            {strumento && <>{' · '}<NomeStrumento strumento={strumento} /></>}
                          </p>
                          <ValoriInColonna misura={m} config={config} />
                        </div>
                        <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
                      </Link>
                    </li>
                  )
                })}
                {g.note.map(n => <RigaNotaStoria key={n.id} espId={espId} config={config} nota={n} />)}
                {g.foto.length > 0 && (
                  <li className="border-b border-riga py-3">
                    <FotoConVisore
                      espId={espId} config={config} foto={g.foto} urls={urls} nome={`Foto del ${formattaData(g.data)}`}
                    />
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
