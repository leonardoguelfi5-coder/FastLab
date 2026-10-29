const MSG_OFFLINE = 'Nessuna connessione. Riprova quando torna la rete.'
const MSG_SERVER = 'Il server non risponde. Se l\'app non è stata usata per più di una settimana il database potrebbe essere in pausa: riattivalo dal pannello Supabase (vedi README).'
const MSG_SESSIONE = 'Sessione scaduta: accedi di nuovo. I dati inseriti sono ancora nel modulo.'
const MSG_INVITO = 'Email o codice invito non validi. Controlla il messaggio di invito o chiedi all\'amministratore.'

/** Il messaggio con cui `caricaMisura` dice che la misura non c'è (cancellata, o non di questo utente). */
export const MISURA_NON_TROVATA = 'Misura non trovata.'

/** Un aggiornamento o un'eliminazione che non ha toccato nessuna riga: l'elemento non c'è più (o non è accessibile). */
export const ELEMENTO_NON_TROVATO = 'Elemento non trovato: forse è stato rimosso. Ricarica la pagina.'

export function eMisuraNonTrovata(e: unknown): boolean {
  return e instanceof Error && e.message === MISURA_NON_TROVATA
}

/** Estrae campi comuni da errori di fetch, PostgREST e GoTrue (Error o oggetti semplici). */
function leggi(e: unknown): { messaggio: string; code?: string; status?: number } {
  if (typeof e === 'string') return { messaggio: e }
  if (typeof e !== 'object' || e === null) return { messaggio: '' }
  const o = e as { message?: unknown; code?: unknown; status?: unknown }
  return {
    messaggio: typeof o.message === 'string' ? o.message : '',
    code: typeof o.code === 'string' ? o.code : undefined,
    status: typeof o.status === 'number' ? o.status : undefined,
  }
}

/** Traduce un errore di rete, Supabase o database in un messaggio italiano per l'utente. */
export function messaggioErrore(e: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return MSG_OFFLINE

  const { messaggio, code, status } = leggi(e)

  if (/Failed to fetch|NetworkError|Load failed/.test(messaggio)) return MSG_SERVER
  if (code === 'PGRST301' || status === 401 || messaggio.includes('JWT expired')) return MSG_SESSIONE
  if (messaggio.includes('Invalid login credentials')) return 'Email o password errate.'
  if (messaggio.includes('Database error saving new user') || messaggio.includes('INVITO_MANCANTE')) return MSG_INVITO
  if (messaggio.includes('User already registered')) return 'Esiste già un account con questa email: accedi.'
  if (messaggio.includes('PARAMETRO_CON_DATI')) {
    return 'Questo parametro ha già dei dati: non si può eliminare né cambiarne il tipo. Puoi archiviarlo.'
  }
  if (messaggio.includes('PIANTA_CON_DATI')) {
    return 'Questa pianta ha già delle misure: il trattamento non si può cambiare. Etichetta e blocco sì.'
  }
  if (messaggio.includes('ESPERIMENTO_NON_MODIFICABILE')) {
    return 'Questo elemento appartiene a un altro esperimento e non si può spostare. Ricarica la pagina.'
  }
  if (messaggio === ELEMENTO_NON_TROVATO) return ELEMENTO_NON_TROVATO
  if (code === '23505') return 'Esiste già un elemento con questo nome o etichetta.'
  if (code === '23503') return 'Questo elemento ha dati collegati e non può essere eliminato.'

  return messaggio === '' ? 'Errore imprevisto.' : `Errore imprevisto: ${messaggio}`
}
