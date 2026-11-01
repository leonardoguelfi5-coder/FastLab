import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creaFileJpeg } from '@/test/jpeg'
import { FOTO_NON_LEGGIBILE, FOTO_TROPPO_GRANDE } from './errori'
import {
  BYTE_OBIETTIVO, comprimi, dataDiScatto, dimensioniRidotte, matriceOrientamento, orientamentoDaApplicare,
} from './immagini'

describe('dimensioniRidotte', () => {
  it('porta il lato lungo a 1600 mantenendo le proporzioni', () => {
    expect(dimensioniRidotte(4000, 3000)).toEqual({ larghezza: 1600, altezza: 1200 })
    expect(dimensioniRidotte(3000, 4000)).toEqual({ larghezza: 1200, altezza: 1600 })
  })
  it('non ingrandisce una foto già piccola', () => {
    expect(dimensioniRidotte(800, 600)).toEqual({ larghezza: 800, altezza: 600 })
    expect(dimensioniRidotte(1600, 1600)).toEqual({ larghezza: 1600, altezza: 1600 })
  })
  it('non scende sotto un pixel per lato', () => {
    expect(dimensioniRidotte(100000, 10)).toEqual({ larghezza: 1600, altezza: 1 })
  })
})

describe('matriceOrientamento', () => {
  // Le otto trasformazioni dell'EXIF per un'immagine salvata di 400 x 300.
  it.each([
    [1, [1, 0, 0, 1, 0, 0]],
    [2, [-1, 0, 0, 1, 400, 0]],
    [3, [-1, 0, 0, -1, 400, 300]],
    [4, [1, 0, 0, -1, 0, 300]],
    [5, [0, 1, 1, 0, 0, 0]],
    [6, [0, 1, -1, 0, 300, 0]],
    [7, [0, -1, -1, 0, 300, 400]],
    [8, [0, -1, 1, 0, 0, 400]],
  ])('orientamento %i', (o, attesa) => {
    expect(matriceOrientamento(o, 400, 300)).toEqual(attesa)
  })

  it.each([6, 8])('l\'orientamento %i porta un angolo del file salvato dove il browser metterebbe l\'immagine dritta', o => {
    // Il pixel in alto a sinistra del file salvato (0,0) finisce su un angolo del canvas verticale 300 x 400.
    const [a, b, c, d, e, f] = matriceOrientamento(o, 400, 300)
    const x = a * 0 + c * 0 + e, y = b * 0 + d * 0 + f
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(300)
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(400)
    // Il lato lungo del file (larghezza 400) diventa verticale: il punto (400,0) cambia y, non x.
    const x2 = a * 400 + e, y2 = b * 400 + f
    expect(x2).toBe(x)
    expect(Math.abs(y2 - y)).toBe(400)
  })
})

describe('orientamentoDaApplicare', () => {
  it('il browser ha già applicato l\'orientamento (dimensioni scambiate): niente da fare', () => {
    expect(orientamentoDaApplicare(6, { l: 4000, a: 3000 }, { l: 3000, a: 4000 })).toBe(1)
  })
  it('il browser non l\'ha applicato (dimensioni uguali al file) e serve ruotare di 90 gradi: va applicato a mano', () => {
    expect(orientamentoDaApplicare(6, { l: 4000, a: 3000 }, { l: 4000, a: 3000 })).toBe(6)
    expect(orientamentoDaApplicare(8, { l: 4000, a: 3000 }, { l: 4000, a: 3000 })).toBe(8)
  })
  it('senza orientamento, con orientamento 1, o con dimensioni sconosciute non si tocca nulla', () => {
    expect(orientamentoDaApplicare(null, { l: 4000, a: 3000 }, { l: 4000, a: 3000 })).toBe(1)
    expect(orientamentoDaApplicare(1, { l: 4000, a: 3000 }, { l: 4000, a: 3000 })).toBe(1)
    expect(orientamentoDaApplicare(6, { l: null, a: null }, { l: 4000, a: 3000 })).toBe(1)
  })
  it('gli orientamenti 2, 3 e 4 non cambiano le dimensioni: non si può dire se il browser li ha applicati, si lasciano al browser', () => {
    for (const o of [2, 3, 4]) expect(orientamentoDaApplicare(o, { l: 4000, a: 3000 }, { l: 4000, a: 3000 })).toBe(1)
  })
  it('una foto quadrata non dice nulla: si lascia al browser', () => {
    expect(orientamentoDaApplicare(6, { l: 2000, a: 2000 }, { l: 2000, a: 2000 })).toBe(1)
  })
})

describe('dataDiScatto', () => {
  it('legge la data dall\'EXIF di un JPEG', async () => {
    expect(await dataDiScatto(creaFileJpeg({ dataOriginale: '2026:10:28 14:05:09' }))).toBe('2026-10-28')
  })
  it('null se non c\'è, se non è un JPEG o se il file è vuoto', async () => {
    expect(await dataDiScatto(creaFileJpeg({ senzaExif: true }))).toBeNull()
    expect(await dataDiScatto(new File(['non sono un\'immagine'], 'a.png', { type: 'image/png' }))).toBeNull()
    expect(await dataDiScatto(new File([], 'vuoto.jpg', { type: 'image/jpeg' }))).toBeNull()
  })
  it('null (e nessuna eccezione) se il file non si riesce a leggere', async () => {
    const f = creaFileJpeg({ dataOriginale: '2026:10:28 14:05:09' })
    vi.spyOn(f, 'slice').mockImplementation(() => { throw new Error('boom') })
    expect(await dataDiScatto(f)).toBeNull()
  })
})

// ---- comprimi, con un canvas e un decodificatore finti (jsdom non ha né l'uno né l'altro) ----

interface CanvasFinto { width: number; height: number; contesto: ContestoFinto; richieste: number[]; dimensioni: number[] }
interface ContestoFinto { chiamate: [string, ...unknown[]][] }

let canvasCreati: CanvasFinto[]
let byteA: (qualita: number) => number

/** Un canvas finto che registra cosa gli si disegna e produce un blob di `byteA(qualità)` byte. */
function installaCanvas(opzioni: { contesto?: boolean } = {}) {
  canvasCreati = []
  const crea = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((nome: string) => {
    if (nome !== 'canvas') return crea(nome)
    const contesto: ContestoFinto = { chiamate: [] }
    const canvas = {
      width: 0, height: 0, contesto, richieste: [] as number[], dimensioni: [] as number[],
      getContext: () => opzioni.contesto === false ? null : new Proxy({}, {
        set: (_t, p, v) => { contesto.chiamate.push(['set:' + String(p), v]); return true },
        get: (_t, p) => (...args: unknown[]) => { contesto.chiamate.push([String(p), ...args]) },
      }),
      toBlob(cb: (b: Blob | null) => void, tipo: string, qualita: number) {
        canvas.richieste.push(qualita)
        canvas.dimensioni = [canvas.width, canvas.height] // il canvas si azzera a fine lavoro: le dimensioni si leggono qui
        expect(tipo).toBe('image/jpeg')
        cb(new Blob([new Uint8Array(byteA(qualita))], { type: tipo }))
      },
    }
    canvasCreati.push(canvas)
    return canvas as unknown as HTMLCanvasElement
  }) as typeof document.createElement)
}

function installaBitmap(l: number, a: number) {
  const chiudi = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: l, height: a, close: chiudi })))
  return chiudi
}

const chiamata = (c: CanvasFinto, nome: string) => c.contesto.chiamate.find(x => x[0] === nome)

beforeEach(() => { byteA = () => 100_000; installaCanvas() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('comprimi', () => {
  it('riduce una foto orizzontale a 1600 px sul lato lungo e restituisce il JPEG con le dimensioni finali', async () => {
    const chiudi = installaBitmap(4000, 3000)

    const r = await comprimi(creaFileJpeg({ larghezza: 4000, altezza: 3000 }))

    expect([r.larghezza, r.altezza]).toEqual([1600, 1200])
    expect(r.blob.type).toBe('image/jpeg')
    expect(canvasCreati[0].dimensioni).toEqual([1600, 1200])
    expect(chiamata(canvasCreati[0], 'drawImage')?.slice(1)).toEqual([expect.anything(), 0, 0, 1600, 1200])
    expect(chiamata(canvasCreati[0], 'setTransform')).toBeUndefined()
    expect(chiudi).toHaveBeenCalled() // la bitmap non resta in memoria
  })

  it('azzera il canvas a fine lavoro e disegna con lo smoothing di qualità alta', async () => {
    installaBitmap(4000, 3000)
    await comprimi(creaFileJpeg())
    expect([canvasCreati[0].width, canvasCreati[0].height]).toEqual([0, 0])
    const nomi = canvasCreati[0].contesto.chiamate.map(c => c[0])
    expect(canvasCreati[0].contesto.chiamate).toContainEqual(['set:imageSmoothingEnabled', true])
    expect(canvasCreati[0].contesto.chiamate).toContainEqual(['set:imageSmoothingQuality', 'high'])
    expect(nomi.indexOf('set:imageSmoothingQuality')).toBeLessThan(nomi.indexOf('drawImage'))
  })

  it('riempie lo sfondo di bianco prima di disegnare (un PNG trasparente non diventa nero)', async () => {
    installaBitmap(800, 600)
    await comprimi(new File(['x'], 'a.png', { type: 'image/png' }))
    const nomi = canvasCreati[0].contesto.chiamate.map(c => c[0])
    expect(nomi.indexOf('fillRect')).toBeGreaterThanOrEqual(0)
    expect(nomi.indexOf('fillRect')).toBeLessThan(nomi.indexOf('drawImage'))
  })

  it('non ingrandisce una foto piccola', async () => {
    installaBitmap(800, 600)
    const r = await comprimi(creaFileJpeg({ larghezza: 800, altezza: 600 }))
    expect([r.larghezza, r.altezza]).toEqual([800, 600])
  })

  it('parte da qualità 0,85 e si ferma appena il file sta sotto i 350 KB', async () => {
    installaBitmap(4000, 3000)
    byteA = q => (q >= 0.8 ? 500_000 : q >= 0.75 ? 400_000 : 300_000)
    const r = await comprimi(creaFileJpeg())
    expect(canvasCreati[0].richieste).toEqual([0.85, 0.8, 0.75, 0.7])
    expect(r.blob.size).toBe(300_000)
    expect(r.blob.size).toBeLessThanOrEqual(BYTE_OBIETTIVO)
  })

  it('non scende sotto la qualità 0,6 anche se il file resta grande', async () => {
    installaBitmap(4000, 3000)
    byteA = () => 900_000
    const r = await comprimi(creaFileJpeg())
    const q = canvasCreati[0].richieste
    expect(q[0]).toBe(0.85)
    expect(q[q.length - 1]).toBe(0.6)
    expect(Math.min(...q)).toBe(0.6)
    expect(r.blob.size).toBe(900_000)
  })

  describe('foto verticali', () => {
    it('il browser ha già raddrizzato la foto (createImageBitmap 3000x4000, EXIF 6 salvato 4000x3000): resta verticale, senza ruotare due volte', async () => {
      installaBitmap(3000, 4000)
      const r = await comprimi(creaFileJpeg({ orientamento: 6, larghezza: 4000, altezza: 3000 }))
      expect([r.larghezza, r.altezza]).toEqual([1200, 1600])
      expect(canvasCreati[0].dimensioni).toEqual([1200, 1600])
      expect(chiamata(canvasCreati[0], 'setTransform')).toBeUndefined()
      expect(chiamata(canvasCreati[0], 'drawImage')?.slice(2)).toEqual([0, 0, 1200, 1600])
    })

    it('il browser non raddrizza (bitmap 4000x3000 con EXIF 6): lo fa l\'app e la foto esce verticale', async () => {
      installaBitmap(4000, 3000)
      const r = await comprimi(creaFileJpeg({ orientamento: 6, larghezza: 4000, altezza: 3000 }))
      expect([r.larghezza, r.altezza]).toEqual([1200, 1600])
      expect(canvasCreati[0].dimensioni).toEqual([1200, 1600])
      // Il file salvato scalato è 1600 x 1200; la rotazione di 90 gradi in senso orario porta l'angolo a x = altezza.
      expect(chiamata(canvasCreati[0], 'setTransform')?.slice(1)).toEqual([0, 1, -1, 0, 1200, 0])
      expect(chiamata(canvasCreati[0], 'drawImage')?.slice(2)).toEqual([0, 0, 1600, 1200])
    })

    it('anche l\'orientamento 8 (a mano) dà una foto verticale', async () => {
      installaBitmap(4000, 3000)
      const r = await comprimi(creaFileJpeg({ orientamento: 8, larghezza: 4000, altezza: 3000 }))
      expect([r.larghezza, r.altezza]).toEqual([1200, 1600])
      expect(chiamata(canvasCreati[0], 'setTransform')?.slice(1)).toEqual([0, -1, 1, 0, 0, 1600])
    })

    it('una foto scattata già verticale e salvata 3000x4000 (EXIF 1) resta verticale', async () => {
      installaBitmap(3000, 4000)
      const r = await comprimi(creaFileJpeg({ orientamento: 1, larghezza: 3000, altezza: 4000 }))
      expect([r.larghezza, r.altezza]).toEqual([1200, 1600])
    })
  })

  describe('senza createImageBitmap', () => {
    function installaImmagine(l: number, a: number, riesce = true) {
      const revoca = vi.fn()
      vi.stubGlobal('createImageBitmap', undefined)
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:finto')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoca)
      vi.stubGlobal('Image', class {
        naturalWidth = l
        naturalHeight = a
        src = ''
        decode() { return riesce ? Promise.resolve() : Promise.reject(new Error('formato non supportato')) }
      })
      return revoca
    }

    it('usa un\'immagine HTML, comprime allo stesso modo e libera l\'indirizzo temporaneo', async () => {
      const revoca = installaImmagine(4000, 3000)
      const r = await comprimi(creaFileJpeg({ larghezza: 4000, altezza: 3000 }))
      expect([r.larghezza, r.altezza]).toEqual([1600, 1200])
      expect(revoca).toHaveBeenCalledWith('blob:finto')
    })

    it('applica a mano anche qui un orientamento che il browser non ha applicato', async () => {
      installaImmagine(4000, 3000)
      const r = await comprimi(creaFileJpeg({ orientamento: 6, larghezza: 4000, altezza: 3000 }))
      expect([r.larghezza, r.altezza]).toEqual([1200, 1600])
      expect(chiamata(canvasCreati[0], 'setTransform')).toBeDefined()
    })

    it('a fine lavoro svuota src dell\'immagine, per liberarne i pixel', async () => {
      installaImmagine(4000, 3000)
      const istanze: { src: string }[] = []
      const Base = (globalThis as unknown as { Image: new () => { src: string } }).Image
      vi.stubGlobal('Image', class extends Base { constructor() { super(); istanze.push(this) } })
      await comprimi(creaFileJpeg({ larghezza: 4000, altezza: 3000 }))
      expect(istanze).toHaveLength(1)
      expect(istanze[0].src).toBe('')
    })

    it('se anche l\'immagine non si apre dice che la foto non è leggibile', async () => {
      const revoca = installaImmagine(4000, 3000, false)
      await expect(comprimi(creaFileJpeg())).rejects.toThrow(FOTO_NON_LEGGIBILE)
      expect(revoca).toHaveBeenCalled()
    })
  })

  it('se createImageBitmap rifiuta il file ci prova con un\'immagine HTML', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('InvalidStateError') }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:finto')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('Image', class { naturalWidth = 2000; naturalHeight = 1000; src = ''; decode() { return Promise.resolve() } })
    const r = await comprimi(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    expect([r.larghezza, r.altezza]).toEqual([1600, 800])
  })

  it('un file che nessuno dei due metodi apre dà il messaggio per l\'utente', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('no') }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:finto')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('Image', class { src = ''; decode() { return Promise.reject(new Error('no')) } })
    await expect(comprimi(new File(['x'], 'a.heic'))).rejects.toThrow(FOTO_NON_LEGGIBILE)
  })

  it('un file molto grande (oltre 15 MB) che non si decodifica ha un messaggio suo: la memoria del telefono', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('no') }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:finto')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('Image', class { src = ''; decode() { return Promise.reject(new Error('no')) } })
    const grande = new File([new Uint8Array(16 * 1024 * 1024)], 'enorme.jpg', { type: 'image/jpeg' })
    await expect(comprimi(grande)).rejects.toThrow(FOTO_TROPPO_GRANDE)
    await expect(comprimi(new File(['x'], 'piccolo.jpg'))).rejects.toThrow(FOTO_NON_LEGGIBILE)
  })

  it('senza contesto 2D non si può comprimere: errore chiaro, bitmap liberata', async () => {
    installaCanvas({ contesto: false })
    const chiudi = installaBitmap(800, 600)
    await expect(comprimi(creaFileJpeg())).rejects.toThrow(FOTO_NON_LEGGIBILE)
    expect(chiudi).toHaveBeenCalled()
  })

  it('un\'immagine senza dimensioni (decodifica vuota) non è leggibile', async () => {
    installaBitmap(0, 0)
    await expect(comprimi(creaFileJpeg())).rejects.toThrow(FOTO_NON_LEGGIBILE)
  })

  it('se toBlob non produce nulla è un errore, non un file vuoto', async () => {
    installaBitmap(800, 600)
    vi.mocked(document.createElement).mockImplementation(((nome: string) => ({
      width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, setTransform() {}, fillStyle: '' }),
      toBlob: (cb: (b: Blob | null) => void) => cb(null), nome,
    })) as never)
    await expect(comprimi(creaFileJpeg())).rejects.toThrow(FOTO_NON_LEGGIBILE)
  })
})
