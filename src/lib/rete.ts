/**
 * Il limite di tempo di ogni richiesta a Supabase (Piano E, Task E5). Con una sola tacca in serra una richiesta può
 * restare appesa per minuti senza che il browser la dia per fallita: il modulo resterebbe su "Salvataggio…" senza
 * dire nulla. Con il limite, dopo 12 s la richiesta si interrompe e l'utente legge "Rete debole: riprova.".
 * Un salvataggio interrotto può essere arrivato lo stesso al server: si ripete senza danni perché le misure, le note
 * e le foto si scrivono con l'upsert per id (Ruling del Piano 1).
 */

/** Database, RPC e autenticazione: risposte piccole, 12 s bastano anche con poco segnale. */
export const LIMITE_RICHIESTA_MS = 12_000

/** Il caricamento di un file nello Storage: una foto da 350 KB con una sola tacca supera di molto i 12 s. */
export const LIMITE_CARICAMENTO_MS = 90_000

/**
 * Una richiesta che non ha avuto risposta: entro il limite di tempo (`limite`) o perché la rete non l'ha portata
 * (`rete`, il `TypeError` del fetch). Il messaggio inizia con "Rete debole" e il nome è `ErroreRete`: PostgREST,
 * GoTrue e lo Storage ricopiano l'uno o l'altro nei loro errori, e da lì `messaggioErrore` lo riconosce.
 */
export class ErroreRete extends Error {
  readonly motivo: 'limite' | 'rete'

  constructor(motivo: 'limite' | 'rete', opzioni?: { cause?: unknown }) {
    super(motivo === 'limite' ? 'Rete debole: nessuna risposta entro il limite di tempo.' : 'Rete debole: la richiesta non è arrivata.', opzioni)
    this.name = 'ErroreRete'
    this.motivo = motivo
  }
}

/** Il metodo della richiesta: quello delle opzioni, poi quello della `Request`, altrimenti GET. */
function metodoDi(input: RequestInfo | URL, init?: RequestInit): string {
  const metodo = init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
  return metodo.toUpperCase()
}

function urlDi(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Il caricamento di un file è un POST (`upload`) o un PUT (`update`, `uploadToSignedUrl`) sotto `/storage/v1/object/`.
 * Le altre richieste allo Storage (elencare, firmare, togliere) restano a 12 s come il resto: rispondono senza file.
 */
function limiteDi(input: RequestInfo | URL, init?: RequestInit): number {
  const metodo = metodoDi(input, init)
  const caricamento = (metodo === 'POST' || metodo === 'PUT') && urlDi(input).includes('/storage/v1/object/')
  return caricamento ? LIMITE_CARICAMENTO_MS : LIMITE_RICHIESTA_MS
}

/**
 * Un segnale che si interrompe quando si interrompe uno dei due, e la funzione che stacca gli ascolti. Con
 * `AbortSignal.any` ci pensa il browser; dove manca (Safari prima della 17.4) lo si fa a mano con un `AbortController`
 * che riprende il motivo del primo che si interrompe.
 */
function unisci(delChiamante: AbortSignal, delLimite: AbortSignal): { segnale: AbortSignal; stacca: () => void } {
  if (typeof AbortSignal.any === 'function') return { segnale: AbortSignal.any([delChiamante, delLimite]), stacca: () => {} }
  const unito = new AbortController()
  const segnali = [delChiamante, delLimite]
  const giaInterrotto = segnali.find(s => s.aborted)
  if (giaInterrotto) {
    unito.abort(giaInterrotto.reason)
    return { segnale: unito.signal, stacca: () => {} }
  }
  const ascolti = segnali.map(s => {
    const ascolto = () => unito.abort(s.reason)
    s.addEventListener('abort', ascolto, { once: true })
    return () => s.removeEventListener('abort', ascolto)
  })
  return { segnale: unito.signal, stacca: () => { for (const togli of ascolti) togli() } }
}

/**
 * Il `fetch` del client Supabase (`global.fetch`): lo stesso fetch del browser, con il limite di tempo. Il limite
 * vale fino alla risposta del server (lo stato e le intestazioni): le risposte di database, RPC e autenticazione sono
 * piccole e il corpo arriva insieme.
 * - Un annullamento chiesto dal chiamante resta il suo `AbortError` (non è la rete: nessun messaggio "Rete debole").
 * - Il limite scaduto diventa `ErroreRete('limite')`, un errore di rete del browser (`TypeError`) `ErroreRete('rete')`.
 * - Il timer e gli ascolti si liberano sempre, comunque finisca.
 */
export async function fetchConLimite(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const delChiamante = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null)
  const limite = new AbortController()
  let scaduto = false
  const timer = setTimeout(() => {
    scaduto = true
    limite.abort()
  }, limiteDi(input, init))
  const { segnale, stacca } = delChiamante ? unisci(delChiamante, limite.signal) : { segnale: limite.signal, stacca: () => {} }

  try {
    return await fetch(input, { ...init, signal: segnale })
  } catch (e) {
    // Prima il chiamante: se ha annullato lui, anche a limite scaduto nello stesso istante, l'errore è il suo.
    if (delChiamante?.aborted) throw e
    if (scaduto) throw new ErroreRete('limite', { cause: e })
    if (e instanceof TypeError) throw new ErroreRete('rete', { cause: e })
    throw e
  } finally {
    clearTimeout(timer)
    stacca()
  }
}
