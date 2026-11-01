/**
 * Le opzioni del toast con l'esito negativo di un'operazione finita dopo l'uscita dalla pagina (o fuori dalla
 * vista): resta finché chi legge non lo chiude (con il telefono in tasca un toast che sparisce da solo non lo
 * legge nessuno).
 */
export const OPZIONI_ERRORE_TARDIVO = { duration: Infinity, action: { label: 'Chiudi', onClick: () => {} } }
