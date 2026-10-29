import { eVuoto, formattaValore } from '@/domain/misure'
import type { Misura, Parametro } from '@/domain/tipi'

export interface Voce { id: string; nome: string; valore: string }

/**
 * I valori di una misura come si leggono in una riga ("Temp aria 24,5 °C"): uno per parametro, nell'ordine dei
 * parametri, senza quelli vuoti. Un parametro archiviato porta " (archiviato)": il dato c'è ancora e va mostrato.
 * Una chiave che non corrisponde a nessun parametro non si mostra.
 */
export function vociMisura(m: Misura, parametri: Parametro[]): Voce[] {
  return parametri
    .filter(p => !eVuoto(p, m.valori[p.id]))
    .sort((a, b) => a.ordine - b.ordine)
    .map(p => ({
      id: p.id,
      nome: p.archiviato ? `${p.nome} (archiviato)` : p.nome,
      valore: formattaValore(p, m.valori[p.id]),
    }))
}
