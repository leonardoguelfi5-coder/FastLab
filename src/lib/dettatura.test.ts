import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { parla, suonoErrore, useDettatura } from './dettatura'

/** Un SpeechRecognition finto: tiene le istanze per guardarle e farle parlare dai test. */
class RiconoscimentoFinto {
  static istanze: RiconoscimentoFinto[] = []
  lang = ''
  continuous = false
  interimResults = true
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() { RiconoscimentoFinto.istanze.push(this) }

  /** Una frase finita (o in corso, con `finale` falso). */
  frase(testo: string, finale = true) {
    const risultato = Object.assign([{ transcript: testo, confidence: 0.9 }], { isFinal: finale })
    this.onresult?.({ resultIndex: 0, results: [risultato] })
  }
}

const ultimo = () => RiconoscimentoFinto.istanze[RiconoscimentoFinto.istanze.length - 1]

class FraseFinta {
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  text: string
  constructor(text: string) { this.text = text }
}

const sintesi = { cancel: vi.fn(), speak: vi.fn() }

beforeEach(() => {
  RiconoscimentoFinto.istanze = []
  sintesi.cancel.mockReset()
  sintesi.speak.mockReset()
  vi.stubGlobal('SpeechRecognition', RiconoscimentoFinto)
  vi.stubGlobal('SpeechSynthesisUtterance', FraseFinta)
  vi.stubGlobal('speechSynthesis', sintesi)
})

afterEach(() => {
  // La sintesi è di tutta l'app: una frase lasciata a metà terrebbe in pausa l'ascolto del test dopo.
  for (const [frase] of sintesi.speak.mock.calls) (frase as FraseFinta).onend?.()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useDettatura: disponibilità', () => {
  it('senza API non è disponibile e dice perché', () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    const { result } = renderHook(() => useDettatura(vi.fn()))
    expect(result.current.disponibile).toBe(false)
    expect(result.current.motivo).toBe('La dettatura non è supportata da questo browser.')
  })

  it('usa webkitSpeechRecognition se manca SpeechRecognition', () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', RiconoscimentoFinto)
    const { result } = renderHook(() => useDettatura(vi.fn()))
    expect(result.current.disponibile).toBe(true)
    expect(result.current.motivo).toBeNull()
    act(() => result.current.ascolta())
    expect(ultimo().start).toHaveBeenCalledTimes(1)
  })

  it('senza rete non è disponibile e dice perché', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = renderHook(() => useDettatura(vi.fn()))
    expect(result.current.disponibile).toBe(false)
    expect(result.current.motivo).toBe('La dettatura richiede la connessione.')
    act(() => result.current.ascolta())
    expect(RiconoscimentoFinto.istanze).toHaveLength(0)
    expect(result.current.inAscolto).toBe(false)
  })

  it('con la rete che cade mentre ascolta, si ferma', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    online.mockReturnValue(false)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current.inAscolto).toBe(false)
    expect(ultimo().abort).toHaveBeenCalled()
    act(() => ultimo().onend?.())
    expect(ultimo().start).toHaveBeenCalledTimes(1)
  })
})

describe('useDettatura: ascolto', () => {
  it('ascolta avvia in italiano, continuo e solo con le frasi finite', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    expect(result.current.inAscolto).toBe(false)
    act(() => result.current.ascolta())
    const r = ultimo()
    expect(r.lang).toBe('it-IT')
    expect(r.continuous).toBe(true)
    expect(r.interimResults).toBe(false)
    expect(r.start).toHaveBeenCalledTimes(1)
    expect(result.current.inAscolto).toBe(true)
  })

  it('un end riavvia finché è in ascolto', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    act(() => ultimo().onend?.())
    expect(ultimo().start).toHaveBeenCalledTimes(2)
    act(() => ultimo().onend?.())
    expect(ultimo().start).toHaveBeenCalledTimes(3)
    expect(RiconoscimentoFinto.istanze).toHaveLength(1)
  })

  it('ferma interrompe e un end dopo non riavvia', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    act(() => result.current.ferma())
    expect(result.current.inAscolto).toBe(false)
    expect(ultimo().abort).toHaveBeenCalledTimes(1)
    act(() => ultimo().onend?.())
    expect(ultimo().start).toHaveBeenCalledTimes(1)
  })

  it('le frasi finite arrivano a onFrase, quelle in corso no', () => {
    const onFrase = vi.fn()
    const { result } = renderHook(() => useDettatura(onFrase))
    act(() => result.current.ascolta())
    act(() => ultimo().frase('53 avanti', false))
    expect(onFrase).not.toHaveBeenCalled()
    act(() => ultimo().frase(' 53 avanti '))
    expect(onFrase).toHaveBeenCalledWith('53 avanti')
  })

  it('usa sempre l\'ultimo onFrase', () => {
    const primo = vi.fn()
    const secondo = vi.fn()
    const { result, rerender } = renderHook(({ f }) => useDettatura(f), { initialProps: { f: primo } })
    act(() => result.current.ascolta())
    rerender({ f: secondo })
    act(() => ultimo().frase('indietro'))
    expect(primo).not.toHaveBeenCalled()
    expect(secondo).toHaveBeenCalledWith('indietro')
  })

  it('il permesso negato la ferma con il motivo; ascoltare di nuovo lo toglie', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    act(() => ultimo().onerror?.({ error: 'not-allowed' }))
    act(() => ultimo().onend?.())
    expect(result.current.inAscolto).toBe(false)
    expect(result.current.motivo).toBe('Permesso del microfono negato: attivalo nelle impostazioni del browser.')
    expect(ultimo().start).toHaveBeenCalledTimes(1)
    act(() => result.current.ascolta())
    expect(result.current.motivo).toBeNull()
    expect(ultimo().start).toHaveBeenCalledTimes(2)
  })

  it('un silenzio (no-speech) non ferma: riparte su end', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    act(() => ultimo().onerror?.({ error: 'no-speech' }))
    act(() => ultimo().onend?.())
    expect(result.current.inAscolto).toBe(true)
    expect(result.current.motivo).toBeNull()
    expect(ultimo().start).toHaveBeenCalledTimes(2)
  })

  it('smontando si ferma e non riparte più', () => {
    const onFrase = vi.fn()
    const { result, unmount } = renderHook(() => useDettatura(onFrase))
    act(() => result.current.ascolta())
    const r = ultimo()
    const onend = r.onend
    unmount()
    expect(r.abort).toHaveBeenCalledTimes(1)
    onend?.()
    r.onend?.()
    expect(r.start).toHaveBeenCalledTimes(1)
    parla('ciao')
    expect(r.start).toHaveBeenCalledTimes(1)
  })
})

describe('parla', () => {
  it('parla in italiano e annulla la frase precedente', () => {
    parla('53 salvato, prossimo P12')
    expect(sintesi.cancel).toHaveBeenCalledTimes(1)
    expect(sintesi.speak).toHaveBeenCalledTimes(1)
    const frase = sintesi.speak.mock.calls[0][0] as FraseFinta
    expect(frase.text).toBe('53 salvato, prossimo P12')
    expect(frase.lang).toBe('it-IT')
    frase.onend?.()
  })

  it('mentre parla l\'ascolto va in pausa e riprende alla fine della frase', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    const r = ultimo()
    parla('53 salvato, prossimo P12')
    expect(r.abort).toHaveBeenCalledTimes(1)
    // L'interruzione chiude il riconoscimento: non riparte finché parla.
    r.onend?.()
    expect(r.start).toHaveBeenCalledTimes(1)
    expect(result.current.inAscolto).toBe(true)
    ;(sintesi.speak.mock.calls[0][0] as FraseFinta).onend?.()
    expect(r.start).toHaveBeenCalledTimes(2)
  })

  it('la fine di una frase annullata non fa ripartire l\'ascolto mentre parla la nuova', () => {
    const { result } = renderHook(() => useDettatura(vi.fn()))
    act(() => result.current.ascolta())
    const r = ultimo()
    parla('prima')
    r.onend?.()
    parla('seconda')
    ;(sintesi.speak.mock.calls[0][0] as FraseFinta).onend?.()
    expect(r.start).toHaveBeenCalledTimes(1)
    ;(sintesi.speak.mock.calls[1][0] as FraseFinta).onend?.()
    expect(r.start).toHaveBeenCalledTimes(2)
  })

  it('se la fine della frase non arriva, l\'ascolto riprende comunque', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useDettatura(vi.fn()))
      act(() => result.current.ascolta())
      const r = ultimo()
      parla('53 salvato')
      r.onend?.()
      vi.advanceTimersByTime(60_000)
      expect(r.start).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('senza speechSynthesis non fa nulla e non lancia', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(() => parla('ciao')).not.toThrow()
  })
})

describe('suonoErrore', () => {
  it('senza Web Audio non lancia', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    expect(() => suonoErrore()).not.toThrow()
  })

  it('con Web Audio fa un bip breve', () => {
    const oscillatore = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
    const volume = { gain: { value: 0 }, connect: vi.fn() }
    class AudioFinto {
      currentTime = 1
      destination = {}
      resume = vi.fn(() => Promise.resolve())
      createOscillator = () => oscillatore
      createGain = () => volume
    }
    vi.stubGlobal('AudioContext', AudioFinto)
    suonoErrore()
    expect(oscillatore.start).toHaveBeenCalledWith(1)
    const fine = oscillatore.stop.mock.calls[0][0] as number
    expect(fine - 1).toBeGreaterThan(0)
    expect(fine - 1).toBeLessThanOrEqual(0.5)
    expect(volume.connect).toHaveBeenCalledWith(expect.anything())
  })
})
