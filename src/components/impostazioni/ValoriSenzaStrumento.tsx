import { riassuntoParametro } from '@/components/config/riassunti'
import { Button } from '@/components/ui/button'
import type { Parametro } from '@/domain/tipi'
import { Spiegazione } from './Sezione'

interface ValoriSenzaStrumentoProps {
  valori: Parametro[]
  /** Gli id dei valori con dati; `undefined` finché non si sa. */
  conDati: Set<string> | undefined
  inCorso: boolean
  onArchivia: (p: Parametro) => void
}

/**
 * I valori che non stanno in nessuno strumento: arrivano dalla v2, dove un parametro poteva restarne fuori, e non si
 * misurano. Non si eliminano da qui (potrebbero avere dati di un tempo): si archiviano, e da "Valori archiviati" si
 * possono ripristinare. Senza valori così non compare.
 */
export function ValoriSenzaStrumento({ valori, conDati, inCorso, onArchivia }: ValoriSenzaStrumentoProps) {
  if (valori.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-title text-grafite">Valori senza strumento</h3>
      <Spiegazione>Questi valori non stanno in nessuno strumento, quindi non si misurano. Archiviali: i loro dati, se ci sono, restano.</Spiegazione>
      <ul aria-label="Valori senza strumento" className="flex flex-col border-t border-riga">
        {valori.map(p => (
          <li key={p.id} className="flex items-center gap-3 border-b border-riga py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-grafite">{p.nome}</span>
              <span className="block text-sm text-grafite-tenue">
                {[riassuntoParametro(p), conDati?.has(p.id) && 'ha dati'].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Archivia il valore «${p.nome.trim() || 'senza nome'}»`}
              disabled={inCorso}
              onClick={() => onArchivia(p)}
            >
              Archivia
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
