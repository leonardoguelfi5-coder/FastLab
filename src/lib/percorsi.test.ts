import { describe, expect, it } from 'vitest'
import { leggiArrivoDiario, percorsoDataset, percorsoEsporta } from './percorsi'

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

describe('percorsoDataset e percorsoEsporta', () => {
  it('portano alle due sezioni dell\'esperimento', () => {
    expect(percorsoDataset('E')).toBe('/esperimenti/E/dataset')
    expect(percorsoEsporta('E')).toBe('/esperimenti/E/esporta')
  })

  it('l\'id si codifica come negli altri percorsi', () => {
    expect(percorsoDataset('a/b')).toBe('/esperimenti/a%2Fb/dataset')
  })

  it('portano con sé i filtri della vista, con o senza il punto interrogativo, o come URLSearchParams', () => {
    expect(percorsoEsporta('E', 's=1&per=4s')).toBe('/esperimenti/E/esporta?s=1&per=4s')
    expect(percorsoEsporta('E', '?s=1&per=4s')).toBe('/esperimenti/E/esporta?s=1&per=4s')
    expect(percorsoDataset('E', new URLSearchParams({ cerca: '3, 12' }))).toBe('/esperimenti/E/dataset?cerca=3%2C+12')
  })

  it('una ricerca vuota non aggiunge nulla', () => {
    expect(percorsoDataset('E', '')).toBe('/esperimenti/E/dataset')
    expect(percorsoDataset('E', '?')).toBe('/esperimenti/E/dataset')
    expect(percorsoEsporta('E', new URLSearchParams())).toBe('/esperimenti/E/esporta')
  })
})
