/**
 * Dopo un avviso il pulsante diventa "Salva comunque" nello stesso punto: un secondo tocco troppo vicino al primo
 * (un doppio tocco) non è una conferma, è lo stesso gesto. Lo si ignora. Vale per ogni modulo di misura.
 */
export const ATTESA_CONFERMA_MS = 500

/** L'istante di un tocco, in millisecondi (si legge solo nei gestori dei tocchi, mai disegnando). */
export const istante = (): number => Date.now()
