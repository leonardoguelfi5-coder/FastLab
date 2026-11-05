import type { CellaGriglia, StatoPianta } from '@/domain/giro'
import type { Pianta } from '@/domain/tipi'
import { cn } from '@/lib/utils'

/** Le etichette più lunghe di così non stanno in 44 px: le celle si allargano. */
const ETICHETTA_CORTA = 4

const A_PAROLE: Record<StatoPianta, string> = { fatta: 'fatta', incompleta: 'incompleta', da_fare: 'da fare' }

/**
 * Stato, forma e colore insieme (mai solo colore, mai verde: il verde è del "salvato"):
 * fatta = inchiostro velato con ✓; incompleta = bordo d'inchiostro tratteggiato con ½; da fare = foglio e basta.
 */
const STILE: Record<StatoPianta, string> = {
  fatta: 'border-transparent bg-inchiostro-velato text-inchiostro',
  incompleta: 'border-dashed border-inchiostro bg-foglio text-grafite',
  da_fare: 'border-riga-controllo bg-foglio text-grafite',
}

const SEGNO: Record<StatoPianta, string> = { fatta: '✓', incompleta: '½', da_fare: '' }

interface GrigliaPianteProps {
  celle: CellaGriglia[]
  onScegli: (pianta: Pianta) => void
}

/**
 * Le piante del giro in una griglia di celle quadrate (almeno 44 px), una per pianta, con lo stato di oggi. Solo
 * presentazione: lo stato lo calcola chi la usa (le misure in coda d'invio contano già). Il tocco su una cella dà la
 * pianta a `onScegli`. Sotto, la legenda a parole.
 */
export function GrigliaPiante({ celle, onScegli }: GrigliaPianteProps) {
  const lunghe = celle.some(c => c.pianta.etichetta.trim().length > ETICHETTA_CORTA)
  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Piante del giro"
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${lunghe ? '4.5rem' : '2.75rem'}, 1fr))` }}
      >
        {celle.map(({ pianta, stato, attuale }) => (
          <button
            key={pianta.id}
            type="button"
            aria-label={`Pianta #${pianta.etichetta}, ${A_PAROLE[stato]}`}
            aria-current={attuale ? 'true' : undefined}
            onClick={() => onScegli(pianta)}
            className={cn(
              'flex aspect-square min-h-11 min-w-11 flex-col items-center justify-center rounded-md border font-mono text-dato leading-tight tabular-nums transition-colors active:bg-carta-ombra',
              STILE[stato],
              // La pianta che si sta misurando: l'anello del focus, a distanza.
              attuale && 'ring-2 ring-inchiostro ring-offset-2 ring-offset-foglio',
            )}
          >
            <span aria-hidden className="max-w-full truncate px-0.5">{pianta.etichetta}</span>
            <span aria-hidden className="h-3.5 text-label leading-none">{SEGNO[stato]}</span>
          </button>
        ))}
      </div>
      <p className="font-mono text-label text-grafite-tenue">✓ fatta · ½ incompleta · □ da fare</p>
    </div>
  )
}
