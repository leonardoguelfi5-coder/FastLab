import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { salvaMisura } from '@/api/misure'
import { chiavi } from '@/api/query'
import type { Misura } from '@/domain/tipi'
import { messaggioErrore } from '@/lib/errori'
import { ErroreRete } from '@/lib/rete'
import { OPZIONI_ERRORE_TARDIVO } from '@/lib/toastErrore'
import { toastSalvato } from '@/lib/toastSalvato'
import { aggiornaVoce, iscriviti, utenteCoda, vociDi, type VoceCoda } from './codaMisure'
import { perOraCrescente, piuRecentiPrima } from './sovrapponi'

/**
 * L'invio della coda delle misure (Piano E, Task E6): una voce alla volta, nell'ordine, con l'upsert per id
 * (`salvaMisura`): ripetere un invio arrivato a metà è sicuro. Il verde ("Pianta #35 salvata ✓") arriva solo quando il
 * server ha risposto di sì. Un errore di passaggio (rete, limite di tempo, server occupato, sessione da rinnovare)
 * ferma il giro e si ritenta più tardi; un errore definitivo (il server dice no al dato) rende la voce `rifiutata`, con
 * il motivo, e il giro passa alla voce dopo: non si ritenta mai da solo.
 */

/** Le attese dopo un errore di passaggio: 2, 5, 15, 30 e poi 60 secondi. */
const ATTESE_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

/** L'attesa prima del prossimo tentativo, dopo `tentativi` tentativi andati male (almeno 1). */
export function attesaDopo(tentativi: number): number {
  return ATTESE_MS[Math.min(Math.max(tentativi, 1), ATTESE_MS.length) - 1]
}

function leggi(e: unknown): { messaggio: string; code: string; status: number | undefined } {
  if (typeof e !== 'object' || e === null) return { messaggio: typeof e === 'string' ? e : '', code: '', status: undefined }
  const o = e as { message?: unknown; code?: unknown; status?: unknown }
  return {
    messaggio: typeof o.message === 'string' ? o.message : '',
    code: typeof o.code === 'string' ? o.code : '',
    status: typeof o.status === 'number' ? o.status : undefined,
  }
}

/**
 * Vero se ritentare non serve: il server ha rifiutato il dato e lo rifiuterà sempre.
 * - Definitivi: RLS (42501), vincoli (classe 23), dati non validi (classe 22), guardie del database (P0001) e le risposte
 *   400 e 403 di PostgREST (con gli altri 4xx che non sono di passaggio).
 * - Di passaggio: `ErroreRete` (anche ricopiato nel messaggio da PostgREST), il fetch che non porta la richiesta, 5xx,
 *   408, 429, la sessione da rinnovare (401 con qualunque codice, PGRST301), il database fermo (PGRST000-003) o occupato (classi 08, 40, 53,
 *   57, 58). Anche un errore che non si riconosce: meglio ritentare (l'upsert lo permette) che dichiarare persa una
 *   misura; resta in coda con il messaggio dell'ultimo tentativo, che il pannello mostra.
 */
export function eDefinitivo(e: unknown): boolean {
  if (e instanceof ErroreRete) return false
  const { messaggio, code, status } = leggi(e)
  if (/ErroreRete|Rete debole|Failed to fetch|NetworkError|Load failed|AbortError/.test(messaggio)) return false
  // Un 401 è la sessione (scaduta o da rinnovare), anche con il codice dei permessi (42501 senza token): si ritenta.
  if (status === 401) return false
  if (code === 'PGRST301' || /^PGRST00[0-3]$/.test(code) || /^(08|40|53|57|58)/.test(code)) return false
  if (code === '42501' || code === 'P0001' || /^2[23]/.test(code)) return true
  if (status === undefined || status === 0) return false
  if (status === 408 || status === 429 || status >= 500) return false
  return status >= 400 && status < 500
}

/** Il motivo di un rifiuto, detto per una misura (i messaggi generali parlano di eliminazioni e di nomi). */
function motivoRifiuto(e: unknown): string {
  const { messaggio, code } = leggi(e)
  if (code === '23503') {
    if (messaggio.includes('pianta_id')) return 'La pianta non c\'è più nell\'esperimento.'
    if (messaggio.includes('strumento_id')) return 'Lo strumento non c\'è più nell\'esperimento.'
    return 'La pianta o lo strumento non c\'è più nell\'esperimento.'
  }
  if (code === '42501') return 'Non hai il permesso di salvare misure in questo esperimento.'
  return messaggioErrore(e)
}

/** Com'è andato un giro d'invio. */
export interface EsitoInvio {
  inviate: number
  rifiutate: number
  /** Un errore di passaggio ha fermato il giro: le voci rimaste ripartono più tardi. */
  fermato: boolean
}

const NIENTE: EsitoInvio = { inviate: 0, rifiutate: 0, fermato: false }

/** Inserisce o sostituisce la misura in un elenco della cache, nell'ordine di quell'elenco. */
const conMisura = (prima: Misura[], m: Misura, ordine: (a: Misura, b: Misura) => number): Misura[] =>
  [...prima.filter(x => x.id !== m.id), m].sort(ordine)

/**
 * La misura è arrivata: entra nelle letture della pianta e del giorno già in cache (così, tolta dalla coda, non sparisce
 * e la pianta resta fatta), esce dai giorni in cui non è più (una correzione che cambia la data). Le altre letture che
 * dipendono dalle misure diventano vecchie senza rileggerle adesso: con poco segnale sarebbero altre richieste, e si
 * rileggono la prossima volta che servono.
 */
function aggiornaCacheDopoInvio(queryClient: QueryClient, espId: string, m: Misura): void {
  queryClient.setQueryData<Misura[]>(chiavi.misurePianta(m.pianta_id), prima => prima && conMisura(prima, m, piuRecentiPrima))
  for (const [chiave, prima] of queryClient.getQueriesData<Misura[]>({ queryKey: ['misure', 'giorno', espId] })) {
    if (!prima) continue
    const giorno = chiave[3]
    if (giorno === m.data_rilievo) queryClient.setQueryData<Misura[]>(chiave, conMisura(prima, m, perOraCrescente))
    else if (prima.some(x => x.id === m.id)) queryClient.setQueryData<Misura[]>(chiave, prima.filter(x => x.id !== m.id))
  }
  // La pagina di modifica aperta su questa misura (che il server prima non trovava) la trova adesso.
  if (queryClient.getQueryState(chiavi.misura(m.id)) !== undefined) queryClient.setQueryData(chiavi.misura(m.id), m)
  void queryClient.invalidateQueries({ queryKey: chiavi.ultimeMisure(espId), refetchType: 'none' })
  void queryClient.invalidateQueries({ queryKey: chiavi.ultimeMisurePiante(espId), refetchType: 'none' })
  void queryClient.invalidateQueries({ queryKey: chiavi.esperimenti, refetchType: 'none' })
  void queryClient.invalidateQueries({ queryKey: chiavi.misureStrumento(espId, m.strumento_id), refetchType: 'none' })
}

/** Il toast di fine giro: uno solo, verde solo per quel che il server ha confermato. */
function avvisaEsito(inviate: VoceCoda[], rifiutate: VoceCoda[]): void {
  if (inviate.length === 1) toastSalvato(`Pianta #${inviate[0].etichetta} salvata ✓`)
  else if (inviate.length > 1) toastSalvato(`${inviate.length} misure inviate ✓`)
  // Un rifiuto non passa in silenzio: resta in coda come "Non inviata" e lo si dice anche qui, finché non lo si chiude.
  if (rifiutate.length === 1) {
    const [v] = rifiutate
    toast.error(`Pianta #${v.etichetta} non inviata: ${v.errore ?? 'il server non l\'ha accettata.'} La trovi tra le misure da inviare.`, OPZIONI_ERRORE_TARDIVO)
  } else if (rifiutate.length > 1) {
    toast.error(`${rifiutate.length} misure non inviate: le trovi tra le misure da inviare, con il motivo.`, OPZIONI_ERRORE_TARDIVO)
  }
}

/** La richiesta del giro in corso: un'altra chiamata nel frattempo la allarga (`forza`) e lo fa ripassare (`ancora`). */
interface Richiesta { forza: boolean; ancora: boolean; finito: boolean }

let corrente: { utente: string; richiesta: Richiesta; promessa: Promise<EsitoInvio> } | null = null

async function giro(utente: string, queryClient: QueryClient, richiesta: Richiesta): Promise<EsitoInvio> {
  // Dentro il blocco nessun'altra scheda invia: una voce rimasta "in invio" è di un invio interrotto (app chiusa a
  // metà, scheda ricaricata) e riparte.
  for (const v of vociDi(utente)) {
    if (v.stato === 'invio') aggiornaVoce(utente, v.misura.id, v.revisione, x => ({ ...x, stato: 'attesa' }))
  }
  const inviate: VoceCoda[] = []
  const rifiutate: VoceCoda[] = []
  // Le revisioni già provate in questo giro: nessuna parte due volte nello stesso giro.
  const provate = new Set<string>()
  let fermato = false
  try {
    for (;;) {
      // Solo le voci di chi ha la sessione: se nel frattempo è uscito (o è entrato un altro), ci si ferma.
      if (utenteCoda() !== utente) break
      const adesso = Date.now()
      const voce = fermato ? undefined : vociDi(utente).find(v =>
        v.stato === 'attesa' && !provate.has(v.revisione) &&
        (richiesta.forza || v.prossimoTentativo === null || v.prossimoTentativo <= adesso))
      if (!voce) {
        if (!richiesta.ancora) break
        // Un'altra chiamata durante il giro (una misura nuova, la rete tornata): si ripassa la coda da capo.
        richiesta.ancora = false
        fermato = false
        provate.clear()
        continue
      }
      provate.add(voce.revisione)
      const { misura, revisione } = voce
      // Da qui la misura può arrivare al server anche se la risposta si perde.
      aggiornaVoce(utente, misura.id, revisione, v => ({ ...v, stato: 'invio', forseSulServer: true }))
      try {
        await salvaMisura(voce.espId, misura)
      } catch (e) {
        const tentativi = voce.tentativi + 1
        if (utenteCoda() !== utente) {
          // Un rifiuto arrivato mentre la sessione finiva è della sessione, non del dato: la voce aspetta il prossimo accesso.
          aggiornaVoce(utente, misura.id, revisione, v => ({ ...v, stato: 'attesa' }))
          break
        }
        if (eDefinitivo(e)) {
          const errore = motivoRifiuto(e)
          aggiornaVoce(utente, misura.id, revisione, v => ({ ...v, stato: 'rifiutata', tentativi, prossimoTentativo: null, errore }))
          rifiutate.push({ ...voce, errore })
          continue
        }
        const errore = messaggioErrore(e)
        aggiornaVoce(utente, misura.id, revisione, v => ({
          ...v, stato: 'attesa', tentativi, prossimoTentativo: Date.now() + attesaDopo(tentativi), errore,
        }))
        fermato = true
        continue
      }
      // Arrivata. Se nel frattempo è stata corretta (revisione nuova), la correzione resta in coda e parte dopo.
      aggiornaVoce(utente, misura.id, revisione, () => null)
      aggiornaCacheDopoInvio(queryClient, voce.espId, misura)
      inviate.push(voce)
    }
  } finally {
    // Nello stesso passo in cui si è vista la coda finita: una chiamata da qui in poi apre un giro nuovo.
    richiesta.finito = true
  }
  avvisaEsito(inviate, rifiutate)
  return { inviate: inviate.length, rifiutate: rifiutate.length, fermato }
}

/** Una sola scheda alla volta invia (`navigator.locks` dove c'è; senza, un doppio invio è innocuo: upsert per id). */
function inEsclusiva(lavoro: () => Promise<EsitoInvio>): Promise<EsitoInvio> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks && typeof locks.request === 'function') return locks.request('fastlab-coda', lavoro) as Promise<EsitoInvio>
  return lavoro()
}

/**
 * Invia la coda di `utente`, solo se è l'utente della sessione. Una chiamata mentre un giro è in corso non ne apre un
 * secondo: lo stesso giro ripassa la coda (le misure accodate nel frattempo partono) e si aspetta la sua fine.
 * - `forza`: anche le voci che aspettano dopo un errore, e anche se il browser dice di essere senza rete ("Invia ora",
 *   rete tornata, app di nuovo visibile, accesso). Senza, chi è senza rete non prova e le voci in attesa aspettano il loro momento.
 * Non lancia mai: un errore imprevisto si scrive nella console e le voci restano in coda.
 */
export function inviaCoda(utente: string, queryClient: QueryClient, opzioni: { forza?: boolean } = {}): Promise<EsitoInvio> {
  const forza = opzioni.forza === true
  if (corrente && !corrente.richiesta.finito && corrente.utente === utente) {
    corrente.richiesta.ancora = true
    corrente.richiesta.forza ||= forza
    return corrente.promessa
  }
  if (utenteCoda() !== utente) return Promise.resolve(NIENTE)
  if (!forza && typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(NIENTE)
  if (!vociDi(utente).some(v => v.stato !== 'rifiutata')) return Promise.resolve(NIENTE)

  const richiesta: Richiesta = { forza, ancora: false, finito: false }
  const promessa = inEsclusiva(() => giro(utente, queryClient, richiesta)).catch((e: unknown) => {
    richiesta.finito = true
    console.error('Invio della coda interrotto.', e)
    return NIENTE
  })
  const questo = { utente, richiesta, promessa }
  corrente = questo
  void promessa.finally(() => { if (corrente === questo) corrente = null })
  return promessa
}

/**
 * L'invio da solo (in `main.tsx`): al ritorno della rete (`online`), quando l'app torna visibile, quando accede
 * l'utente che ha voci in coda (anche all'avvio con la sessione salvata) e allo scadere dell'attesa dopo un errore.
 * Restituisce la funzione che lo ferma.
 */
export function avviaInvioAutomatico(queryClient: QueryClient): () => void {
  let attivo = true
  const prova = (forza: boolean) => {
    const utente = utenteCoda()
    if (attivo && utente) void inviaCoda(utente, queryClient, { forza })
  }
  // I tentativi "subito" partono fuori dal passo in corso; fermato l'invio automatico non partono più.
  const subito = new Set<ReturnType<typeof setTimeout>>()
  const provaSubito = () => {
    const t = setTimeout(() => { subito.delete(t); prova(true) }, 0)
    subito.add(t)
  }
  const allaRete = () => prova(true)
  const allaVista = () => { if (document.visibilityState === 'visible') prova(true) }

  let timer: ReturnType<typeof setTimeout> | null = null
  let utentePrima = utenteCoda()
  // A ogni cambio della coda: il timer va al prossimo tentativo che aspetta. Al cambio di utente si prova subito, ma
  // fuori dall'avviso del cambio di sessione (lì una chiamata a Supabase aspetterebbe la fine dell'avviso stesso).
  const alCambio = () => {
    const utente = utenteCoda()
    if (utente !== utentePrima) {
      utentePrima = utente
      if (utente) provaSubito()
    }
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (!utente) return
    const attese = vociDi(utente).filter(v => v.stato === 'attesa' && v.prossimoTentativo !== null).map(v => v.prossimoTentativo as number)
    if (attese.length === 0) return
    // Un attimo dopo il momento giusto: il timer non deve arrivare un millisecondo prima e trovare la voce non ancora pronta.
    timer = setTimeout(() => { timer = null; prova(false) }, Math.max(0, Math.min(...attese) - Date.now()) + 50)
  }

  window.addEventListener('online', allaRete)
  document.addEventListener('visibilitychange', allaVista)
  const stacca = iscriviti(alCambio)
  alCambio()
  if (utentePrima) provaSubito()

  return () => {
    attivo = false
    for (const t of subito) clearTimeout(t)
    window.removeEventListener('online', allaRete)
    document.removeEventListener('visibilitychange', allaVista)
    stacca()
    if (timer !== null) clearTimeout(timer)
  }
}
