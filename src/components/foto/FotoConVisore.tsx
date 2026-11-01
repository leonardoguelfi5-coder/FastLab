import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { descriviFoto, raggruppaPerData, testoArchiviata } from '@/domain/foto'
import type { ConfigEsperimento, Foto } from '@/domain/tipi'
import { formattaData } from '@/lib/date'
import { eliminaFotoConAnnulla } from './eliminaFotoConAnnulla'
import { VisoreFoto } from './VisoreFoto'

interface MiniaturaProps {
  foto: Foto
  config: ConfigEsperimento
  url: string | undefined
  onApri: () => void
}

/**
 * Una miniatura quadrata che apre il visore. Il bersaglio è l'intera casella (mai sotto i 44 px). Una foto archiviata
 * non ha il file: segnaposto, e l'URL non si chiede. L'etichetta della pianta, se c'è, è in Geist Mono in un angolo.
 */
function Miniatura({ foto, config, url, onApri }: MiniaturaProps) {
  // L'URL che non si è caricato: un URL rinnovato riparte da capo (un file che prima non c'era può esserci ora).
  const [urlRotto, setUrlRotto] = useState<string | null>(null)
  const rotta = url !== undefined && urlRotto === url
  const pianta = foto.pianta_id === null ? undefined : config.piante.find(p => p.id === foto.pianta_id)
  return (
    <li>
      <button
        type="button"
        aria-label={descriviFoto(foto, config.piante)}
        onClick={onApri}
        className="relative block aspect-square min-h-11 w-full overflow-hidden rounded-sm bg-carta-ombra transition-colors -outline-offset-2 active:bg-riga"
      >
        {foto.archiviata ? (
          <span className="flex size-full items-center justify-center p-1 text-center text-sm text-grafite-tenue">{testoArchiviata(foto)}</span>
        ) : url && !rotta ? (
          <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setUrlRotto(url)} className="size-full object-cover" />
        ) : (
          <span aria-hidden className="flex size-full items-center justify-center p-1 text-center text-sm text-grafite-tenue">{rotta ? 'Non disponibile' : ''}</span>
        )}
        {pianta && (
          <span aria-hidden className="absolute bottom-0 left-0 bg-foglio/90 px-1.5 font-mono text-label tabular-nums text-grafite">{`#${pianta.etichetta}`}</span>
        )}
      </button>
    </li>
  )
}

interface FotoConVisoreProps {
  espId: string
  config: ConfigEsperimento
  /** Le foto da mostrare, già senza quelle in attesa di eliminazione e nell'ordine in cui si scorre. */
  foto: Foto[]
  /** Gli URL firmati per percorso: undefined finché non sono letti. */
  urls: Map<string, string> | undefined
  /** Un gruppo per giorno, con la data in Geist Mono (la galleria); senza, una sola griglia (scheda, nota). */
  perGiorno?: boolean
  /** Il nome della lista per chi non la vede. */
  nome: string
}

/**
 * Le miniature (una griglia, o una per giorno) e il visore a schermo intero che si apre al tocco di una. Lo usano la
 * galleria, la scheda della pianta e l'editor della nota. Eliminare dal visore passa alla foto vicina (la successiva, o
 * la precedente se era l'ultima) e chiude il visore se non ne restano.
 */
export function FotoConVisore({ espId, config, foto, urls, perGiorno = false, nome }: FotoConVisoreProps) {
  const queryClient = useQueryClient()
  const [apertaId, setApertaId] = useState<string | null>(null)
  const ultimaEliminata = useRef(false)

  const gruppi = useMemo(() => (perGiorno ? raggruppaPerData(foto) : null), [foto, perGiorno])
  // La fila su cui scorre il visore è quella che si vede, giorno dopo giorno.
  const fila = useMemo(() => (gruppi ? gruppi.flatMap(g => g.foto) : foto), [gruppi, foto])
  const indice = apertaId === null ? -1 : fila.findIndex(f => f.id === apertaId)
  const aperta = indice >= 0 ? fila[indice] : null

  function elimina(f: Foto) {
    const vicina = fila[indice + 1] ?? fila[indice - 1] ?? null
    ultimaEliminata.current = vicina === null
    setApertaId(vicina?.id ?? null)
    eliminaFotoConAnnulla(queryClient, espId, f)
  }

  const griglia = (dentro: Foto[], etichetta: string) => (
    <ul aria-label={etichetta} className="grid grid-cols-3 gap-1">
      {dentro.map(f => (
        <Miniatura key={f.id} foto={f} config={config} url={urls?.get(f.percorso)} onApri={() => { ultimaEliminata.current = false; setApertaId(f.id) }} />
      ))}
    </ul>
  )

  // Eliminata l'ultima foto il visore si chiude e la miniatura da cui si era partiti sparisce: il fuoco va al pulsante
  // «Aggiungi foto» della pagina, che c'è sempre, e non sul body.
  function fuocoDopoVisore(): HTMLElement | null {
    return ultimaEliminata.current ? document.querySelector<HTMLElement>('[data-aggiungi-foto]') : null
  }

  return (
    <>
      {gruppi ? (
        <ol aria-label={nome} className="flex flex-col gap-6">
          {gruppi.map(g => (
            <li key={g.data} className="flex flex-col gap-2">
              <h2 className="font-mono text-dato font-medium tabular-nums text-grafite">{formattaData(g.data)}</h2>
              {griglia(g.foto, `Foto del ${formattaData(g.data)}`)}
            </li>
          ))}
        </ol>
      ) : griglia(foto, nome)}

      {aperta && (
        <VisoreFoto
          espId={espId}
          config={config}
          foto={aperta}
          posizione={indice + 1}
          totale={fila.length}
          url={aperta.archiviata ? undefined : urls?.get(aperta.percorso)}
          urlLetti={urls !== undefined}
          onPrecedente={indice > 0 ? () => setApertaId(fila[indice - 1].id) : null}
          onSuccessiva={indice < fila.length - 1 ? () => setApertaId(fila[indice + 1].id) : null}
          onChiudi={() => setApertaId(null)}
          onElimina={() => elimina(aperta)}
          fuocoDopo={fuocoDopoVisore}
        />
      )}
    </>
  )
}
