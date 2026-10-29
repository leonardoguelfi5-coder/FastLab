import { parametriDello } from '@/domain/bozza'
import type { Parametro, Strumento } from '@/domain/tipi'
import { ElencoArchiviati } from './ElencoArchiviati'

interface StrumentiArchiviatiProps {
  archiviati: Strumento[]
  parametri: Parametro[]
  inCorso: boolean
  onRipristina: (s: Strumento) => void
}

/** Gli strumenti archiviati: non sono più nella scelta in misura, le loro misure restano nella storia. */
export function StrumentiArchiviati({ archiviati, parametri, inCorso, onRipristina }: StrumentiArchiviatiProps) {
  return (
    <ElencoArchiviati
      titolo="Strumenti archiviati"
      spiegazione="Non compaiono nella scelta in misura; le loro misure restano nella storia delle piante e nell'export."
      voci={archiviati.map(s => ({
        id: s.id,
        nome: [s.icona, s.nome].filter(Boolean).join(' '),
        dettaglio: parametriDello(s, parametri).map(p => p.nome.trim()).join(' · ') || 'Nessun valore',
      }))}
      inCorso={inCorso}
      onRipristina={id => { const s = archiviati.find(x => x.id === id); if (s) onRipristina(s) }}
    />
  )
}
