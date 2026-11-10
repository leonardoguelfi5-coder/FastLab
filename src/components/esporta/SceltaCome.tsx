import { useId, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { TestoErrore } from '@/components/TestoErrore'
import type { ComeExport } from '@/domain/export/scelte'
import { cn } from '@/lib/utils'

interface SceltaComeProps {
  come: ComeExport
  problema?: string
  onCambia: (come: ComeExport) => void
}

const RIGA = 'flex min-h-14 w-full items-center gap-3 border-b border-riga px-3 py-2 text-left transition-colors -outline-offset-2 hover:bg-carta-ombra/70 active:bg-carta-ombra'
const RIGA_ATTIVA = 'bg-inchiostro-velato hover:bg-inchiostro-velato active:bg-inchiostro-velato'

/** Una riga da accendere e spegnere: titolo, spiegazione sotto e, da accesa, fondo inchiostro velato con il segno ✓. */
function RigaAttivabile({ attiva, onClick, titolo, spiegazione }: { attiva: boolean; onClick: () => void; titolo: string; spiegazione: string }) {
  return (
    <button type="button" aria-pressed={attiva} onClick={onClick} className={cn(RIGA, attiva && RIGA_ATTIVA)}>
      <Check aria-hidden strokeWidth={2.5} className={cn('size-4 shrink-0 text-inchiostro', !attiva && 'invisible')} />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-grafite">{titolo}</span>
        <span className="block text-dato text-grafite-tenue">{spiegazione}</span>
      </span>
    </button>
  )
}

const EXTRA = [
  { chiave: 'grafici', nome: 'Grafici come immagini', breve: 'grafici' },
  { chiave: 'diario', nome: 'Diario', breve: 'diario' },
  { chiave: 'info', nome: 'Info esperimento', breve: 'info' },
] as const

/**
 * «4 · Come»: i contenuti del file, spuntabili insieme. «Valori di ogni pianta» (fogli Dati, Misure e uno per ogni lista)
 * e «Medie per trattamento» sono due righe da accendere; «Grafici · Diario · Info» si apre in tre caselle.
 */
export function SceltaCome({ come, problema, onCambia }: SceltaComeProps) {
  const [aperto, setAperto] = useState(false)
  const id = useId()
  const attivi = EXTRA.filter(e => come[e.chiave]).map(e => e.breve)
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Contenuti del file" className="flex flex-col border-t border-riga">
        <RigaAttivabile
          attiva={come.valori} onClick={() => onCambia({ ...come, valori: !come.valori })}
          titolo="Valori di ogni pianta" spiegazione="una riga per pianta e data, più ogni singola misura"
        />
        <RigaAttivabile
          attiva={come.medie} onClick={() => onCambia({ ...come, medie: !come.medie })}
          titolo="Medie per trattamento" spiegazione="media, errore standard e n per data"
        />
        <button type="button" aria-expanded={aperto} aria-controls={aperto ? id : undefined} onClick={() => setAperto(v => !v)} className={RIGA}>
          <span className="min-w-0 flex-1 pl-7">
            <span className="block text-base font-medium text-grafite">Grafici · Diario · Info</span>
            <span className="block text-dato text-grafite-tenue">{attivi.length > 0 ? attivi.join(', ') : 'nessuno'}</span>
          </span>
          <ChevronDown aria-hidden className={cn('size-5 shrink-0 text-grafite-tenue', aperto && 'rotate-180')} />
        </button>
        {aperto && (
          <div id={id} className="flex flex-col border-b border-riga bg-carta-ombra pl-10">
            {EXTRA.map(e => (
              <label key={e.chiave} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-riga py-2 pr-3 text-base text-grafite last:border-b-0">
                <input
                  type="checkbox" checked={come[e.chiave]} onChange={() => onCambia({ ...come, [e.chiave]: !come[e.chiave] })}
                  className="size-5 shrink-0 accent-inchiostro"
                />
                {e.nome}
              </label>
            ))}
          </div>
        )}
      </div>
      {problema && <TestoErrore>{problema}</TestoErrore>}
    </div>
  )
}
