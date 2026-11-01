import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNote } from '@/api/query'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { descriviCollegamento, promemoriaDelGiorno } from '@/domain/note'
import type { ConfigEsperimento } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { inEliminazione } from '@/lib/eliminaConAnnulla'
import { percorsoDiario, type ArrivoDiario } from '@/lib/percorsi'
import { senzaNoteInEliminazione } from './eliminaNotaConAnnulla'
import { chiaveSpuntaPromemoria, spuntaPromemoriaConAnnulla } from './spuntaPromemoriaConAnnulla'

interface PromemoriaOggiProps {
  espId: string
  config: ConfigEsperimento
  /** Il giorno di calendario di oggi (`useOggi()`): lo stesso del numerino della home. */
  oggi: string
}

/**
 * I promemoria di oggi, in cima alla pagina: le note-promemoria con data di oggi o passata non ancora fatte. La riga
 * apre la nota nel Diario; la spunta ✓, un bersaglio a parte di 44 px, la segna fatta con "Annulla" per 5 secondi.
 * Senza promemoria la sezione non c'è (Oggi resta la pagina degli strumenti); se le note non si leggono lo dice, con
 * «Riprova»: un promemoria mancato in silenzio sarebbe peggio di un errore.
 */
export function PromemoriaOggi({ espId, config, oggi }: PromemoriaOggiProps) {
  const id = useId()
  const queryClient = useQueryClient()
  const note = useNote(espId)

  if (note.data === undefined) {
    return note.isError
      ? (
        <section aria-labelledby={id} className="flex flex-col gap-3">
          <h2 id={id} className="text-label text-grafite-tenue uppercase">Promemoria</h2>
          <ErroreConRiprova errore={note.error} onRiprova={() => void note.refetch()} />
        </section>
      )
      : null
  }

  // Le spunte in attesa restano fuori anche se l'elenco viene riletto dal server nei 5 secondi (il server non sa ancora nulla).
  const voci = promemoriaDelGiorno(senzaNoteInEliminazione(note.data), oggi)
    .filter(n => !inEliminazione(chiaveSpuntaPromemoria(n.id)))
  if (voci.length === 0) return null

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-label text-grafite-tenue uppercase">Promemoria</h2>
      <ul className="-mx-4 flex flex-col border-t border-riga">
        {voci.map(n => (
          <li key={n.id} className="flex items-start border-b border-riga">
            <Link
              to={percorsoDiario(espId)}
              state={{ apriNota: n.id } satisfies ArrivoDiario}
              className="flex min-h-14 min-w-0 flex-1 flex-col gap-1 px-4 py-3.5 transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
            >
              <span className="font-mono text-dato tabular-nums text-grafite-tenue">{formattaData(n.data)}</span>
              <span className="line-clamp-2 break-words whitespace-pre-line text-base text-grafite">{n.testo}</span>
              <span className="break-words font-mono text-sm tabular-nums text-grafite-tenue">{descriviCollegamento(n, config)}</span>
            </Link>
            <button
              type="button"
              aria-label={`Segna fatto: ${n.testo}`}
              onClick={() => spuntaPromemoriaConAnnulla(queryClient, espId, n)}
              className="mt-1.5 mr-3 flex size-11 shrink-0 items-center justify-center rounded-sm border border-riga-controllo bg-foglio text-transparent transition-colors hover:border-grafite-tenue active:bg-carta-ombra"
            >
              <Check aria-hidden className="size-5" strokeWidth={2.5} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
