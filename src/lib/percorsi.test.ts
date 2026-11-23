import { describe, expect, it } from 'vitest'
import {
  leggiArrivoDiario, percorsoDataset, percorsoDellaPesata, percorsoDellaSessione, percorsoElencoDi, percorsoEsporta,
  percorsoNuovaTaratura, percorsoPesataTaratura, percorsoSessioneTaratura, percorsoTaratura,
} from './percorsi'

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

describe('percorsi della Taratura', () => {
  it('la Taratura sta nel Laboratorio', () => {
    expect(percorsoTaratura('E')).toBe('/esperimenti/E/laboratorio/taratura')
  })

  it('una nuova taratura, con o senza la sessione da cui ripartire', () => {
    expect(percorsoNuovaTaratura('E', 'S')).toBe('/esperimenti/E/laboratorio/taratura/nuova?da=S')
    expect(percorsoNuovaTaratura('E')).toBe('/esperimenti/E/laboratorio/taratura/nuova')
  })

  it('una sessione di taratura e la pesata di una sua fase, con il campione e la replica da cui ripartire', () => {
    expect(percorsoSessioneTaratura('E', 'S')).toBe('/esperimenti/E/laboratorio/taratura/S')
    expect(percorsoPesataTaratura('E', 'S', 'asciugatura', { campione: 'c1', replica: 1 }))
      .toBe('/esperimenti/E/laboratorio/taratura/S/pesa/asciugatura?campione=c1&replica=1')
    expect(percorsoPesataTaratura('E', 'S', 'capacita_campo')).toBe('/esperimenti/E/laboratorio/taratura/S/pesa/capacita_campo')
  })

  it('gli id si codificano come negli altri percorsi', () => {
    expect(percorsoSessioneTaratura('a/b', 'c/d')).toBe('/esperimenti/a%2Fb/laboratorio/taratura/c%2Fd')
    expect(percorsoPesataTaratura('E', 'S', 'secco', { campione: 'x/y', replica: 2 }))
      .toBe('/esperimenti/E/laboratorio/taratura/S/pesa/secco?campione=x%2Fy&replica=2')
  })

  it('una sessione di tipo vasi va alla Taratura, le altre alla Pesatura', () => {
    expect(percorsoDellaSessione('E', { id: 'S', tipo: 'vasi' })).toBe('/esperimenti/E/laboratorio/taratura/S')
    expect(percorsoDellaSessione('E', { id: 'S', tipo: 'rwc' })).toBe('/esperimenti/E/laboratorio/pesatura/S')
  })

  it('la pesata segue lo stesso criterio della sessione', () => {
    expect(percorsoDellaPesata('E', { id: 'S', tipo: 'vasi' }, 'fresco')).toBe('/esperimenti/E/laboratorio/taratura/S/pesa/fresco')
    expect(percorsoDellaPesata('E', { id: 'S', tipo: 'rwc' }, 'fresco', { campione: 'c1', replica: 3 }))
      .toBe('/esperimenti/E/laboratorio/pesatura/S/pesa/fresco?campione=c1&replica=3')
  })

  it("l'elenco va alla Taratura per i vasi e alla Pesatura per gli altri tipi", () => {
    expect(percorsoElencoDi('E', 'vasi')).toBe('/esperimenti/E/laboratorio/taratura')
    expect(percorsoElencoDi('E', 'aliquota')).toBe('/esperimenti/E/laboratorio/pesatura')
    expect(percorsoElencoDi('E', 'sostanza_secca')).toBe('/esperimenti/E/laboratorio/pesatura')
  })
})
