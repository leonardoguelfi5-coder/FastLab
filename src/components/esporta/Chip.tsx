import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const CHIP = 'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-base font-medium transition-colors'
/** Scelto = fondo inchiostro velato con il segno (mai inchiostro pieno: quello è solo di «Scarica Excel»). */
const CHIP_SCELTO = 'border-inchiostro bg-inchiostro-velato text-grafite active:bg-inchiostro-velato'
const CHIP_LIBERO = 'border-riga-controllo bg-foglio text-grafite hover:border-grafite-tenue active:bg-carta-ombra'

/**
 * Un chip a scelta multipla di Esporta (strumenti, trattamenti): alto 44 px, `aria-pressed`. Il segno ✓ si aggiunge al
 * colore, perché lo stato non sia solo colore.
 */
export function Chip({ scelto, onClick, mono = false, children }: { scelto: boolean; onClick: () => void; mono?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={scelto} onClick={onClick} className={cn(CHIP, scelto ? CHIP_SCELTO : CHIP_LIBERO, mono && 'font-mono tabular-nums')}>
      {scelto && <Check aria-hidden className="size-4 text-inchiostro" strokeWidth={2.5} />}
      {children}
    </button>
  )
}
