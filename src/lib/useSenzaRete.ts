import { useSyncExternalStore } from 'react'

/**
 * Vero quando il telefono dice di essere senza rete (`navigator.onLine` falso: modalità aereo, nessun segnale). Si
 * aggiorna con gli eventi `online` e `offline`. Il contrario non è sicuro (una tacca sola dice "in rete" e non porta
 * nulla): serve per dire perché un dato non arriva, mai per decidere di non provare.
 */
export function useSenzaRete(): boolean {
  return useSyncExternalStore(iscriviti, senzaRete, () => false)
}

function senzaRete(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function iscriviti(avvisa: () => void): () => void {
  window.addEventListener('online', avvisa)
  window.addEventListener('offline', avvisa)
  return () => {
    window.removeEventListener('online', avvisa)
    window.removeEventListener('offline', avvisa)
  }
}
