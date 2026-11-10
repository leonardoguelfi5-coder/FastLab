import { toast } from 'sonner'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { messaggioErrore } from '@/lib/errori'

/** Per quanto tempo "Annulla" resta possibile prima che l'eliminazione parta davvero (spec §4). */
export const ATTESA_ANNULLA_MS = 5000

export interface RichiestaEliminazione {
  /** Identifica l'elemento (es. `nota:<id>`): finché l'eliminazione è in attesa, `inEliminazione(chiave)` è vero. */
  chiave: string
  /** Il testo del toast, es. "Nota eliminata.". */
  messaggio: string
  /** Il principio del messaggio se l'eliminazione vera fallisce, es. "La nota non è stata eliminata". */
  fallita: string
  /** Toglie subito l'elemento dalla vista (la cache dell'elenco). */
  nascondi: () => void
  /** Lo rimette com'era: se si annulla, o se l'eliminazione vera fallisce. */
  ripristina: () => void
  /** L'eliminazione vera, che parte solo allo scadere dell'attesa. */
  elimina: () => Promise<void>
  /** Dopo un'eliminazione riuscita (es. rileggere l'elenco). */
  dopo?: () => void
}

/** Le chiavi in attesa: chi rilegge l'elenco dal server non deve far riapparire ciò che sta per sparire. */
const inAttesa = new Set<string>()

/** Vero se quell'elemento è stato tolto dalla vista e l'eliminazione vera non è ancora finita (né annullata). */
export const inEliminazione = (chiave: string): boolean => inAttesa.has(chiave)

/** Chiudere la scheda del browser in questi 5 secondi lascerebbe l'elemento dov'è, senza dirlo: si chiede conferma. */
function avvisaSeInAttesa(evento: BeforeUnloadEvent) {
  if (inAttesa.size === 0) return
  evento.preventDefault()
  evento.returnValue = ''
}
let ascolta = false
function aggiornaAvviso() {
  if (inAttesa.size > 0 && !ascolta) window.addEventListener('beforeunload', avvisaSeInAttesa)
  else if (inAttesa.size === 0 && ascolta) window.removeEventListener('beforeunload', avvisaSeInAttesa)
  ascolta = inAttesa.size > 0
}

/**
 * Elimina con un "Annulla" vero. L'elemento sparisce subito dalla vista e compare il toast con "Annulla"; solo allo
 * scadere dei 5 secondi (o se il toast si chiude prima, perché lo si è scacciato) parte l'eliminazione vera.
 * Annullando, o se l'eliminazione fallisce, l'elemento torna com'era (e l'errore resta in vista finché non lo si
 * chiude). Prima della partenza non si è toccato nulla nel database.
 *
 * Esce dal ciclo di vita della pagina, di proposito: se si lascia la pagina nei 5 secondi, l'eliminazione avviene
 * comunque (il timer vive qui, non in un componente) e il toast con "Annulla" resta fino alla fine. Chiudere la
 * scheda del browser, invece, la interrompe: l'elemento resta com'è e il browser lo dice prima di chiudere.
 */
export function eliminaConAnnulla(r: RichiestaEliminazione): void {
  // Un secondo tocco mentre è già in attesa non deve crearne una seconda.
  if (inAttesa.has(r.chiave)) return
  inAttesa.add(r.chiave)
  aggiornaAvviso()
  r.nascondi()

  let stato: 'attesa' | 'annullata' | 'eseguita' = 'attesa'
  const finito = () => {
    inAttesa.delete(r.chiave)
    aggiornaAvviso()
  }

  const annulla = () => {
    if (stato !== 'attesa') return
    stato = 'annullata'
    clearTimeout(timer)
    r.ripristina()
    finito()
  }

  const esegui = async () => {
    if (stato !== 'attesa') return
    stato = 'eseguita'
    clearTimeout(timer)
    // Da qui "Annulla" non ha più senso: il toast se ne va (con il timer di sonner in pausa, ad esempio sopra il mouse, resterebbe).
    toast.dismiss(idToast)
    try {
      await r.elimina()
    } catch (e) {
      r.ripristina()
      finito()
      toast.error(`${r.fallita}: ${messaggioErrore(e)}`, OPZIONI_ERRORE_TARDIVO)
      return
    }
    finito()
    r.dopo?.()
  }

  // Il timer è il padrone dei 5 secondi (quello del toast si ferma, ad esempio, col mouse sopra); `annulla` ed
  // `esegui` lo leggono solo quando scattano, cioè dopo che è stato creato.
  const timer = setTimeout(() => void esegui(), ATTESA_ANNULLA_MS)
  const idToast = toast(r.messaggio, {
    duration: ATTESA_ANNULLA_MS,
    action: { label: 'Annulla', onClick: annulla },
    onDismiss: () => void esegui(),
    onAutoClose: () => void esegui(),
  })
}
