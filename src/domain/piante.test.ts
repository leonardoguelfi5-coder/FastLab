import { describe, it, expect } from 'vitest'
import { generaPiante, trovaPianta, etichetteNumeriche, prossimaEtichetta, riordinaPiante } from './piante'
import { piante } from './test-helpers'

describe('piante', () => {
  it('generaPiante numera in sequenza', () =>
    expect(generaPiante([{ trattamento_id: 'a', n: 2 }, { trattamento_id: 'b', n: 1 }], 101).map(p => [p.etichetta, p.trattamento_id]))
      .toEqual([['101', 'a'], ['102', 'a'], ['103', 'b']]))
  it('generaPiante parte da 1, ordine progressivo, blocco null', () => {
    const p = generaPiante([{ trattamento_id: 'a', n: 3 }])
    expect(p.map(x => x.etichetta)).toEqual(['1', '2', '3'])
    expect(p.map(x => x.ordine)).toEqual([0, 1, 2])
    expect(p.every(x => x.blocco === null)).toBe(true)
    expect(new Set(p.map(x => x.id)).size).toBe(3)
  })

  it.each([[' 35 ', '35'], ['035', '35'], ['b3-12', 'B3-12']])('trovaPianta(%s) → %s', (input, etichetta) =>
    expect(trovaPianta(piante(['35', 'B3-12']), input)?.etichetta).toBe(etichetta))
  it('trovaPianta preferisce la corrispondenza esatta a quella numerica', () =>
    expect(trovaPianta(piante(['035', '35']), '035')?.etichetta).toBe('035'))
  it('trovaPianta inesistente → null', () => expect(trovaPianta(piante(['35']), '99')).toBeNull())
  it('trovaPianta con input vuoto → null', () => expect(trovaPianta(piante(['35']), '  ')).toBeNull())

  it('etichetteNumeriche', () => {
    expect(etichetteNumeriche(piante(['1', '22', '035']))).toBe(true)
    expect(etichetteNumeriche(piante(['1', 'B3']))).toBe(false)
  })
  it('prossimaEtichetta', () => expect(prossimaEtichetta(piante(['1', '7', 'B3']))).toBe(8))
  it('prossimaEtichetta senza etichette numeriche → 1', () => {
    expect(prossimaEtichetta([])).toBe(1)
    expect(prossimaEtichetta(piante(['B3', 'A']))).toBe(1)
  })
  it('gli spazi attorno a un\'etichetta non contano: " 35 " è il numero 35', () => {
    expect(etichetteNumeriche(piante(['1', ' 35 ']))).toBe(true)
    expect(prossimaEtichetta(piante(['1', ' 35 ']))).toBe(36)
  })
})

describe('riordinaPiante', () => {
  const base = piante(['a', 'b', 'c', 'd'])

  it('lo stesso ordine non cambia nulla', () => {
    expect(riordinaPiante(base, base.map(p => p.id))).toEqual([])
  })

  it('scambiando due piante vicine cambiano solo quelle due, con gli ordini che avevano', () => {
    const cambiate = riordinaPiante(base, [base[1].id, base[0].id, base[2].id, base[3].id])
    expect(cambiate.map(p => [p.etichetta, p.ordine])).toEqual([['b', 0], ['a', 1]])
  })

  it('usa gli ordini che ci sono già, anche con buchi (dopo piante rimosse)', () => {
    const buchi = base.map((p, i) => ({ ...p, ordine: i * 10 }))
    const cambiate = riordinaPiante(buchi, [buchi[3].id, buchi[0].id, buchi[1].id, buchi[2].id])
    expect(cambiate.map(p => [p.etichetta, p.ordine])).toEqual([['d', 0], ['a', 10], ['b', 20], ['c', 30]])
  })

  it('una pianta che non c\'è nel nuovo ordine, o un id sconosciuto, non cambia niente', () => {
    expect(riordinaPiante(base, [base[1].id, base[0].id])).toEqual([])
    expect(riordinaPiante(base, [...base.map(p => p.id), 'x'])).toEqual([])
  })
})
