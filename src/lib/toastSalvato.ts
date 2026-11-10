import { toast, type ExternalToast } from 'sonner'
import { cn } from '@/lib/utils'

/** Classe del toast "salvato": l'unico con il ✓ in registrato velato (index.css). */
export const CLASSE_SALVATO = 'toast-salvato'

/**
 * Esito di un salvataggio di dati (misure, configurazione dell'esperimento), es. "Pianta #35 salvata" o "Esperimento
 * creato.": il solo toast con il segno verde (DESIGN.md, regola del verde negato). Per ogni altra conferma
 * ("Messaggio copiato.", "Invito creato.") si usa `toast.success`, che resta neutro.
 */
export function toastSalvato(messaggio: string, opzioni: ExternalToast = {}) {
  return toast.success(messaggio, { ...opzioni, className: cn(CLASSE_SALVATO, opzioni.className) })
}
