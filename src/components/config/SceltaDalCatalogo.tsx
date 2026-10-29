import type { VoceCatalogo } from '@/domain/tipi'
import { Button } from '@/components/ui/button'
import { ErroreConRiprova } from '@/components/ErroreConRiprova'
import { valoreCatalogo } from './riassunti'

interface SceltaDalCatalogoProps {
  /** Le voci del catalogo; `undefined` finché non sono arrivate (o se non si sono caricate: vedi `errore`). */
  voci: VoceCatalogo[] | undefined
  /** Gli `id` delle voci già nell'esperimento: non si aggiungono due volte. */
  gia: Set<string>
  onAggiungi: (v: VoceCatalogo) => void
  onNuovo: () => void
  /** Il catalogo non si è caricato: al posto dell'elenco c'è l'errore con "Riprova". */
  errore?: unknown
  onRiprova?: () => void
}

/**
 * Le voci del catalogo strumenti, una riga di quaderno ciascuna (icona, nome, valori in cifre tabellari) col pulsante
 * "Aggiungi", e in fondo "+ Nuovo strumento". Non sa dove si aggiunge: chi lo usa decide cosa fare con la voce.
 */
export function SceltaDalCatalogo({ voci, gia, onAggiungi, onNuovo, errore, onRiprova }: SceltaDalCatalogoProps) {
  return (
    <div className="flex flex-col gap-4">
      {errore ? (
        <ErroreConRiprova errore={errore} onRiprova={onRiprova ?? (() => {})} />
      ) : voci === undefined ? (
        <p role="status" className="text-grafite-tenue">Caricamento…</p>
      ) : voci.length === 0 ? (
        <p className="text-sm text-grafite-tenue">Il catalogo è vuoto: crea tu il primo strumento.</p>
      ) : (
        <ul aria-label="Catalogo strumenti" className="-mx-4 flex flex-col border-t border-riga">
          {voci.map(v => {
            const presente = gia.has(v.id)
            return (
              <li key={v.id} className="flex items-center gap-3 border-b border-riga px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-title break-words text-grafite">{[v.icona, v.nome].filter(Boolean).join(' ')}</p>
                  <p className="text-dato break-words text-grafite-tenue">{v.parametri.map(valoreCatalogo).join(' · ')}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={presente}
                  aria-label={presente ? `«${v.nome}» è già nell'esperimento` : `Aggiungi «${v.nome}»`}
                  onClick={() => onAggiungi(v)}
                >
                  {presente ? 'Aggiunto' : 'Aggiungi'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Button variant="outline" onClick={onNuovo} className="self-start">+ Nuovo strumento</Button>
    </div>
  )
}
