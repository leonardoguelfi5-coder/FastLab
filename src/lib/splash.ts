/**
 * La schermata d'avvio (markup, stile e animazione in index.html). Si vede subito, mentre il JavaScript si carica; qui
 * la si chiude dopo il primo disegno dell'app, ma non prima che l'animazione abbia finito di comporre il marchio.
 * Un tocco la chiude subito. Con il movimento ridotto si aspetta meno.
 */

/** Quanto dura l'animazione d'ingresso, dall'inizio della pagina (index.html). */
export const DURATA_MINIMA_MS = 2000
/** Con `prefers-reduced-motion`: il marchio fermo, giusto il tempo di riconoscerlo. */
export const DURATA_MINIMA_RIDOTTA_MS = 600
/** La dissolvenza d'uscita (la transizione di `#splash` in index.html), con un po' di margine. */
export const DURATA_USCITA_MS = 520

declare global {
  interface Window {
    __splashInizio?: number
    __chiudiSplash?: () => void
  }
}

let chiusuraAvviata = false

function movimentoRidotto(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Avvia l'uscita: dissolvenza, poi via dal documento. Si può chiamare più volte. */
function esci(splash: HTMLElement): void {
  if (splash.classList.contains('splash--uscita')) return
  splash.classList.add('splash--uscita')
  // Il colore della barra di sistema torna quello dell'app, che index.html ha messo da parte.
  const colore = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (colore?.dataset.app) colore.content = colore.dataset.app
  document.documentElement.classList.remove('con-splash')
  window.setTimeout(() => {
    splash.remove()
    delete window.__chiudiSplash
  }, DURATA_USCITA_MS)
}

/**
 * Chiude la schermata d'avvio quando l'animazione è finita (subito se è già passato il tempo). Da chiamare dopo il primo
 * disegno dell'app. Senza schermata (già vista in questa sessione) non fa niente.
 */
export function chiudiSplash(ora: number = performance.now()): void {
  const splash = document.getElementById('splash')
  if (!splash || chiusuraAvviata) return
  chiusuraAvviata = true

  const chiudi = () => esci(splash)
  window.__chiudiSplash = chiudi
  splash.addEventListener('pointerdown', chiudi, { once: true })

  const minima = movimentoRidotto() ? DURATA_MINIMA_RIDOTTA_MS : DURATA_MINIMA_MS
  const trascorso = ora - (window.__splashInizio ?? ora)
  const attesa = Math.max(0, minima - trascorso)
  // Due fotogrammi: l'app sotto è già disegnata quando la schermata comincia a dissolversi.
  window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(chiudi)), attesa)
}

/** Solo per i test. */
export function _azzeraSplash(): void {
  chiusuraAvviata = false
}
