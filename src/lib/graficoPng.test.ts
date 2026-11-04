import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLORI_GRAFICO } from '@/domain/grafico'

// jsdom non decodifica SVG né disegna su canvas: Image e canvas sono finti, come in `immagini.test.ts`.

interface CanvasFinto { width: number; height: number; chiamate: [string, ...unknown[]][]; larghezzaAlToBlob: number }
let canvasCreati: CanvasFinto[]
let esitoImmagine: 'carica' | 'errore' | 'mai'
let opzioniCanvas: { contesto?: boolean; blobNullo?: boolean; drawImageLancia?: boolean }
let urlCreati: Blob[]
let urlLiberati: string[]
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

beforeEach(() => {
  canvasCreati = []
  urlCreati = []
  urlLiberati = []
  esitoImmagine = 'carica'
  opzioniCanvas = {}
  URL.createObjectURL = vi.fn((b: Blob) => { urlCreati.push(b); return `blob:svg-${urlCreati.length}` }) as never
  URL.revokeObjectURL = vi.fn((u: string) => { urlLiberati.push(u) }) as never

  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_: string) {
      if (esitoImmagine === 'carica') queueMicrotask(() => this.onload?.())
      if (esitoImmagine === 'errore') queueMicrotask(() => this.onerror?.())
    }
  })

  const crea = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((nome: string) => {
    if (nome !== 'canvas') return crea(nome)
    const canvas: CanvasFinto & Record<string, unknown> = {
      width: 0, height: 0, chiamate: [], larghezzaAlToBlob: 0,
      getContext: () => opzioniCanvas.contesto === false ? null : new Proxy({}, {
        set: (_t, p, v) => { canvas.chiamate.push(['set:' + String(p), v]); return true },
        get: (_t, p) => (...args: unknown[]) => {
          canvas.chiamate.push([String(p), ...args])
          if (p === 'drawImage' && opzioniCanvas.drawImageLancia) throw new DOMException('canvas contaminato', 'SecurityError')
        },
      }),
      toBlob(cb: (b: Blob | null) => void, tipo: string) {
        canvas.larghezzaAlToBlob = canvas.width
        expect(tipo).toBe('image/png')
        cb(opzioniCanvas.blobNullo ? null : new Blob([PNG], { type: 'image/png' }))
      },
    }
    canvasCreati.push(canvas)
    return canvas as unknown as HTMLCanvasElement
  }) as typeof document.createElement)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"></svg>'

describe('svgInPng', () => {
  it('SVG, immagine, canvas al doppio e PNG: restituisce i byte del PNG', async () => {
    const { svgInPng } = await import('./graficoPng')
    const byte = await svgInPng(SVG, 640, 360)
    expect(byte).toEqual(PNG)
    expect(urlCreati).toHaveLength(1)
    expect(urlCreati[0].type).toContain('image/svg+xml')
    expect(canvasCreati[0].larghezzaAlToBlob).toBe(1280)
    expect(canvasCreati[0].height).toBe(0) // azzerato a fine lavoro
  })

  it('disegna prima il fondo foglio, poi l\'immagine a tutta la tela', async () => {
    const { svgInPng } = await import('./graficoPng')
    await svgInPng(SVG, 640, 360)
    const nomi = canvasCreati[0].chiamate.map(c => c[0])
    expect(canvasCreati[0].chiamate).toContainEqual(['set:fillStyle', COLORI_GRAFICO.foglio])
    expect(nomi.indexOf('fillRect')).toBeLessThan(nomi.indexOf('drawImage'))
    expect(canvasCreati[0].chiamate.find(c => c[0] === 'drawImage')?.slice(2)).toEqual([0, 0, 1280, 720])
  })

  it('la scala si può cambiare', async () => {
    const { svgInPng } = await import('./graficoPng')
    await svgInPng(SVG, 100, 50, 3)
    expect(canvasCreati[0].larghezzaAlToBlob).toBe(300)
  })

  it('libera sempre l\'indirizzo del Blob', async () => {
    const { svgInPng } = await import('./graficoPng')
    await svgInPng(SVG, 640, 360)
    expect(urlLiberati).toEqual(['blob:svg-1'])
  })

  it('un SVG che il browser non decodifica dà null, senza eccezioni, e libera l\'indirizzo', async () => {
    esitoImmagine = 'errore'
    const { svgInPng } = await import('./graficoPng')
    expect(await svgInPng(SVG, 640, 360)).toBeNull()
    expect(urlLiberati).toEqual(['blob:svg-1'])
  })

  it('toBlob nullo dà null', async () => {
    opzioniCanvas = { blobNullo: true }
    const { svgInPng } = await import('./graficoPng')
    expect(await svgInPng(SVG, 640, 360)).toBeNull()
    expect(urlLiberati).toHaveLength(1)
  })

  it('senza contesto 2D dà null', async () => {
    opzioniCanvas = { contesto: false }
    const { svgInPng } = await import('./graficoPng')
    expect(await svgInPng(SVG, 640, 360)).toBeNull()
  })

  it('un canvas contaminato (SecurityError) dà null', async () => {
    opzioniCanvas = { drawImageLancia: true }
    const { svgInPng } = await import('./graficoPng')
    expect(await svgInPng(SVG, 640, 360)).toBeNull()
    expect(urlLiberati).toHaveLength(1)
    expect(canvasCreati[0].width).toBe(0)
  })

  it('se createObjectURL non funziona dà null', async () => {
    URL.createObjectURL = vi.fn(() => { throw new Error('no') }) as never
    const { svgInPng } = await import('./graficoPng')
    expect(await svgInPng(SVG, 640, 360)).toBeNull()
  })

  it('un\'immagine che non carica né fallisce non blocca l\'export: dopo 10 secondi dà null', async () => {
    vi.useFakeTimers()
    esitoImmagine = 'mai'
    const { svgInPng } = await import('./graficoPng')
    const risultato = svgInPng(SVG, 640, 360)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await risultato).toBeNull()
    expect(urlLiberati).toHaveLength(1)
  })
})

describe('fontDati', () => {
  beforeEach(() => { vi.resetModules() })

  it('legge il woff2 una volta e lo dà come data URL', async () => {
    const fetchFinto = vi.fn(async () => new Response(new Uint8Array([0, 1, 2, 250, 255]), { status: 200 }))
    vi.stubGlobal('fetch', fetchFinto)
    const { fontDati } = await import('./graficoPng')
    const a = await fontDati()
    expect(a).toBe('data:font/woff2;base64,AAEC+v8=')
    expect(await fontDati()).toBe(a)
    expect(fetchFinto).toHaveBeenCalledTimes(1)
  })

  it('legge il file di Atkinson Hyperlegible Mono', async () => {
    const fetchFinto = vi.fn<(url: string) => Promise<Response>>(async () => new Response(new Uint8Array([1]), { status: 200 }))
    vi.stubGlobal('fetch', fetchFinto)
    const { fontDati } = await import('./graficoPng')
    await fontDati()
    expect(String(fetchFinto.mock.calls[0][0])).toContain('atkinson-hyperlegible-mono')
  })

  it('se la lettura fallisce dà null (l\'immagine ripiega su un monospazio di sistema)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const { fontDati } = await import('./graficoPng')
    expect(await fontDati()).toBeNull()
  })

  it('una risposta non riuscita dà null, e al tentativo dopo si riprova', async () => {
    const fetchFinto = vi.fn()
      .mockResolvedValueOnce(new Response('no', { status: 404 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))
    vi.stubGlobal('fetch', fetchFinto)
    const { fontDati } = await import('./graficoPng')
    expect(await fontDati()).toBeNull()
    expect(await fontDati()).toBe('data:font/woff2;base64,AQ==')
  })

  it('un file grande non rompe la conversione in base64', async () => {
    const grande = new Uint8Array(100_000).fill(65)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(grande, { status: 200 })))
    const { fontDati } = await import('./graficoPng')
    const url = await fontDati()
    expect(url?.startsWith('data:font/woff2;base64,')).toBe(true)
    expect(atob((url as string).split(',')[1])).toHaveLength(100_000)
  })
})
