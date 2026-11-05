import type { Misura } from '@/domain/tipi'
import { CHIAVE_CACHE, cancellaCache } from '@/lib/cachePersistente'
import { nuovoId } from '@/lib/id'

/**
 * La coda d'invio delle misure (Piano E, Task E6). "Salva" e "Salva e vai" scrivono qui la misura, in modo sincrono
 * nel localStorage: un'app chiusa un attimo dopo non la perde. L'invio (`invio.ts`) la manda poi al server con l'upsert
 * per id, appena può: ripetere un invio è sicuro. La coda è per utente (una chiave per utente): chi accede dopo sullo
 * stesso telefono non vede e non invia le misure di un altro. Contiene solo salvataggi di misure.
 * Qui niente React: le pagine leggono la coda con `useSyncExternalStore` (`useCoda.ts`).
 */

/**
 * Una misura in attesa di arrivare al server.
 * - `stato`: `attesa` (da inviare, anche dopo un errore di rete), `invio` (sta partendo), `rifiutata` (il server ha
 *   detto no per sempre: si mostra con `errore` e non si ritenta).
 * - `revisione`: cambia a ogni `accoda`. L'invio toglie la voce solo se è ancora quella che ha mandato: una correzione
 *   fatta mentre partiva la versione di prima resta in coda e parte dopo.
 * - `forseSulServer`: la misura può essere già sul server (è la correzione di una misura salvata, o un invio è già
 *   partito una volta e forse è arrivato anche se la risposta no). Eliminarla dalla coda non basta: va tolta anche online.
 * - `etichetta` e `strumento`: per dire quale misura è ("Pianta #35 salvata ✓", "#35 · 💚 SPAD · 09:12") anche senza la
 *   configurazione in memoria.
 */
export interface VoceCoda {
  misura: Misura
  espId: string
  utente: string
  /** Istante ISO dell'accodamento: l'ordine della coda. */
  accodataIl: string
  tentativi: number
  /** Istante (ms) dal quale ritentare dopo un errore di passaggio; `null` = subito. */
  prossimoTentativo: number | null
  stato: 'attesa' | 'invio' | 'rifiutata'
  /** Il messaggio per l'utente: perché è rifiutata, o l'ultimo errore di un tentativo andato male. */
  errore: string | null
  revisione: string
  forseSulServer: boolean
  etichetta: string
  strumento: string
}

/** Quel che chi accoda sa della misura oltre ai valori. */
export interface DatiVoce {
  /** L'etichetta della pianta, senza "#". */
  etichetta: string
  /** Icona e nome dello strumento ("💚 SPAD"). */
  strumento: string
  /** La misura è la correzione di una misura già sul server. */
  sulServer: boolean
}

/** La coda non si può scrivere (localStorage assente o pieno): chi salva lo fa direttamente, come prima della coda. */
export class ErroreCoda extends Error {
  constructor(opzioni?: { cause?: unknown }) {
    super('La coda d\'invio non si può scrivere su questo telefono.', opzioni)
    this.name = 'ErroreCoda'
  }
}

export const PREFISSO_CODA = 'fastlab-coda:v1:'
export const chiaveCoda = (utente: string): string => PREFISSO_CODA + utente

const NESSUNA: VoceCoda[] = []
const STATI = new Set<VoceCoda['stato']>(['attesa', 'invio', 'rifiutata'])

const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const eTesto = (v: unknown): v is string => typeof v === 'string'

function misuraValida(m: unknown): m is Misura {
  return eOggetto(m) && eTesto(m.id) && eTesto(m.pianta_id) && eTesto(m.strumento_id) && eTesto(m.data_rilievo) &&
    eTesto(m.ora) && eOggetto(m.valori)
}

/** Una voce letta dal localStorage, o `null` se è rovinata (manca un campo che serve all'invio) o di un altro utente. */
function voceValida(v: unknown, utente: string): VoceCoda | null {
  if (!eOggetto(v) || !misuraValida(v.misura) || !eTesto(v.espId) || v.utente !== utente || !eTesto(v.revisione)) return null
  const stato = STATI.has(v.stato as VoceCoda['stato']) ? (v.stato as VoceCoda['stato']) : 'attesa'
  return {
    misura: v.misura,
    espId: v.espId,
    utente,
    accodataIl: eTesto(v.accodataIl) ? v.accodataIl : new Date(0).toISOString(),
    tentativi: typeof v.tentativi === 'number' && Number.isFinite(v.tentativi) ? v.tentativi : 0,
    prossimoTentativo: typeof v.prossimoTentativo === 'number' && Number.isFinite(v.prossimoTentativo) ? v.prossimoTentativo : null,
    stato,
    errore: eTesto(v.errore) ? v.errore : null,
    revisione: v.revisione,
    // Nel dubbio sì: eliminare online una misura che non c'è non fa danni, lasciarla sì.
    forseSulServer: v.forseSulServer !== false,
    etichetta: eTesto(v.etichetta) ? v.etichetta : '?',
    strumento: eTesto(v.strumento) ? v.strumento : '',
  }
}

function analizza(testo: string | null, utente: string): VoceCoda[] {
  if (testo === null) return NESSUNA
  let grezze: unknown
  try {
    grezze = JSON.parse(testo)
  } catch {
    console.warn('Coda d\'invio illeggibile: la si ignora.')
    return NESSUNA
  }
  if (!Array.isArray(grezze)) {
    console.warn('Coda d\'invio illeggibile: la si ignora.')
    return NESSUNA
  }
  const voci: VoceCoda[] = []
  for (const g of grezze) {
    const voce = voceValida(g, utente)
    if (voce) voci.push(voce)
    else console.warn('Una voce della coda d\'invio è rovinata e si scarta.', g)
  }
  return voci
}

/** L'ultima lettura per utente: lo stesso testo dà lo stesso elenco (lo vuole `useSyncExternalStore`). */
const letture = new Map<string, { testo: string | null; voci: VoceCoda[] }>()

function testoDi(utente: string): string | null {
  try { return localStorage.getItem(chiaveCoda(utente)) } catch { return null }
}

/** Le voci della coda di un utente, nell'ordine di accodamento. Mai un'eccezione: senza localStorage è vuota. */
export function vociDi(utente: string): VoceCoda[] {
  const testo = testoDi(utente)
  const letta = letture.get(utente)
  if (letta && letta.testo === testo) return letta.voci
  const voci = analizza(testo, utente)
  letture.set(utente, { testo, voci })
  return voci
}

// Un numero che il JSON non sa scrivere diventerebbe null, cioè un valore diverso da quello scritto: meglio non accodare.
function perJson(_chiave: string, v: unknown): unknown {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new ErroreCoda()
  return v
}

/** Scrive la coda; lancia se non si può (spazio finito, localStorage assente). */
function scrivi(utente: string, voci: VoceCoda[]): void {
  const testo = voci.length === 0 ? null : JSON.stringify(voci, perJson)
  if (testo === null) localStorage.removeItem(chiaveCoda(utente))
  else localStorage.setItem(chiaveCoda(utente), testo)
  letture.set(utente, { testo, voci })
  avvisa()
}

/**
 * Mette in coda il salvataggio di una misura. Lo stesso id sostituisce la voce che c'è (una correzione prima
 * dell'invio) al suo posto, da capo: stato `attesa`, nessun tentativo, revisione nuova. Lancia `ErroreCoda` se il
 * localStorage non si può scrivere: chi salva allora lo fa direttamente.
 */
export function accoda(utente: string, espId: string, misura: Misura, dati: DatiVoce, adesso: number = Date.now()): void {
  const voci = vociDi(utente)
  const prima = voci.find(v => v.misura.id === misura.id)
  const voce: VoceCoda = {
    misura,
    espId,
    utente,
    accodataIl: prima?.accodataIl ?? new Date(adesso).toISOString(),
    tentativi: 0,
    prossimoTentativo: null,
    stato: 'attesa',
    errore: null,
    revisione: nuovoId(),
    // Se c'era già una voce, vale quel che si sapeva di lei: una misura solo in coda resta tale anche corretta.
    forseSulServer: prima ? prima.forseSulServer : dati.sulServer,
    etichetta: dati.etichetta,
    strumento: dati.strumento,
  }
  const nuove = prima ? voci.map(v => (v === prima ? voce : v)) : [...voci, voce]
  try {
    scrivi(utente, nuove)
  } catch (e) {
    if (e instanceof ErroreCoda) throw e
    // Il localStorage è pieno: la copia delle letture (Piano E, Task E7) è solo una copia, la misura no. Si toglie
    // quella e si riprova una volta.
    if (!copiaDelleLetturePresente()) throw new ErroreCoda({ cause: e })
    cancellaCache()
    try {
      scrivi(utente, nuove)
    } catch (ancora) {
      throw ancora instanceof ErroreCoda ? ancora : new ErroreCoda({ cause: ancora })
    }
  }
}

function copiaDelleLetturePresente(): boolean {
  try { return localStorage.getItem(CHIAVE_CACHE) !== null } catch { return false }
}

/** Scrive una modifica fatta dall'invio; se il localStorage non la prende, la voce resta com'era (si ripeterà l'invio). */
function scriviSePuoi(utente: string, voci: VoceCoda[]): void {
  try {
    scrivi(utente, voci)
  } catch (e) {
    console.warn('La coda d\'invio non si aggiorna.', e)
  }
}

/**
 * Cambia la voce con quell'id solo se è ancora quella revisione (`null` dalla modifica la toglie). Falso se la voce
 * non c'è più o è stata sostituita nel frattempo.
 */
export function aggiornaVoce(utente: string, id: string, revisione: string, modifica: (v: VoceCoda) => VoceCoda | null): boolean {
  const voci = vociDi(utente)
  const voce = voci.find(v => v.misura.id === id)
  if (!voce || voce.revisione !== revisione) return false
  const nuova = modifica(voce)
  scriviSePuoi(utente, nuova === null ? voci.filter(v => v !== voce) : voci.map(v => (v === voce ? nuova : v)))
  return true
}

/**
 * Toglie dalla coda la misura con quell'id (scartata, o eliminata prima dell'invio). Una voce che sta partendo non si
 * tocca (`in_invio`): l'invio è già in viaggio, chi elimina aspetta che finisca.
 */
export function togli(utente: string, id: string): 'tolta' | 'in_invio' | 'assente' {
  const voci = vociDi(utente)
  const voce = voci.find(v => v.misura.id === id)
  if (!voce) return 'assente'
  if (voce.stato === 'invio') return 'in_invio'
  scriviSePuoi(utente, voci.filter(v => v !== voce))
  return 'tolta'
}

/** Rimette una voce tolta (un'eliminazione online non riuscita) al suo posto nell'ordine di accodamento. */
export function rimetti(voce: VoceCoda): void {
  const voci = vociDi(voce.utente).filter(v => v.misura.id !== voce.misura.id)
  const dopo = voci.findIndex(v => v.accodataIl > voce.accodataIl)
  const nuove = dopo === -1 ? [...voci, voce] : [...voci.slice(0, dopo), voce, ...voci.slice(dopo)]
  try {
    scrivi(voce.utente, nuove)
  } catch (e) {
    throw e instanceof ErroreCoda ? e : new ErroreCoda({ cause: e })
  }
}

/** Chi usa la coda adesso: l'utente della sessione (`impostaUtenteCoda`, dal cambio di sessione in `auth.ts`). */
let utenteAttivo: string | null = null

export function utenteCoda(): string | null {
  return utenteAttivo
}

/** L'utente con la sessione aperta, o `null` senza sessione: solo le sue voci si mostrano e si inviano. */
export function impostaUtenteCoda(utente: string | null): void {
  if (utente === utenteAttivo) return
  utenteAttivo = utente
  avvisa()
}

const ascoltatori = new Set<() => void>()

function avvisa(): void {
  for (const a of [...ascoltatori]) a()
}

/** Un'altra scheda ha cambiato una coda (o ha svuotato il localStorage: la chiave è `null`). */
function daAltraScheda(evento: StorageEvent): void {
  if (evento.key === null || evento.key.startsWith(PREFISSO_CODA)) avvisa()
}

/** Ascolta i cambi della coda (anche dalle altre schede) e dell'utente; restituisce la funzione che stacca l'ascolto. */
export function iscriviti(ascoltatore: () => void): () => void {
  if (ascoltatori.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', daAltraScheda)
  ascoltatori.add(ascoltatore)
  return () => {
    ascoltatori.delete(ascoltatore)
    if (ascoltatori.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', daAltraScheda)
  }
}
