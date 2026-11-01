import { describe, expect, it } from 'vitest'
import { leggiArrivoDiario } from './percorsi'

describe('leggiArrivoDiario', () => {
  it('senza stato, o con uno stato che non è un oggetto, non c\'è nulla', () => {
    expect(leggiArrivoDiario(null, 'E')).toEqual({})
    expect(leggiArrivoDiario(undefined, 'E')).toEqual({})
    expect(leggiArrivoDiario('apriNota', 'E')).toEqual({})
    expect(leggiArrivoDiario(42, 'E')).toEqual({})
  })

  it('tiene i testi che conosce e scarta il resto', () => {
    expect(leggiArrivoDiario({ apriNota: 'n1', nuovaPerPianta: 'p1', altro: 1 }, 'E')).toEqual({ apriNota: 'n1', nuovaPerPianta: 'p1' })
    expect(leggiArrivoDiario({ apriNota: 7, nuovaPerPianta: null }, 'E')).toEqual({})
  })

  it('un ritorno vale solo se resta dentro l\'esperimento', () => {
    expect(leggiArrivoDiario({ ritorno: '/esperimenti/E/piante/p1' }, 'E')).toEqual({ ritorno: '/esperimenti/E/piante/p1' })
    expect(leggiArrivoDiario({ ritorno: '/esperimenti/F/piante/p1' }, 'E')).toEqual({})
    expect(leggiArrivoDiario({ ritorno: '/esperimenti/EF/piante/p1' }, 'E')).toEqual({})
    expect(leggiArrivoDiario({ ritorno: 'https://altro.example/esperimenti/E/x' }, 'E')).toEqual({})
    expect(leggiArrivoDiario({ ritorno: '//altro.example' }, 'E')).toEqual({})
  })
})
