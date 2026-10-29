import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Ogni scelta è una riga di quaderno larga quanto la colonna: titolo, spiegazione e freccia.
const SCELTA = 'h-auto w-full justify-between gap-3 rounded-none border-0 border-b border-riga bg-transparent px-4 py-4 text-left whitespace-normal hover:bg-carta-ombra/70 active:bg-carta-ombra -outline-offset-2'

/** Prima schermata con la bozza vuota: partire dal modello Hydrochar o da zero. */
export function SceltaIniziale({ onModello, onDaZero }: { onModello: () => void; onDaZero: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-headline text-grafite">Come vuoi iniziare?</h2>
      <div className="-mx-4 flex flex-col border-t border-riga">
        <Button variant="quiet" onClick={onModello} className={SCELTA}>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-title text-grafite">Parti dal modello Hydrochar</span>
            <span className="text-dato font-sans text-grafite-tenue">
              Fattori Stress × Hydrochar, 8 trattamenti, 56 piante, parametri e strumenti già pronti: li modifichi come vuoi.
            </span>
          </span>
          <ChevronRight aria-hidden className="text-grafite-tenue" />
        </Button>
        <Button variant="quiet" onClick={onDaZero} className={SCELTA}>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-title text-grafite">Parti da zero</span>
            <span className="text-dato font-sans text-grafite-tenue">Definisci tu fattori, piante, parametri e strumenti.</span>
          </span>
          <ChevronRight aria-hidden className="text-grafite-tenue" />
        </Button>
      </div>
      <p className="text-sm text-grafite-tenue">Per ripartire da un tuo esperimento usa «Duplica» nell'elenco degli esperimenti.</p>
    </div>
  )
}
