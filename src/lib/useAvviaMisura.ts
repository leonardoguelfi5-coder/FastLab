import { useNavigate } from 'react-router-dom'
import type { RigaStrumento } from '@/domain/giro'
import { percorsoFineGiro, percorsoMisuraPianta } from '@/lib/percorsi'
import { useCampoStore } from '@/store/campo'

/**
 * Fa partire la misura di uno strumento: lo ricorda come ultimo scelto (la home ne mostra il giro in corso) e porta
 * alla prima pianta da misurare, o alla fine del giro se non ne restano. Comune a "Nuova misura" e a Oggi.
 */
export function useAvviaMisura(espId: string): (riga: RigaStrumento) => void {
  const navigate = useNavigate()
  const setStrumento = useCampoStore(s => s.setStrumento)

  return ({ strumento, prossima }) => {
    setStrumento(espId, strumento.id)
    navigate(prossima ? percorsoMisuraPianta(espId, strumento.id, prossima.id) : percorsoFineGiro(espId, strumento.id))
  }
}
