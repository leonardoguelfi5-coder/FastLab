import { useCallback, useEffect, useRef } from 'react'
import { ATTESA_CONFERMA_MS, istante } from './salvataggio'

/**
 * Per i pulsanti che compaiono dopo un tocco, dove c'era quello appena toccato ("Salva e termina", "Salva e vai",
 * "Vai alle mancanti"): un tocco entro `ATTESA_CONFERMA_MS` dal montaggio è il secondo di un doppio tocco, non una
 * scelta. Restituisce una funzione da chiamare nel gestore del tocco: vero se il tocco vale.
 */
export function useAttesaArrivo(): () => boolean {
  const apertoAlle = useRef<number | null>(null)

  useEffect(() => {
    apertoAlle.current = istante()
  }, [])

  return useCallback(() => apertoAlle.current === null || istante() - apertoAlle.current >= ATTESA_CONFERMA_MS, [])
}
