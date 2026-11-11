import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _azzeraSplash, chiudiSplash, DURATA_MINIMA_MS, DURATA_MINIMA_RIDOTTA_MS, DURATA_USCITA_MS } from './splash'

function preparaPagina() {
  document.head.innerHTML = '<meta name="theme-color" content="#0f2523" data-app="#fcf9f5">'
  document.body.innerHTML = '<div id="splash"></div><div id="root"></div>'
  document.documentElement.classList.add('con-splash')
  window.__splashInizio = 0
}

const splash = () => document.getElementById('splash')
const coloreTema = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

function movimentoRidotto(ridotto: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: ridotto }) as unknown as typeof window.matchMedia
}

describe('chiudiSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _azzeraSplash()
    preparaPagina()
    movimentoRidotto(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    delete window.__splashInizio
    delete window.__chiudiSplash
  })

  it("aspetta la fine dell'animazione d'ingresso, poi si dissolve e se ne va", () => {
    chiudiSplash(500)
    vi.advanceTimersByTime(DURATA_MINIMA_MS - 500 - 1)
    expect(splash()!.classList.contains('splash--uscita')).toBe(false)

    vi.advanceTimersByTime(1 + 50) // il tempo che resta e i due fotogrammi
    expect(splash()!.classList.contains('splash--uscita')).toBe(true)
    expect(coloreTema()).toBe('#fcf9f5')
    expect(document.documentElement.classList.contains('con-splash')).toBe(false)

    vi.advanceTimersByTime(DURATA_USCITA_MS)
    expect(splash()).toBeNull()
    expect(window.__chiudiSplash).toBeUndefined()
  })

  it("se l'app ci ha messo più dell'animazione, esce subito", () => {
    chiudiSplash(DURATA_MINIMA_MS + 3000)
    vi.advanceTimersByTime(50)
    expect(splash()!.classList.contains('splash--uscita')).toBe(true)
  })

  it('con il movimento ridotto aspetta meno', () => {
    movimentoRidotto(true)
    chiudiSplash(0)
    vi.advanceTimersByTime(DURATA_MINIMA_RIDOTTA_MS + 50)
    expect(splash()!.classList.contains('splash--uscita')).toBe(true)
  })

  it('un tocco la chiude subito', () => {
    chiudiSplash(0)
    splash()!.dispatchEvent(new Event('pointerdown'))
    expect(splash()!.classList.contains('splash--uscita')).toBe(true)
  })

  it('chiamata due volte (StrictMode) non programma una seconda uscita', () => {
    chiudiSplash(0)
    chiudiSplash(0)
    vi.advanceTimersByTime(DURATA_MINIMA_MS + 50 + DURATA_USCITA_MS)
    expect(splash()).toBeNull()
  })

  it('senza schermata (già vista in questa sessione) non fa niente', () => {
    splash()!.remove()
    expect(() => chiudiSplash(0)).not.toThrow()
    expect(window.__chiudiSplash).toBeUndefined()
  })
})
