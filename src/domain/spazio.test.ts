import { describe, expect, it } from 'vitest'
import { LIMITE_DATABASE_BYTE, LIMITE_FOTO_BYTE, megabyte, quota } from './spazio'
import { LIMITE_SPAZIO_BYTE } from './foto'

describe('limiti del piano gratuito', () => {
  it('database 500 MB e foto 1000 MB, per tutto il progetto', () => {
    expect(LIMITE_DATABASE_BYTE).toBe(500_000_000)
    expect(LIMITE_FOTO_BYTE).toBe(1_000_000_000)
  })

  it('il limite delle foto di domain/foto è un rimando a quello di qui', () => {
    expect(LIMITE_SPAZIO_BYTE).toBe(LIMITE_FOTO_BYTE)
  })
})

describe('quota', () => {
  it('dà la percentuale usata del limite, arrotondata, e avvisa solo oltre l\'80%', () => {
    expect(quota(0, LIMITE_FOTO_BYTE)).toEqual({ percentuale: 0, oltreSoglia: false })
    expect(quota(456_700_000, LIMITE_FOTO_BYTE)).toEqual({ percentuale: 46, oltreSoglia: false })
    // Esattamente l'80% non è "oltre".
    expect(quota(800_000_000, LIMITE_FOTO_BYTE)).toEqual({ percentuale: 80, oltreSoglia: false })
    expect(quota(800_000_001, LIMITE_FOTO_BYTE).oltreSoglia).toBe(true)
    expect(quota(38_000_000, LIMITE_DATABASE_BYTE)).toEqual({ percentuale: 8, oltreSoglia: false })
    expect(quota(410_000_000, LIMITE_DATABASE_BYTE)).toEqual({ percentuale: 82, oltreSoglia: true })
  })

  it('oltre il limite la percentuale supera 100: il numero è onesto (la barra si ferma da sé)', () => {
    expect(quota(1_200_000_000, LIMITE_FOTO_BYTE)).toEqual({ percentuale: 120, oltreSoglia: true })
  })
})

describe('megabyte', () => {
  it('megabyte decimali (1 MB = 1 000 000 byte) interi, come le barre: "38 / 500 MB"', () => {
    expect(megabyte(38_400_000)).toBe('38')
    expect(megabyte(210_000_000)).toBe('210')
    expect(megabyte(LIMITE_FOTO_BYTE)).toBe('1000')
    expect(megabyte(LIMITE_DATABASE_BYTE)).toBe('500')
  })

  it('sotto i 10 MB un decimale, con la virgola: pochi file non diventano "0"', () => {
    expect(megabyte(0)).toBe('0')
    expect(megabyte(350_000)).toBe('0,4')
    expect(megabyte(1_830_000)).toBe('1,8')
    expect(megabyte(9_940_000)).toBe('9,9')
  })
})
