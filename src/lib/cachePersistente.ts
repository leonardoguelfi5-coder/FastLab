import { dehydrate, hydrate, type DehydratedState, type QueryClient, type QueryState } from '@tanstack/react-query'

/**
 * La copia delle letture sul telefono (Piano E, Task E7): con l'app aperta senza rete la configurazione, il giro di
 * oggi e le piante già lette si vedono subito, invece di un caricamento senza fine. È scritta a mano con `dehydrate` e
 * `hydrate` di React Query, nel localStorage, e vale solo per un ELENCO CHIUSO di letture (`CHIAVI_PERSISTENTI`).
 * Mai qui: chi ha dati e chi no (decidono Elimina e Archivia, una risposta vecchia non deve decidere), le misure per
 * strumento (Dataset, troppo grandi), foto e URL firmati, note, inviti, catalogo.
 *
 * - È legata all'utente e alla versione dell'app: un altro utente o una build nuova la scartano.
 * - Al massimo 2 MB (il localStorage serve anche alla coda d'invio e alle bozze, che contano di più): oltre si tolgono
 *   per prime le misure delle piante lette da più tempo.
 * - Ogni lettura vale 7 giorni da quando è arrivata dal server.
 * - I dati ripristinati restano quelli letti allora, e sono vecchi: si rileggono appena serve e c'è rete.
 * - Si cancella all'uscita e al cambio di utente (`svuotaCacheAlCambioUtente`).
 */

export const CHIAVE_CACHE = 'fastlab-cache:v1'

/** Il limite della copia, in caratteri del testo salvato (come conta il localStorage). */
export const LIMITE_CACHE = 2 * 1024 * 1024

/** Quanto vale una lettura salvata, da quando è arrivata dal server. */
export const VALIDITA_CACHE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Quanto restano in memoria le letture dell'elenco senza una pagina che le usa (il `gcTime` di React Query, di solito
 * 5 minuti). Senza, una pianta letta all'inizio del giro sparirebbe dalla memoria, e quindi anche dalla copia, prima
 * della fine: la copia è fatta di quello che c'è in memoria.
 */
export const DURATA_IN_MEMORIA_MS = 24 * 60 * 60 * 1000

/** Il ritardo della scrittura dopo l'ultimo cambio: un giro di misure non riscrive la copia a ogni risposta. */
const RITARDO_SCRITTURA_MS = 1_000

/**
 * L'elenco chiuso: elenco degli esperimenti, configurazione (solo la chiave esatta, non quelle sotto di lei), misure del
 * giorno, misure di una pianta, data dell'ultima misura di ogni strumento. Le forme sono quelle di `chiavi` in
 * `src/api/query.ts` (un test lo verifica): qui non si importa `query.ts` per non legare la copia alle pagine.
 */
export const CHIAVI_PERSISTENTI: ((chiave: readonly unknown[]) => boolean)[] = [
  k => k.length === 1 && k[0] === 'esperimenti',
  k => k.length === 2 && k[0] === 'config' && typeof k[1] === 'string' && k[1] !== '',
  k => k.length === 4 && k[0] === 'misure' && k[1] === 'giorno' && typeof k[2] === 'string' && typeof k[3] === 'string',
  k => k.length === 3 && k[0] === 'misure' && k[1] === 'pianta' && typeof k[2] === 'string' && k[2] !== '',
  k => k.length === 3 && k[0] === 'misure' && k[1] === 'ultime' && typeof k[2] === 'string' && k[2] !== '',
]

export const ePersistente = (chiave: readonly unknown[]): boolean => CHIAVI_PERSISTENTI.some(f => f(chiave))

const ePianta = (chiave: readonly unknown[]): boolean => chiave[0] === 'misure' && chiave[1] === 'pianta'
const eGiorno = (chiave: readonly unknown[]): boolean => chiave[0] === 'misure' && chiave[1] === 'giorno'

/** Una lettura salvata: chiave, hash della chiave (come lo calcola React Query), quando è arrivata e i dati. */
interface VoceSalvata { k: unknown[]; h: string; t: number; d: unknown }

interface CopiaSalvata { v: 1; utente: string; versione: string; salvataIl: number; query: VoceSalvata[] }

// Le mappe (le ultime misure per strumento sono una `Map`) non passano dal JSON da sole.
const MAPPA = '__mappa__'
function perJson(_chiave: string, valore: unknown): unknown {
  return valore instanceof Map ? { [MAPPA]: [...valore] } : valore
}
function daJson(_chiave: string, valore: unknown): unknown {
  if (typeof valore === 'object' && valore !== null && !Array.isArray(valore)) {
    const o = valore as Record<string, unknown>
    const chiavi = Object.keys(o)
    if (chiavi.length === 1 && chiavi[0] === MAPPA && Array.isArray(o[MAPPA])) return new Map(o[MAPPA] as [unknown, unknown][])
  }
  return valore
}

function togliCopia(): void {
  try { localStorage.removeItem(CHIAVE_CACHE) } catch { /* senza localStorage non c'è nulla da togliere */ }
}

/** Toglie la copia delle letture (uscita, cambio di utente, spazio che serve alla coda d'invio). Mai un'eccezione. */
export function cancellaCache(): void {
  togliCopia()
}

/**
 * Scrive la copia delle letture dell'elenco chiuso di `utente`. Oltre il limite toglie per prime le piante lette da più
 * tempo, poi i giorni; se non basta ancora non scrive nulla (meglio nessuna copia che una configurazione a metà). Mai
 * un'eccezione: senza spazio la copia si toglie e si va avanti (si legge dal server come prima).
 */
export function salvaCache(queryClient: QueryClient, utente: string, versione: string, adesso: number): void {
  const stato = dehydrate(queryClient, {
    shouldDehydrateQuery: q => q.state.status === 'success' && q.state.data !== undefined && ePersistente(q.queryKey) &&
      adesso - q.state.dataUpdatedAt <= VALIDITA_CACHE_MS,
  })
  const voci = stato.queries.map(q => {
    const voce: VoceSalvata = { k: [...q.queryKey], h: q.queryHash, t: q.state.dataUpdatedAt, d: q.state.data }
    return { voce, testo: JSON.stringify(voce, perJson) }
  })
  const testa = JSON.stringify({ v: 1, utente, versione, salvataIl: adesso })
  let totale = testa.length + 16 + voci.reduce((s, x) => s + x.testo.length + 1, 0)

  // Le prime da togliere: le piante lette da più tempo, poi i giorni letti da più tempo.
  const daTogliere = [
    ...voci.filter(x => ePianta(x.voce.k)).sort((a, b) => a.voce.t - b.voce.t),
    ...voci.filter(x => eGiorno(x.voce.k)).sort((a, b) => a.voce.t - b.voce.t),
  ]
  const tolte = new Set<(typeof voci)[number]>()
  for (const x of daTogliere) {
    if (totale <= LIMITE_CACHE) break
    tolte.add(x)
    totale -= x.testo.length + 1
  }
  if (totale > LIMITE_CACHE) {
    console.warn('Le letture non stanno nello spazio della copia sul telefono: non si salvano.')
    togliCopia()
    return
  }
  const testo = `${testa.slice(0, -1)},"query":[${voci.filter(x => !tolte.has(x)).map(x => x.testo).join(',')}]}`
  try {
    localStorage.setItem(CHIAVE_CACHE, testo)
  } catch (e) {
    console.warn('La copia delle letture non si salva sul telefono.', e)
    togliCopia()
  }
}

const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function leggiCopia(): CopiaSalvata | null {
  let testo: string | null
  try { testo = localStorage.getItem(CHIAVE_CACHE) } catch { return null }
  if (testo === null) return null
  let copia: unknown
  try { copia = JSON.parse(testo, daJson) } catch { copia = null }
  if (!eOggetto(copia) || copia.v !== 1 || typeof copia.utente !== 'string' || typeof copia.versione !== 'string' ||
    typeof copia.salvataIl !== 'number' || !Array.isArray(copia.query)) {
    console.warn('Copia delle letture illeggibile: la si ignora.')
    togliCopia()
    return null
  }
  return copia as unknown as CopiaSalvata
}

/** Lo stato di una lettura ripristinata: riuscita, ferma, già vecchia (si rilegge appena una pagina la usa). */
function statoRipristinato(voce: VoceSalvata): QueryState {
  return {
    data: voce.d,
    dataUpdateCount: 1,
    dataUpdatedAt: voce.t,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: true,
    status: 'success',
    fetchStatus: 'idle',
  }
}

/**
 * Rimette in memoria la copia delle letture, se è dello stesso utente e della stessa versione dell'app e non è
 * scaduta (altrimenti la toglie). Va chiamata all'avvio, prima del primo disegno. Restituisce quando è stata letta la
 * più vecchia delle letture ripristinate, o `null` se non c'era nulla da ripristinare. Mai un'eccezione.
 */
export function ripristinaCache(queryClient: QueryClient, utente: string, versione: string, adesso: number): { letteIl: number } | null {
  const copia = leggiCopia()
  if (!copia) return null
  if (copia.utente !== utente || copia.versione !== versione) {
    togliCopia()
    return null
  }
  const valide = copia.query.filter((v): v is VoceSalvata =>
    eOggetto(v) && Array.isArray(v.k) && ePersistente(v.k) && typeof v.h === 'string' && typeof v.t === 'number' &&
    v.d !== undefined && adesso - v.t <= VALIDITA_CACHE_MS && v.t <= adesso + VALIDITA_CACHE_MS)
  if (valide.length === 0) {
    togliCopia()
    return null
  }
  const stato: DehydratedState = {
    mutations: [],
    queries: valide.map(v => ({ queryKey: v.k, queryHash: v.h, state: statoRipristinato(v), dehydratedAt: v.t })),
  }
  try {
    hydrate(queryClient, stato, { defaultOptions: { queries: { gcTime: DURATA_IN_MEMORIA_MS } } })
  } catch (e) {
    console.warn('La copia delle letture non si ripristina.', e)
    queryClient.clear()
    togliCopia()
    return null
  }
  return { letteIl: Math.min(...valide.map(v => v.t)) }
}

/**
 * Tiene aggiornata la copia: la riscrive 1 s dopo l'ultimo cambio di una lettura dell'elenco e subito quando l'app va
 * in secondo piano (il telefono che si blocca, un'altra app). `utente` dice chi ha la sessione adesso: senza nessuno
 * non si scrive. Restituisce la funzione che ferma tutto.
 */
export function avviaCachePersistente(queryClient: QueryClient, opzioni: { utente: () => string | null; versione: string }): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const scrivi = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const utente = opzioni.utente()
    if (utente) salvaCache(queryClient, utente, opzioni.versione, Date.now())
  }
  const programma = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(scrivi, RITARDO_SCRITTURA_MS)
  }
  const stacca = queryClient.getQueryCache().subscribe(evento => {
    if ((evento.type === 'updated' || evento.type === 'added' || evento.type === 'removed') && ePersistente(evento.query.queryKey)) programma()
  })
  // Solo se c'è una scrittura in attesa: senza cambi la copia è già quella giusta.
  const subitoSeInAttesa = () => { if (timer !== null) scrivi() }
  const allaVista = () => { if (document.visibilityState === 'hidden') subitoSeInAttesa() }
  document.addEventListener('visibilitychange', allaVista)
  window.addEventListener('pagehide', subitoSeInAttesa)
  return () => {
    stacca()
    document.removeEventListener('visibilitychange', allaVista)
    window.removeEventListener('pagehide', subitoSeInAttesa)
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
}
