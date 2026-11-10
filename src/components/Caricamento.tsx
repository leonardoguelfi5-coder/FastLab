import { useSenzaRete } from '@/lib/useSenzaRete'

/** Senza rete, i dati che non sono nella copia sul telefono (Piano E, Task E7): non arriveranno finché non torna. */
export const SENZA_RETE_DATI = 'Senza rete: questi dati non sono ancora stati letti su questo telefono.'
export const SENZA_RETE_ESPERIMENTO = 'Senza rete: questo esperimento non è ancora stato letto su questo telefono.'
export const SENZA_RETE_PIANTA = 'Senza rete: questa pianta non è ancora stata letta su questo telefono.'
export const SENZA_RETE_GIORNO = 'Senza rete: le misure di questo giorno non sono ancora state lette su questo telefono.'

/** Una riga di stato al posto dei dati che mancano. */
export function RigaStato({ testo }: { testo: string }) {
  return <p role="status" className="text-grafite-tenue">{testo}</p>
}

/**
 * "Caricamento…" mentre i dati arrivano. Senza rete dice invece che non sono ancora stati letti su questo telefono
 * (`senzaRete`, di norma `SENZA_RETE_DATI`): un caricamento senza fine non dice nulla. Torna "Caricamento…" da solo
 * al ritorno della rete.
 */
export function Caricamento({ senzaRete = SENZA_RETE_DATI }: { senzaRete?: string }) {
  return <RigaStato testo={useSenzaRete() ? senzaRete : 'Caricamento…'} />
}
