import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Strumento } from '@/domain/tipi'

/**
 * La riga di uno strumento: icona, nome e una riga nel font dei dati sotto (il progresso, o da quanto non si misura).
 * Un tocco lo sceglie (`onScegli`). La riga di sotto è sempre presente, anche vuota: la riga non cambia altezza quando
 * i dati arrivano. Comune a "Nuova misura" e a Oggi.
 */
export function VoceStrumento({ strumento, testo, onScegli }: { strumento: Strumento; testo: string; onScegli: () => void }) {
  const idTesto = useId()
  return (
    <button
      type="button"
      onClick={onScegli}
      // Il nome del pulsante è quello dello strumento; il progresso (nascosto al nome) ne è la descrizione.
      aria-describedby={idTesto}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra"
    >
      <span aria-hidden className="w-7 shrink-0 text-center text-[22px] leading-none">{strumento.icona}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-[550] text-grafite">{strumento.nome}</span>
        <span id={idTesto} aria-hidden className="min-h-[1.3em] font-mono text-dato tabular-nums text-grafite-tenue">{testo}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-grafite-tenue" />
    </button>
  )
}
