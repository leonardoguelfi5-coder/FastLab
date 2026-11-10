import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { OrdineGiro } from '@/domain/giro'

const CRITERI: { valore: OrdineGiro['criterio']; nome: string }[] = [
  { valore: 'impostazioni', nome: 'Come nelle impostazioni' },
  { valore: 'etichetta', nome: 'Per etichetta' },
  { valore: 'blocco', nome: 'Per blocco' },
]

/** L'ordine a parole brevi, per la riga chiusa: "come nelle impostazioni", "per etichetta, al contrario". */
function descriviOrdineGiro(ordine: OrdineGiro): string {
  const criterio = CRITERI.find(c => c.valore === ordine.criterio)?.nome.toLowerCase() ?? ''
  return ordine.inverso ? `${criterio}, al contrario` : criterio
}

const OPZIONE = 'relative flex min-h-11 cursor-pointer items-center gap-3 text-base text-grafite select-none'
const CASELLA = 'size-5 shrink-0 cursor-pointer accent-inchiostro'

/**
 * La riga "Ordine: come nelle impostazioni ›" della scelta dello strumento: tocca per aprire le quattro scelte
 * (come nelle impostazioni, per etichetta, per blocco, al contrario). La scelta vale per l'esperimento e per tutti gli
 * strumenti: la griglia, "Salva e vai" e "Vai alle mancanti" seguono lo stesso ordine.
 */
export function OrdineGiroScelta({ ordine, onCambia }: { ordine: OrdineGiro; onCambia: (ordine: OrdineGiro) => void }) {
  const id = useId()
  const [aperto, setAperto] = useState(false)

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={aperto}
        aria-controls={id}
        onClick={() => setAperto(a => !a)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-dato text-grafite"
      >
        <span className="font-mono tabular-nums">{`Ordine: ${descriviOrdineGiro(ordine)}`}</span>
        <ChevronRight aria-hidden className={`size-5 shrink-0 text-grafite-tenue transition-transform ${aperto ? 'rotate-90' : ''}`} />
      </button>
      {aperto && (
        <div id={id} className="flex flex-col border-t border-riga pt-1">
          <fieldset className="flex flex-col">
            <legend className="sr-only">Ordine delle piante</legend>
            {CRITERI.map(c => (
              <label key={c.valore} className={OPZIONE}>
                <input
                  type="radio"
                  name={`${id}-criterio`}
                  className={CASELLA}
                  checked={ordine.criterio === c.valore}
                  onChange={() => onCambia({ ...ordine, criterio: c.valore })}
                />
                {c.nome}
              </label>
            ))}
          </fieldset>
          <label className={OPZIONE}>
            <input
              type="checkbox"
              className={CASELLA}
              checked={ordine.inverso}
              onChange={e => onCambia({ ...ordine, inverso: e.target.checked })}
            />
            Al contrario
          </label>
        </div>
      )}
    </div>
  )
}
