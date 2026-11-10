import { describe, expect, it } from 'vitest'
import { creaJpeg } from '@/test/jpeg'
import { leggiJpeg } from './exif'

describe('leggiJpeg', () => {
  it('legge orientamento, data di scatto e dimensioni di un JPEG con EXIF (big endian)', () => {
    const r = leggiJpeg(creaJpeg({ orientamento: 6, dataOriginale: '2026:10:28 14:05:09', larghezza: 4000, altezza: 3000 }))
    expect(r).toEqual({ orientamento: 6, dataScatto: '2026-10-28', larghezza: 4000, altezza: 3000 })
  })

  it('legge anche il little endian (le fotocamere Android)', () => {
    const r = leggiJpeg(creaJpeg({ ordine: 'II', orientamento: 8, dataOriginale: '2025:01:02 03:04:05', larghezza: 3000, altezza: 4000 }))
    expect(r).toEqual({ orientamento: 8, dataScatto: '2025-01-02', larghezza: 3000, altezza: 4000 })
  })

  it('senza data di scatto usa quella di digitalizzazione', () => {
    expect(leggiJpeg(creaJpeg({ dataDigitalizzata: '2026:03:04 10:00:00' })).dataScatto).toBe('2026-03-04')
  })

  it('preferisce la data di scatto a quella di digitalizzazione', () => {
    const r = leggiJpeg(creaJpeg({ dataOriginale: '2026:03:04 10:00:00', dataDigitalizzata: '2026:03:09 10:00:00' }))
    expect(r.dataScatto).toBe('2026-03-04')
  })

  it('un JPEG senza EXIF dà solo le dimensioni', () => {
    expect(leggiJpeg(creaJpeg({ senzaExif: true, larghezza: 800, altezza: 600 })))
      .toEqual({ orientamento: null, dataScatto: null, larghezza: 800, altezza: 600 })
  })

  it('un EXIF senza orientamento né data dà null per entrambi', () => {
    const r = leggiJpeg(creaJpeg({ dataOriginale: undefined }))
    expect(r.orientamento).toBeNull()
    expect(r.dataScatto).toBeNull()
  })

  it.each(['0000:00:00 00:00:00', '2026:13:01 10:00:00', '2026:02:30 10:00:00', 'ieri sera mattina!!', '    :  :     :  :  '])(
    'scarta la data non valida "%s"', d => {
      expect(leggiJpeg(creaJpeg({ dataOriginale: d })).dataScatto).toBeNull()
    },
  )

  it('scarta un orientamento fuori da 1..8', () => {
    expect(leggiJpeg(creaJpeg({ orientamento: 0 })).orientamento).toBeNull()
    expect(leggiJpeg(creaJpeg({ orientamento: 9 })).orientamento).toBeNull()
  })

  it('non è un JPEG: tutto null, senza eccezioni', () => {
    const vuoto = { orientamento: null, dataScatto: null, larghezza: null, altezza: null }
    expect(leggiJpeg(new Uint8Array([]))).toEqual(vuoto)
    expect(leggiJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toEqual(vuoto)
    expect(leggiJpeg(new Uint8Array([0xff]))).toEqual(vuoto)
  })

  it('un file troncato in ogni punto non dà eccezioni', () => {
    const intero = creaJpeg({ orientamento: 6, dataOriginale: '2026:10:28 14:05:09' })
    for (let n = 0; n <= intero.length; n++) {
      expect(() => leggiJpeg(intero.subarray(0, n))).not.toThrow()
    }
  })

  it('un EXIF con offset fuori dal file non dà eccezioni né valori inventati', () => {
    const j = creaJpeg({ orientamento: 6, dataOriginale: '2026:10:28 14:05:09' })
    // Rovina l'offset iniziale dell'IFD0 (byte 4..7 del TIFF, dopo "FFD8 FFE1 LL LL Exif\0\0 MM\0* ").
    const rotto = Uint8Array.from(j)
    const tiff = 2 + 2 + 2 + 6
    rotto.set([0x7f, 0xff, 0xff, 0xff], tiff + 4)
    expect(() => leggiJpeg(rotto)).not.toThrow()
    expect(leggiJpeg(rotto).orientamento).toBeNull()
  })

  it('un conteggio di voci enorme non fa girare a lungo né va fuori dal file', () => {
    const j = Uint8Array.from(creaJpeg({ orientamento: 6 }))
    const tiff = 2 + 2 + 2 + 6
    j.set([0xff, 0xff], tiff + 8) // numero di voci dell'IFD0 = 65535
    expect(() => leggiJpeg(j)).not.toThrow()
  })
})
