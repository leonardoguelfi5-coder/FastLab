import type { Peso, SessionePesatura } from '@/domain/pesatura/tipi'

/** Le sessioni dalla più recente: per data, a parità per quando è stata creata (Pesatura e Taratura). */
export function dallaPiuRecente(a: SessionePesatura, b: SessionePesatura): number {
  return b.data.localeCompare(a.data) || (b.creato_il ?? '').localeCompare(a.creato_il ?? '') || a.id.localeCompare(b.id)
}

/** Che cosa può fare chi guarda una sessione (della Pesatura o della Taratura). Il database ha l'ultima parola. */
export interface PermessiSessione {
  /** Come `puo_gestire_sessione` del database: il proprietario, oppure chi ha creato la sessione. */
  puoGestire: boolean
  /**
   * Come `sessioni_pesatura_delete` (20261111000018): chi non è il proprietario non elimina una sessione con pesi
   * di altre persone, che sparirebbero con lei.
   */
  conPesiAltrui: boolean
}

export function permessiSessione(
  permessi: { puoMisurare: boolean; soloProprietario: boolean },
  utenteId: string | undefined,
  sessione: Pick<SessionePesatura, 'creato_da'>,
  pesi: Pick<Peso, 'creato_da'>[],
): PermessiSessione {
  return {
    puoGestire: permessi.puoMisurare && (!permessi.soloProprietario || (sessione.creato_da !== undefined && sessione.creato_da === utenteId)),
    conPesiAltrui: permessi.soloProprietario && pesi.some(p => p.creato_da !== utenteId),
  }
}
