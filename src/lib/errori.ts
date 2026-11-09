import { ErroreRete } from './rete'

const MSG_OFFLINE = 'Nessuna connessione. Riprova quando torna la rete.'
/** Una richiesta che non è arrivata o non ha avuto risposta entro il limite di tempo (vedi `fetchConLimite`). */
const MSG_RETE = 'Rete debole: riprova.'
/** Solo per una risposta 5xx del server senza codice di PostgREST: il segno più probabile di un database in pausa. */
const MSG_SERVER = 'Il server non risponde. Se l\'app non è stata usata per più di una settimana il database potrebbe essere in pausa: riattivalo dal pannello Supabase (vedi README).'
const MSG_SESSIONE = 'Sessione scaduta: accedi di nuovo. I dati inseriti sono ancora nel modulo.'
const MSG_INVITO = 'Email o codice invito non validi. Controlla il messaggio di invito o chiedi all\'amministratore.'
/** Un 42501 del database: il ruolo nell'esperimento non permette questa scrittura (Piano E, Task E9). */
const MSG_PERMESSO = 'Non hai il permesso per questa modifica: chiedi al proprietario dell\'esperimento.'

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

/** Un nome già usato da un altro export salvato dello stesso utente nello stesso esperimento (indice `export_salvati_nome_unico`). */
const MSG_NOME_EXPORT = 'Hai già un export salvato con questo nome: scegline un altro o sostituisci quello.'

/** Il salvataggio di un export è stato rifiutato perché il nome c'è già (la pagina chiede se sostituire). */
export function eNomeExportGiaUsato(e: unknown): boolean {
  const { code, messaggio } = leggi(e)
  return code === '23505' && messaggio.includes('export_salvati_nome_unico')
}

/** Il salvataggio di una voce è stato rifiutato perché il nome c'è già nel catalogo (si risolve rinominando). */
export function eNomeGiaNelCatalogo(e: unknown): boolean {
  return messaggioErrore(e) === MSG_NOME_NEL_CATALOGO
}

/** Una foto che il browser non sa aprire (formato non supportato, file rovinato). */
export const FOTO_NON_LEGGIBILE = 'Non riesco ad aprire questa foto: prova con un\'altra o con una foto in formato JPEG.'

/** Una foto che il browser non riesce a decodificare ed è molto grande (oltre 15 MB): di solito è la memoria del telefono. */
export const FOTO_TROPPO_GRANDE = 'Foto troppo grande da elaborare sul telefono: scattala con una risoluzione più bassa.'

/** `eliminaEsperimento` non è riuscito a togliere i file delle foto dallo Storage: l'esperimento è rimasto com'era. */
export const FOTO_ESPERIMENTO_NON_RIMOSSE =
  'Non sono riuscito a eliminare le foto dell\'esperimento, quindi l\'esperimento non è stato eliminato. Riprova.'

/**
 * Uno strumento che si stava eliminando ha ricevuto misure nel frattempo: il database rifiuta (23503 sul vincolo
 * `misure_strumento_id_esperimento_id_fkey`) e resta solo l'archiviazione.
 */
export const STRUMENTO_CON_MISURE_ARRIVATE = 'Nel frattempo sono arrivate misure di questo strumento: si può solo archiviare.'

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

/**
 * Un errore il cui messaggio è già in italiano e spiegato (archivio delle foto: «Una foto non si è scaricata…»):
 * `messaggioErrore` lo mostra così com'è, senza il prefisso «Errore imprevisto».
 */
export class ErroreApp extends Error {
  constructor(messaggio: string) {
    super(messaggio)
    this.name = 'ErroreApp'
  }
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

  // Il fetch del browser che non porta la richiesta, o `ErroreRete` (anche ricopiato nel messaggio da PostgREST,
  // GoTrue o lo Storage, che ne perdono la classe): è la rete, non il server. Il database in pausa si riconosce dallo
  // stato 5xx della risposta, che con la rete debole non arriva.
  if (e instanceof ErroreRete || /ErroreRete|Rete debole|Failed to fetch|NetworkError|Load failed/.test(messaggio)) return MSG_RETE
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
  // Persone (Piano E, Task E9): i rifiuti di aggiungi_membro e togli_membro. SOLO_PROPRIETARIO ha il codice 42501:
  // va prima del 42501 generico.
  if (messaggio.includes('SOLO_PROPRIETARIO')) return 'Solo il proprietario dell\'esperimento aggiunge, toglie o cambia il ruolo delle persone.'
  if (messaggio.includes('UTENTE_NON_TROVATO')) return 'Nessun utente registrato con questa email: chiedi all\'amministratore di invitarlo.'
  if (messaggio.includes('RUOLO_NON_VALIDO')) return 'Ruolo non valido: scegli Proprietario, Rilevatore o Lettore.'
  if (messaggio.includes('ULTIMO_PROPRIETARIO')) {
    return 'L\'esperimento deve avere almeno un proprietario: prima rendi proprietario un\'altra persona.'
  }
  // Dopo i messaggi riconosciuti (GoTrue dà "Database error saving new user" con HTTP 500): un 5xx senza codice è il
  // server che non risponde, il segno più probabile del database in pausa.
  if (status !== undefined && status >= 500 && status <= 599 && (code === undefined || code === '')) return MSG_SERVER
  // PostgREST che risponde ma non raggiunge il database (503 e 504): come sopra, il database fermo o in pausa.
  if (code !== undefined && /^PGRST00[0-3]$/.test(code)) return MSG_SERVER
  // I messaggi dell'app (già in italiano, già spiegati) passano così come sono.
  if (e instanceof ErroreApp) return messaggio
  if ([ELEMENTO_NON_TROVATO, INVITO_GIA_USATO, EMAIL_GIA_INVITATA, ESPERIMENTO_NON_TROVATO, SENZA_SESSIONE,
    FOTO_NON_LEGGIBILE, FOTO_TROPPO_GRANDE, FOTO_ESPERIMENTO_NON_RIMOSSE].includes(messaggio)) {
    return messaggio
  }
  if (code === '23505' && messaggio.includes('catalogo_strumenti_nome_unico')) return MSG_NOME_NEL_CATALOGO
  // Un parametro sta in un solo strumento (indice unico su strumento_parametri.parametro_id).
  if (code === '23505' && messaggio.includes('strumento_parametri_un_solo_strumento')) {
    return 'Un parametro può stare in un solo strumento.'
  }
  // Una sola tabella fenologica per esperimento, anche archiviata (indice unico parziale su strumenti).
  if (code === '23505' && messaggio.includes('strumenti_un_fenologico')) return 'C\'è già una tabella fenologica in questo esperimento.'
  if (eNomeExportGiaUsato(e)) return MSG_NOME_EXPORT
  // Il database rifiuta scelte che la pagina non dovrebbe mai mandare (check `export_salvati_scelte_valide`) e un nome vuoto o oltre 80 caratteri.
  if (code === '23514' && messaggio.includes('export_salvati_scelte_valide')) {
    return 'Le scelte di questo export non sono valide: controlla strumenti, piante, periodo e fogli, poi riprova.'
  }
  if (code === '23514' && messaggio.includes('export_salvati_nome_check')) return 'Il nome dell\'export deve avere da 1 a 80 caratteri.'
  if (code === '23505') return 'Esiste già un elemento con questo nome o etichetta.'
  // catalogo_id di uno strumento che punta a una voce che non c'è (crea_esperimento o salvaStrumento).
  if (code === '23503' && messaggio.includes('strumenti_catalogo_id_fkey')) {
    return 'Questo strumento del catalogo non esiste più: ricarica la pagina e riprova.'
  }
  if (code === '23503' && messaggio.includes('misure_strumento_id_esperimento_id_fkey')) return STRUMENTO_CON_MISURE_ARRIVATE
  if (code === '23503') return 'Questo elemento ha dati collegati e non può essere eliminato.'
  // La RLS o un privilegio mancante: il ruolo non permette la modifica (un 42501 con 401 è la sessione, vedi sopra).
  if (code === '42501') return MSG_PERMESSO

  return messaggio === '' ? 'Errore imprevisto.' : `Errore imprevisto: ${messaggio}`
}
