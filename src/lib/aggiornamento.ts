import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

/**
 * L'aggiornamento dell'app (Piano E, Task E7). Il service worker (`vite-plugin-pwa`, `registerType: 'prompt'`) tiene in
 * cache tutta la build: un'app aperta resta coerente con la sua versione anche dopo un deploy, e si apre senza rete.
 * La versione nuova non si attiva mai a metà lavoro: aspetta la prossima apertura dell'app (tutte le finestre chiuse)
 * oppure "Nuova versione · Aggiorna" nel menu, che prima chiede se ci sono modifiche non salvate.
 */

/** Le opzioni di `registerSW` di `virtual:pwa-register` che si usano qui. */
export interface OpzioniRegistrazione {
  onNeedRefresh?: () => void
  onNeedReload?: () => void
  onRegisteredSW?: (url: string, registrazione: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (errore: unknown) => void
}

/** `registerSW` di `virtual:pwa-register` (passato da main.tsx: nei test il modulo virtuale non c'è). */
export type RegistraSW = (opzioni: OpzioniRegistrazione) => (ricaricaPagina?: boolean) => Promise<void>

export const MESSAGGIO_NUOVA_VERSIONE = 'È uscita una nuova versione: ricarica la pagina.'

/** Ogni quanto, al massimo, si chiede al server se c'è una versione nuova quando l'app torna visibile. */
const INTERVALLO_CONTROLLO_MS = 60 * 60 * 1000

/** Dopo "Aggiorna comunque", per quanto la ricarica non chiede una seconda conferma al browser. */
const ATTESA_RICARICA_MS = 10_000

let pronto = false
let aggiorna: ((ricaricaPagina?: boolean) => Promise<void>) | null = null
let ricaricaVoluta = false
let ferma: (() => void) | null = null
const ascoltatori = new Set<() => void>()

function cambiaPronto(valore: boolean): void {
  if (pronto === valore) return
  pronto = valore
  for (const a of [...ascoltatori]) a()
}

function iscriviti(ascoltatore: () => void): () => void {
  ascoltatori.add(ascoltatore)
  return () => ascoltatori.delete(ascoltatore)
}

/** Vero quando una versione nuova è pronta e aspetta: il menu mostra "Nuova versione · Aggiorna". */
export function useAggiornamentoPronto(): boolean {
  return useSyncExternalStore(iscriviti, () => pronto, () => pronto)
}

/**
 * Vero se lasciare la pagina adesso perderebbe qualcosa. Chiede alle stesse protezioni che fermano la chiusura della
 * scheda del browser (`beforeunload`): il modulo della misura (`useModuloProtetto`), le Impostazioni, la modifica
 * della misura, il Diario, il catalogo, la creazione guidata, le foto in viaggio, le eliminazioni con "Annulla" in
 * attesa. Ognuna risponde con `preventDefault` solo se ha qualcosa da perdere; nessuna fa altro.
 */
export function ciSonoModificheNonSalvate(): boolean {
  const evento = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(evento)
  return evento.defaultPrevented
}

// Dopo "Aggiorna comunque" la ricarica non deve far chiedere di nuovo al browser: questo ascolto (in cattura, quindi
// prima di quelli delle pagine) ferma gli altri, solo in quel momento.
function lasciaRicaricare(evento: Event): void {
  if (ricaricaVoluta) evento.stopImmediatePropagation()
}

const ricaricaDelBrowser = () => window.location.reload()

function avvisaNuovaVersione(ricarica: () => void): void {
  toast(MESSAGGIO_NUOVA_VERSIONE, { id: 'nuova-versione', duration: Infinity, action: { label: 'Ricarica', onClick: ricarica } })
}

/**
 * Registra il service worker. `ricarica` è la ricarica della pagina (sostituibile nei test).
 * - `onNeedRefresh`: una versione nuova è installata e aspetta.
 * - `onNeedReload`: un'altra finestra ha attivato la versione nuova; questa si ricarica solo senza modifiche non
 *   salvate, altrimenti lo dice e lascia scegliere.
 * - Quando l'app torna visibile (al massimo una volta l'ora) si chiede al server se c'è una versione nuova: un'app
 *   che resta aperta per giorni sul telefono non la vedrebbe mai.
 */
export function avviaAggiornamento(registra: RegistraSW, opzioni: { ricarica?: () => void } = {}): void {
  fermaAggiornamento()
  const ricarica = opzioni.ricarica ?? ricaricaDelBrowser
  let registrazione: ServiceWorkerRegistration | undefined
  let ultimoControllo = Date.now()

  const allaVista = () => {
    if (document.visibilityState !== 'visible' || !registrazione) return
    if (Date.now() - ultimoControllo < INTERVALLO_CONTROLLO_MS) return
    ultimoControllo = Date.now()
    // Senza rete il controllo fallisce: si riproverà alla prossima volta.
    registrazione.update().catch(() => {})
  }

  aggiorna = registra({
    onNeedRefresh: () => cambiaPronto(true),
    onNeedReload: () => {
      if (ricaricaVoluta || !ciSonoModificheNonSalvate()) ricarica()
      else avvisaNuovaVersione(ricarica)
    },
    onRegisteredSW: (_url, r) => { registrazione = r },
    onRegisterError: e => console.warn('Il service worker non si registra: l\'app funziona, ma non senza rete.', e),
  })
  document.addEventListener('visibilitychange', allaVista)
  window.addEventListener('beforeunload', lasciaRicaricare, { capture: true })
  ferma = () => {
    document.removeEventListener('visibilitychange', allaVista)
    window.removeEventListener('beforeunload', lasciaRicaricare, { capture: true })
  }
}

/** Ferma l'ascolto e dimentica lo stato (per i test). */
export function fermaAggiornamento(): void {
  ferma?.()
  ferma = null
  aggiorna = null
  ricaricaVoluta = false
  cambiaPronto(false)
}

/**
 * "Nuova versione · Aggiorna": attiva la versione nuova, che poi ricarica la pagina.
 * - `nessuno`: non c'è una versione nuova pronta;
 * - `modifiche`: ci sono modifiche non salvate e non si è scelto di scartarle: chi chiama chiede, e se l'utente
 *   conferma richiama con `scartaModifiche`;
 * - `avviato`: la versione nuova si sta attivando.
 */
export function applicaAggiornamento(opzioni: { scartaModifiche?: boolean } = {}): 'nessuno' | 'modifiche' | 'avviato' {
  if (!pronto || !aggiorna) return 'nessuno'
  if (!opzioni.scartaModifiche && ciSonoModificheNonSalvate()) return 'modifiche'
  if (opzioni.scartaModifiche) {
    ricaricaVoluta = true
    // Se la ricarica non arriva (il service worker non risponde), le protezioni tornano a valere.
    setTimeout(() => { ricaricaVoluta = false }, ATTESA_RICARICA_MS)
  }
  void aggiorna(true)
  return 'avviato'
}

/**
 * Un pezzo dell'app caricato a richiesta (l'Excel, per esempio) che non arriva più: di solito è uscita una versione
 * nuova e quella di questa pagina non c'è più sul server (con il service worker capita solo prima della sua prima
 * installazione). L'errore resta a chi ha chiesto il pezzo; qui si dice anche come uscirne. Restituisce la funzione
 * che toglie l'ascolto.
 */
export function ascoltaErroriDiCaricamento(opzioni: { ricarica?: () => void } = {}): () => void {
  const ricarica = opzioni.ricarica ?? ricaricaDelBrowser
  const avvisa = () => avvisaNuovaVersione(ricarica)
  window.addEventListener('vite:preloadError', avvisa)
  return () => window.removeEventListener('vite:preloadError', avvisa)
}
