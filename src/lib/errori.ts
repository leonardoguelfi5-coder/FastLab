const MSG_OFFLINE = 'Nessuna connessione. Riprova quando torna la rete.'
const MSG_SERVER = 'Il server non risponde. Se l\'app non è stata usata per più di una settimana il database potrebbe essere in pausa: riattivalo dal pannello Supabase (vedi README).'
const MSG_SESSIONE = 'Sessione scaduta: accedi di nuovo. I dati inseriti sono ancora nel modulo.'
const MSG_INVITO = 'Email o codice invito non validi. Controlla il messaggio di invito o chiedi all\'amministratore.'

/** Il messaggio con cui `caricaMisura` dice che la misura non c'è (cancellata, o non di questo utente). */
export const MISURA_NON_TROVATA = 'Misura non trovata.'

/** Un aggiornamento o un'eliminazione che non ha toccato nessuna riga: l'elemento non c'è più (o non è accessibile). */
export const ELEMENTO_NON_TROVATO = 'Elemento non trovato: forse è stato rimosso. Ricarica la pagina.'

/** `revocaInvito` non ha eliminato nulla: l'invito è stato usato (non si revoca più) o è già stato revocato. */
export const INVITO_GIA_USATO = 'Questo invito è già stato usato o non c\'è più: ricarica la pagina.'

/** `creaInvito` con un'email che ha già un invito (indice unico `inviti_email_unica`). */
export const EMAIL_GIA_INVITATA = 'Questa email è già stata invitata: trovi l\'invito nell\'elenco.'

/** Un nome già usato da un'altra voce non archiviata del catalogo (indice unico `catalogo_strumenti_nome_unico`). */
const MSG_NOME_NEL_CATALOGO = 'Nel catalogo c\'è già uno strumento con questo nome.'

/** Una lettura che dipende da chi è l'utente (es. `copieDiProprieta`) senza una sessione attiva. */
export const SENZA_SESSIONE = 'Sessione scaduta: accedi di nuovo.'

/** `caricaConfig` non trova l'esperimento: id non valido, eliminato o non accessibile. */
export const ESPERIMENTO_NON_TROVATO = 'Esperimento non trovato: forse è stato eliminato, o il link non è giusto.'

export function eEsperimentoNonTrovato(e: unknown): boolean {
  return e instanceof Error && e.message === ESPERIMENTO_NON_TROVATO
}

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
  if (messaggio.includes('ID_NON_MODIFICABILE')) {
    return 'L\'identificativo di una voce del catalogo non si può cambiare. Ricarica la pagina.'
  }
  if (messaggio.includes('ESPERIMENTO_NON_MODIFICABILE')) {
    return 'Questo elemento appartiene a un altro esperimento e non si può spostare. Ricarica la pagina.'
  }
  // I messaggi dell'app (già in italiano, già spiegati) passano così come sono.
  if ([ELEMENTO_NON_TROVATO, INVITO_GIA_USATO, EMAIL_GIA_INVITATA, ESPERIMENTO_NON_TROVATO, SENZA_SESSIONE].includes(messaggio)) {
    return messaggio
  }
  if (code === '23505' && messaggio.includes('catalogo_strumenti_nome_unico')) return MSG_NOME_NEL_CATALOGO
  // Un parametro sta in un solo strumento (indice unico su strumento_parametri.parametro_id).
  if (code === '23505' && messaggio.includes('strumento_parametri_un_solo_strumento')) {
    return 'Un parametro può stare in un solo strumento.'
  }
  if (code === '23505') return 'Esiste già un elemento con questo nome o etichetta.'
  // catalogo_id di uno strumento che punta a una voce che non c'è (crea_esperimento o salvaStrumento).
  if (code === '23503' && messaggio.includes('strumenti_catalogo_id_fkey')) {
    return 'Questo strumento del catalogo non esiste più: ricarica la pagina e riprova.'
  }
  if (code === '23503') return 'Questo elemento ha dati collegati e non può essere eliminato.'

  return messaggio === '' ? 'Errore imprevisto.' : `Errore imprevisto: ${messaggio}`
}
