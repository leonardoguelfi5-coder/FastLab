/**
 * Dopo un avviso il pulsante diventa "Salva comunque" nello stesso punto: un secondo tocco troppo vicino al primo
 * (un doppio tocco) non è una conferma, è lo stesso gesto. Lo si ignora. Vale per ogni modulo di misura.
 */
export const ATTESA_CONFERMA_MS = 500

/** L'istante di un tocco, in millisecondi (si legge solo nei gestori dei tocchi, mai disegnando). */
export const istante = (): number => Date.now()

/**
 * Le opzioni del toast con l'esito negativo di un salvataggio finito dopo l'uscita dalla scheda: resta finché chi
 * rileva non lo chiude (con il telefono in tasca un toast che sparisce da solo non lo legge nessuno).
 */
export const OPZIONI_ERRORE_TARDIVO = { duration: Infinity, action: { label: 'Chiudi', onClick: () => {} } }
