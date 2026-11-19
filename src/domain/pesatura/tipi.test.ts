import { describe, expect, it } from 'vitest'
import { normalizzaSensore } from './tipi'

describe('normalizzaSensore', () => {
  it('Umidità, il vecchio nome, diventa TDR con la stessa unità', () => {
    expect(normalizzaSensore({ tipo: 'umidita', unita: '%' })).toEqual({ tipo: 'tdr', unita: '%' })
  })

  it('tdr e tensione restano come sono', () => {
    expect(normalizzaSensore({ tipo: 'tdr', unita: 'raw' })).toEqual({ tipo: 'tdr', unita: 'raw' })
    expect(normalizzaSensore({ tipo: 'tensione', unita: 'kPa' })).toEqual({ tipo: 'tensione', unita: 'kPa' })
  })

  it('senza sensore resta null', () => {
    expect(normalizzaSensore(null)).toBeNull()
  })
})
