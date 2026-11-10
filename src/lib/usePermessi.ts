import { useSessione } from '@/api/auth'
import { useRuolo, type StatoRuolo } from './useRuolo'

export interface Permessi extends StatoRuolo {
  /** Il ruolo si conosce (in memoria, dal database o dalla copia sul telefono). */
  ruoloNoto: boolean
  /** Può fare una misura, una nota, una foto: tutti tranne un lettore. Con il ruolo ignoto sì (vedi sotto). */
  puoMisurare: boolean
  /** Rilevatore o lettore: la configurazione, lo stato, l'archivio e l'eliminazione sono del proprietario. */
  soloProprietario: boolean
  /** Può correggere o eliminare una misura, una nota o una foto scritta da `creatoDa` (Decisione del 09/11). */
  puoCorreggere: (creatoDa: string | undefined) => boolean
}

/**
 * Che cosa mostrare a chi guarda, secondo il suo ruolo (Piano E, Task E10). L'interfaccia nasconde e dice a parole ciò
 * che il ruolo non permette; la guardia vera resta il database.
 * - Si nasconde solo per un ruolo NOTO. Se il ruolo non si conosce (si sta leggendo, o la lettura è fallita senza rete e
 *   senza copia sul telefono: `useRuolo` dà null) non si toglie niente, in particolare "Nuova misura": un giro in serra
 *   non va bloccato per un ruolo che non si è riusciti a leggere. Il database rifiuta ciò che non è permesso (42501).
 * - Il rilevatore corregge ed elimina solo le proprie cose (`creato_da` = lui); una voce senza autore (nata sul telefono,
 *   ancora in coda, o letta prima della migration 0016) è sua.
 */
export function usePermessi(espId: string | undefined): Permessi {
  const stato = useRuolo(espId)
  const { sessione } = useSessione()
  const io = sessione?.user.id
  const { ruolo } = stato

  return {
    ...stato,
    ruoloNoto: ruolo !== null,
    puoMisurare: ruolo !== 'lettore',
    soloProprietario: ruolo === 'rilevatore' || ruolo === 'lettore',
    puoCorreggere: creatoDa => {
      if (ruolo === 'lettore') return false
      if (ruolo === 'rilevatore') return creatoDa === undefined || creatoDa === io
      return true
    },
  }
}
