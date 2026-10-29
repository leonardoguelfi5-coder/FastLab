import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { BarraAzioni } from './BarraAzioni'

/** Una `visualViewport` finta: l'area di pagina visibile, che la tastiera a schermo restringe. */
class VistaFinta extends EventTarget {
  height = 800
  offsetTop = 0
  imposta(altezza: number, offsetTop = 0) {
    this.height = altezza
    this.offsetTop = offsetTop
  }
  /** Come fa il browser: i valori sono già cambiati, poi arriva l'evento. */
  emetti(tipo: 'resize' | 'scroll') {
    this.dispatchEvent(new Event(tipo))
  }
}

const INNER_HEIGHT = Object.getOwnPropertyDescriptor(window, 'innerHeight')!
const OFFSET_HEIGHT = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
let vista: VistaFinta

function usaVisualViewport(v: VistaFinta | undefined) {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: v })
}

const barra = () => screen.getByRole('button', { name: 'Salva' }).closest('[data-slot="barra-azioni"]') as HTMLElement
const mostra = () => render(<BarraAzioni><button>Salva</button></BarraAzioni>)
const radice = document.documentElement

beforeEach(() => {
  // Schermo alto 800px; la tastiera, quando c'è, ne copre una parte in basso.
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  vista = new VistaFinta()
  usaVisualViewport(vista)
})

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', INNER_HEIGHT)
  if (OFFSET_HEIGHT) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', OFFSET_HEIGHT)
  Reflect.deleteProperty(window, 'visualViewport')
  vi.restoreAllMocks()
})

describe('BarraAzioni: sopra la tastiera', () => {
  it('senza tastiera sta in fondo alla pagina', () => {
    mostra()
    expect(barra().style.bottom).toBe('0px')
    expect(barra()).not.toHaveAttribute('data-tastiera')
    expect(radice.style.getPropertyValue('--tastiera-coperta')).toBe('0px')
  })

  it('con la tastiera sale della parte di pagina che copre', () => {
    mostra()
    act(() => { vista.imposta(500); vista.emetti('resize') })
    expect(barra().style.bottom).toBe('300px')
    expect(radice.style.getPropertyValue('--tastiera-coperta')).toBe('300px')
  })

  it('tiene conto di quanto la pagina è scorsa dentro la parte visibile (offsetTop), a ogni scroll', () => {
    mostra()
    act(() => { vista.imposta(500, 100); vista.emetti('scroll') })
    expect(barra().style.bottom).toBe('200px')
    act(() => { vista.imposta(500, 300); vista.emetti('scroll') })
    expect(barra().style.bottom).toBe('0px')
  })

  it('quando la tastiera si chiude torna in fondo', () => {
    mostra()
    act(() => { vista.imposta(500); vista.emetti('resize') })
    act(() => { vista.imposta(800); vista.emetti('resize') })
    expect(barra().style.bottom).toBe('0px')
    expect(radice.style.getPropertyValue('--tastiera-coperta')).toBe('0px')
  })

  it('non scende mai sotto il fondo (zoom, rimbalzo di iOS)', () => {
    mostra()
    act(() => { vista.imposta(900); vista.emetti('resize') })
    expect(barra().style.bottom).toBe('0px')
    act(() => { vista.imposta(700, 250); vista.emetti('scroll') })
    expect(barra().style.bottom).toBe('0px')
  })

  it('se la tastiera è già aperta quando la barra compare, parte già sopra la tastiera', () => {
    vista.imposta(450)
    mostra()
    expect(barra().style.bottom).toBe('350px')
  })

  it("sotto la tastiera non tiene lo spazio dell'area sicura (la tastiera la copre già), ma non per i piccoli scarti", () => {
    mostra()
    act(() => { vista.imposta(500); vista.emetti('resize') })
    expect(barra()).toHaveAttribute('data-tastiera')
    act(() => { vista.imposta(760); vista.emetti('resize') }) // barra del browser, non una tastiera
    expect(barra().style.bottom).toBe('40px')
    expect(barra()).not.toHaveAttribute('data-tastiera')
  })

  it('smontata smette di ascoltare e libera le variabili CSS', () => {
    const aggiungi = vi.spyOn(vista, 'addEventListener')
    const togli = vi.spyOn(vista, 'removeEventListener')
    const { unmount } = mostra()
    expect(aggiungi.mock.calls.map(c => c[0]).sort()).toEqual(['resize', 'scroll'])

    unmount()

    expect(togli.mock.calls.map(c => c[0]).sort()).toEqual(['resize', 'scroll'])
    expect(radice.style.getPropertyValue('--tastiera-coperta')).toBe('')
    expect(radice.style.getPropertyValue('--altezza-barra-azioni')).toBe('')
    // Un evento tardivo non fa niente (e non dà errori).
    expect(() => { vista.imposta(300); vista.emetti('resize') }).not.toThrow()
  })

  it('senza visualViewport (browser vecchi) non fa nulla: resta in fondo con il solo bottom-0 della classe', () => {
    usaVisualViewport(undefined)
    mostra()
    expect(barra().style.bottom).toBe('')
    expect(barra().className).toContain('bottom-0')
    expect(radice.style.getPropertyValue('--tastiera-coperta')).toBe('')
  })
})

describe('BarraAzioni: altezza pubblicata', () => {
  it("--altezza-barra-azioni è l'altezza della barra, anche con la tastiera aperta", () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 77 })
    mostra()
    expect(radice.style.getPropertyValue('--altezza-barra-azioni')).toBe('77px')
    act(() => { vista.imposta(500); vista.emetti('resize') })
    expect(radice.style.getPropertyValue('--altezza-barra-azioni')).toBe('77px')
  })

  it('si toglie quando la barra sparisce', () => {
    const { unmount } = mostra()
    expect(radice.style.getPropertyValue('--altezza-barra-azioni')).toBe('0px')
    unmount()
    expect(radice.style.getPropertyValue('--altezza-barra-azioni')).toBe('')
  })
})
