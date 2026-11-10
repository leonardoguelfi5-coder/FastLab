import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarraAzioni } from '@/components/BarraAzioni'
import { Button } from '@/components/ui/button'
import type { Strumento } from '@/domain/tipi'
import { percorsoMisuraPianta } from '@/lib/percorsi'
import type { ArrivoScheda } from './ModuloOggi'
import { useAttesaArrivo } from './useAttesaArrivo'

/**
 * La scelta dello strumento, al posto del pulsante appena toccato. Un tocco troppo vicino all'apertura è il secondo di
 * un doppio tocco e cadrebbe sul primo strumento: non vale come scelta (`useAttesaArrivo`).
 */
function SceltaDelloStrumento({ strumenti, onScegli, onAnnulla }: {
  strumenti: Strumento[]; onScegli: (s: Strumento) => void; onAnnulla: () => void
}) {
  const toccoValido = useAttesaArrivo()
  return (
    <>
      <p className="text-label text-grafite-tenue">Con quale strumento?</p>
      <div className="flex flex-wrap gap-2">
        {strumenti.map(s => (
          <Button key={s.id} variant="outline" size="lg" className="grow" onClick={() => { if (toccoValido()) onScegli(s) }}>
            {s.icona && <span aria-hidden>{s.icona}</span>}
            {s.nome}
          </Button>
        ))}
      </div>
      <Button variant="ghost" onClick={onAnnulla}>Annulla</Button>
    </>
  )
}

interface MisuraQuestaPiantaProps {
  espId: string
  piantaId: string
  /** Gli strumenti attivi, nel loro ordine (almeno uno). */
  strumenti: Strumento[]
}

/**
 * L'azione principale della scheda: "Misura questa pianta" chiede con quale strumento (se ce n'è uno solo parte
 * subito) e porta alla misura di quella pianta (`daScheda`: salvando si torna qui). Lì, se la pianta ha già una misura di oggi, l'app chiede se correggerla
 * o aggiungerne una nuova: la scheda non misura, apre solo la strada.
 */
export function MisuraQuestaPianta({ espId, piantaId, strumenti }: MisuraQuestaPiantaProps) {
  const navigate = useNavigate()
  const [sceglie, setSceglie] = useState(false)
  // Le misure della pianta sono già in cache: il modulo compare subito, e il suo "Salva" sta dove c'era il tocco
  // appena fatto. Con `primoCampo` il modulo sa di essere appena arrivato: un tocco immediato è il secondo di un
  // doppio tocco e non salva (con valori mantenuti salverebbe una misura che chi rileva non ha guardato).
  const vai = (s: Strumento) => {
    const arrivo: ArrivoScheda = { primoCampo: true, daScheda: true }
    navigate(percorsoMisuraPianta(espId, s.id, piantaId), { state: arrivo })
  }

  return (
    <BarraAzioni>
      {sceglie ? (
        <SceltaDelloStrumento strumenti={strumenti} onScegli={vai} onAnnulla={() => setSceglie(false)} />
      ) : (
        <Button size="lg" className="h-14 w-full" onClick={() => (strumenti.length === 1 ? vai(strumenti[0]) : setSceglie(true))}>
          Misura questa pianta
        </Button>
      )}
    </BarraAzioni>
  )
}
