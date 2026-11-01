import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { descriviCollegamento } from '@/domain/note'
import type { ConfigEsperimento, Nota } from '@/domain/tipi'
import { dataLocaleDa, formattaData, formattaGiornoMese } from '@/lib/date'
import { cn } from '@/lib/utils'

interface RigaNotaProps {
  nota: Nota
  config: ConfigEsperimento
  aperta: boolean
  onApri: () => void
  onModifica: () => void
  onElimina: () => void
  onSpunta: () => void
}

/**
 * Una nota del Diario come riga di quaderno: la data in Geist Mono, il testo (3 righe, tutto da aperta), a cosa è
 * collegata. Un promemoria porta la parola "Promemoria" e la spunta (bersaglio di 44 px, fuori dal tocco che apre la
 * riga); fatto, resta barrato con "fatto il GG/MM" e si può riaprire.
 */
export function RigaNota({ nota, config, aperta, onApri, onModifica, onElimina, onSpunta }: RigaNotaProps) {
  const fatto = nota.promemoria && nota.fatto_il !== null
  const data = formattaData(nota.data)
  return (
    <li id={`nota-${nota.id}`} className="border-b border-riga">
      <div className="flex items-start">
        <button
          type="button"
          aria-expanded={aperta}
          onClick={onApri}
          className="flex min-h-14 min-w-0 flex-1 flex-col gap-1 px-4 py-3.5 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
        >
          <span className="flex flex-wrap items-baseline gap-x-3 text-dato font-mono tabular-nums text-grafite-tenue">
            <span>{data}</span>
            {nota.promemoria && <span className="font-sans text-label">Promemoria</span>}
            {fatto && nota.fatto_il && <span>{`fatto il ${formattaGiornoMese(dataLocaleDa(nota.fatto_il))}`}</span>}
          </span>
          <span className={cn('break-words whitespace-pre-line text-base', fatto ? 'text-grafite-tenue line-through' : 'text-grafite', !aperta && 'line-clamp-3')}>
            {nota.testo}
          </span>
          <span className="break-words font-mono text-sm tabular-nums text-grafite-tenue">{descriviCollegamento(nota, config)}</span>
        </button>
        {nota.promemoria && (
          <button
            type="button"
            aria-label={`${fatto ? 'Riapri' : 'Segna fatto'} il promemoria del ${data}`}
            onClick={onSpunta}
            className={cn(
              'mt-1.5 mr-3 flex size-11 shrink-0 items-center justify-center rounded-sm border transition-colors',
              fatto
                ? 'border-inchiostro bg-inchiostro-velato text-inchiostro active:bg-riga/60'
                : 'border-riga-controllo bg-foglio text-transparent hover:border-grafite-tenue active:bg-carta-ombra',
            )}
          >
            <Check aria-hidden className="size-5" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {aperta && (
        <div className="flex gap-3 px-4 pb-4">
          <Button type="button" variant="outline" onClick={onModifica}>Modifica</Button>
          <Button type="button" variant="destructive" onClick={onElimina}>Elimina</Button>
        </div>
      )}
    </li>
  )
}
