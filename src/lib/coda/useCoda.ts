import { useMemo, useSyncExternalStore } from 'react'
import { iscriviti, utenteCoda, vociDi, type VoceCoda } from './codaMisure'

const NESSUNA: VoceCoda[] = []

function vociCorrenti(): VoceCoda[] {
  const utente = utenteCoda()
  return utente ? vociDi(utente) : NESSUNA
}

/** Le voci in coda dell'utente con la sessione (nessuna senza sessione); si aggiorna a ogni cambio, anche da altre schede. */
export function useVociCoda(): VoceCoda[] {
  return useSyncExternalStore(iscriviti, vociCorrenti, vociCorrenti)
}

/** Lo stato in coda di ogni misura che c'è, per id: le righe lo dicono ("da inviare", "non inviata"). */
export function useStatiInCoda(): ReadonlyMap<string, VoceCoda['stato']> {
  const voci = useVociCoda()
  return useMemo(() => new Map(voci.map(v => [v.misura.id, v.stato])), [voci])
}
