import { useCallback, useEffect, useRef, useState } from 'react'
import { useSenzaRete } from './useSenzaRete'

/**
 * La dettatura a voce: il riconoscimento del browser (Web Speech API, `it-IT`), la voce che conferma (`speechSynthesis`)
 * e un bip per gli errori (Web Audio). Il riconoscimento di Chrome passa dal server: senza rete non funziona.
 */

export const NON_SUPPORTATA = 'La dettatura non è supportata da questo browser.'
export const SENZA_RETE_DETTATURA = 'La dettatura richiede la connessione.'
export const PERMESSO_NEGATO = 'Permesso del microfono negato: attivalo nelle impostazioni del browser.'
export const SENZA_MICROFONO = 'Nessun microfono trovato.'

// Le parti della Web Speech API che servono: non sono in tutte le versioni di lib.dom.
interface RisultatoRiconoscimento { readonly isFinal: boolean; readonly 0?: { transcript: string } }
interface EventoRisultato { readonly resultIndex: number; readonly results: ArrayLike<RisultatoRiconoscimento> }
interface Riconoscimento {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: EventoRisultato) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type CostruttoreRiconoscimento = new () => Riconoscimento

function costruttore(): CostruttoreRiconoscimento | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: CostruttoreRiconoscimento; webkitSpeechRecognition?: CostruttoreRiconoscimento }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// --- La voce dell'app: mentre parla, chi ascolta va in pausa (così non sente la propria voce).

let parlando = false
const avvisiParlato = new Set<() => void>()
// La frase in corso resta in memoria: Chrome perde l'evento `end` di una frase che nessuno tiene più.
let fraseInCorso: SpeechSynthesisUtterance | null = null
let scadenza: ReturnType<typeof setTimeout> | undefined

function impostaParlando(valore: boolean) {
  if (parlando === valore) return
  parlando = valore
  for (const avvisa of avvisiParlato) avvisa()
}

/** Dice una frase in italiano, interrompendo quella prima. Senza sintesi vocale non fa nulla. */
export function parla(testo: string): void {
  const sintesi = typeof window === 'undefined' ? undefined : window.speechSynthesis
  if (!sintesi || typeof SpeechSynthesisUtterance === 'undefined') return
  const frase = new SpeechSynthesisUtterance(testo)
  frase.lang = 'it-IT'
  // Solo la fine della frase corrente fa riprendere l'ascolto: quella annullata da `cancel` non conta.
  const fine = () => {
    if (fraseInCorso !== frase) return
    fraseInCorso = null
    clearTimeout(scadenza)
    impostaParlando(false)
  }
  frase.onend = fine
  frase.onerror = fine
  fraseInCorso = frase
  clearTimeout(scadenza)
  // Se la fine non arriva (succede in Chrome), l'ascolto riprende lo stesso dopo un tempo largo per la frase.
  scadenza = setTimeout(fine, 3000 + testo.length * 150)
  impostaParlando(true)
  sintesi.cancel()
  sintesi.speak(frase)
}

// --- Il bip degli errori.

let audio: AudioContext | null = null

/** Un bip breve e basso: "non ho capito" o "non salvato". Senza Web Audio non fa nulla. */
export function suonoErrore(): void {
  try {
    const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Audio) return
    audio ??= new Audio()
    audio.resume().catch(() => {})
    const ora = audio.currentTime
    const oscillatore = audio.createOscillator()
    const volume = audio.createGain()
    oscillatore.type = 'square'
    oscillatore.frequency.value = 220
    volume.gain.value = 0.15
    oscillatore.connect(volume)
    volume.connect(audio.destination)
    oscillatore.start(ora)
    oscillatore.stop(ora + 0.2)
  } catch {
    // Niente audio: resta quello che la pagina mostra.
  }
}

// --- L'ascolto.

interface Ascolto { avvia(): void; ferma(): void; chiudi(): void }

/**
 * Un riconoscimento che resta in ascolto: Chrome si ferma da solo dopo un silenzio, e qui riparte su `end` finché
 * è attivo e l'app non sta parlando. Gli errori che si ripeterebbero a ogni ripartenza lo fermano con un motivo.
 */
function creaAscolto(Costruttore: CostruttoreRiconoscimento, frase: (testo: string) => void, errore: (motivo: string) => void): Ascolto {
  const r = new Costruttore()
  r.lang = 'it-IT'
  r.continuous = true
  r.interimResults = false
  let attivo = false
  let avviato = false

  const prova = () => {
    if (!attivo || avviato || parlando) return
    try {
      r.start()
      avviato = true
    } catch {
      // Ancora in chiusura: riparte al suo `end`.
    }
  }
  const interrompi = () => {
    if (avviato) r.abort()
  }
  const suParlato = () => (parlando ? interrompi() : prova())

  r.onresult = e => {
    if (!attivo) return
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const risultato = e.results[i]
      const testo = risultato.isFinal ? risultato[0]?.transcript.trim() : ''
      if (testo) frase(testo)
    }
  }
  r.onerror = e => {
    const motivo = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? PERMESSO_NEGATO
      : e.error === 'audio-capture' ? SENZA_MICROFONO
        : e.error === 'network' ? SENZA_RETE_DETTATURA
          : null
    if (motivo === null) return
    attivo = false
    errore(motivo)
  }
  r.onend = () => {
    avviato = false
    prova()
  }
  avvisiParlato.add(suParlato)

  return {
    avvia() {
      attivo = true
      prova()
    },
    ferma() {
      attivo = false
      interrompi()
    },
    chiudi() {
      attivo = false
      avvisiParlato.delete(suParlato)
      r.onresult = null
      r.onerror = null
      r.onend = null
      interrompi()
      avviato = false
    },
  }
}

export interface Dettatura { disponibile: boolean; motivo: string | null; inAscolto: boolean; ascolta(): void; ferma(): void }

/**
 * La dettatura per una pagina: `ascolta` comincia, ogni frase finita arriva a `onFrase`, `ferma` smette. Non è
 * disponibile senza la Web Speech API o senza rete; `motivo` dice perché, o perché si è fermata da sola (microfono).
 * Smontando la pagina l'ascolto si chiude e non riparte più.
 */
export function useDettatura(onFrase: (testo: string) => void): Dettatura {
  const senzaRete = useSenzaRete()
  const [inAscolto, setInAscolto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const richiamo = useRef(onFrase)
  const ascolto = useRef<Ascolto | null>(null)
  const Costruttore = costruttore()
  const disponibile = Costruttore !== null && !senzaRete
  const motivo = !Costruttore ? NON_SUPPORTATA : senzaRete ? SENZA_RETE_DETTATURA : errore

  useEffect(() => {
    richiamo.current = onFrase
  })

  // La rete cade mentre ascolta: si ferma (e non riparte da sola quando torna).
  if (!disponibile && inAscolto) setInAscolto(false)
  useEffect(() => {
    if (!disponibile) ascolto.current?.ferma()
  }, [disponibile])

  useEffect(() => () => {
    ascolto.current?.chiudi()
    ascolto.current = null
  }, [])

  function ascolta() {
    if (!Costruttore || senzaRete) return
    setErrore(null)
    setInAscolto(true)
    ascolto.current ??= creaAscolto(Costruttore, testo => richiamo.current(testo), m => {
      setErrore(m)
      setInAscolto(false)
    })
    ascolto.current.avvia()
  }

  // Stabile: chi la usa può fermare l'ascolto da un effetto.
  const ferma = useCallback(() => {
    setInAscolto(false)
    ascolto.current?.ferma()
  }, [])

  return { disponibile, motivo, inAscolto, ascolta, ferma }
}
