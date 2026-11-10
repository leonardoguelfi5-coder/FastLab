import { riassuntoParametro } from '@/components/config/riassunti'
import type { Parametro, Strumento } from '@/domain/tipi'
import { ElencoArchiviati } from './ElencoArchiviati'

interface ParametriArchiviatiProps {
  archiviati: Parametro[]
  /** Gli strumenti dell'esperimento (archiviati compresi): di ogni valore si dice a quale appartiene. */
  strumenti: Strumento[]
  inCorso: boolean
  onRipristina: (p: Parametro) => void
}

/** I valori archiviati (i parametri), con lo strumento a cui appartengono: da lì si capisce cosa sono. */
export function ParametriArchiviati({ archiviati, strumenti, inCorso, onRipristina }: ParametriArchiviatiProps) {
  const di = (p: Parametro) => strumenti.find(s => s.parametri.some(pp => pp.parametro_id === p.id))
  return (
    <ElencoArchiviati
      titolo="Valori archiviati"
      spiegazione="Non compaiono nei moduli degli strumenti; i loro dati restano nella storia delle piante e nell'export."
      voci={archiviati.map(p => ({
        id: p.id,
        nome: p.nome,
        dettaglio: [riassuntoParametro(p), di(p)?.nome].filter(Boolean).join(' · '),
      }))}
      inCorso={inCorso}
      onRipristina={id => { const p = archiviati.find(x => x.id === id); if (p) onRipristina(p) }}
    />
  )
}
