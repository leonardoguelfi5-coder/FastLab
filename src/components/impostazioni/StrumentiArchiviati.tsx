import { useState } from 'react'
import { Conferma } from '@/components/Conferma'
import { Button } from '@/components/ui/button'
import { parametriDello } from '@/domain/bozza'
import type { Parametro, Strumento } from '@/domain/tipi'
import { spiegaConMisure, testoConfermaElimina } from '@/domain/conteggi'
import { NonEliminabile } from './EliminaStrumento'
import { ElencoArchiviati } from './ElencoArchiviati'
import type { MisureStrumento } from './useStrumenti'

interface StrumentiArchiviatiProps {
  archiviati: Strumento[]
  parametri: Parametro[]
  inCorso: boolean
  onRipristina: (s: Strumento) => void
  /** Che cosa si sa delle misure di uno strumento: decide che cosa fa "Elimina". */
  misure: (id: string) => MisureStrumento
  /** Dopo la conferma: elimina lo strumento senza misure, con i suoi valori. */
  onElimina: (s: Strumento) => void
}

/**
 * Gli strumenti archiviati: non sono più nella scelta in misura, le loro misure restano nella storia. Ognuno ha
 * "Ripristina" ed "Elimina": senza misure elimina (con conferma), con misure spiega quante sono e che restano; finché
 * non sono contate "Elimina" è spento (lo stato della lettura lo dice la sezione).
 */
export function StrumentiArchiviati({ archiviati, parametri, inCorso, onRipristina, misure, onElimina }: StrumentiArchiviatiProps) {
  const [chiede, setChiede] = useState<{ s: Strumento; cosa: 'elimina' | 'spiega' } | null>(null)
  const scelto = chiede?.s
  const misureScelto = scelto ? misure(scelto.id) : null

  function tocca(s: Strumento) {
    const m = misure(s.id)
    if (m.stato === 'nessuna') setChiede({ s, cosa: 'elimina' })
    else if (m.stato === 'alcune') setChiede({ s, cosa: 'spiega' })
  }

  return (
    <>
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
        altreAzioni={id => {
          const s = archiviati.find(x => x.id === id)
          const m = misure(id)
          return (
            <Button
              variant="destructive"
              size="sm"
              disabled={inCorso || m.stato === 'contando' || m.stato === 'errore'}
              onClick={() => { if (s) tocca(s) }}
            >
              Elimina
            </Button>
          )
        }}
      />
      <Conferma
        aperta={chiede?.cosa === 'elimina'}
        titolo={`Eliminare lo strumento «${scelto?.nome ?? ''}»?`}
        testo={scelto ? testoConfermaElimina(false, parametriDello(scelto, parametri).map(p => p.nome.trim())) : ''}
        annulla="Annulla"
        conferma="Elimina"
        onAnnulla={() => setChiede(null)}
        onConferma={() => { setChiede(null); if (scelto) onElimina(scelto) }}
      />
      <NonEliminabile
        aperta={chiede?.cosa === 'spiega' && misureScelto?.stato === 'alcune'}
        titolo={`Lo strumento «${scelto?.nome ?? ''}» non si può eliminare`}
        testo={misureScelto?.stato === 'alcune' ? spiegaConMisure(misureScelto.conteggio, 'archiviato') : ''}
        onChiudi={() => setChiede(null)}
      />
    </>
  )
}
