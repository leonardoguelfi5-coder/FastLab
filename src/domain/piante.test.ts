import { describe, it, expect } from 'vitest'
import { generaPiante, trovaPianta, piantaSuccessiva, etichetteNumeriche, prossimaEtichetta } from './piante'
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

  it('piantaSuccessiva', () => {
    const p = piante(['1', '2', '3'])
    expect(piantaSuccessiva(p, p[0].id)?.etichetta).toBe('2')
    expect(piantaSuccessiva(p, p[1].id)?.etichetta).toBe('3')
    expect(piantaSuccessiva(p, p[2].id)).toBeNull()
    expect(piantaSuccessiva(p, 'inesistente')).toBeNull()
  })
  it('piantaSuccessiva segue `ordine`, non la posizione nell\'array', () => {
    const p = piante(['1', '2', '3'])
    const mescolate = [p[2], p[0], p[1]]
    expect(piantaSuccessiva(mescolate, p[0].id)?.etichetta).toBe('2')
    expect(piantaSuccessiva(mescolate, p[2].id)).toBeNull()
  })

  it('etichetteNumeriche', () => {
    expect(etichetteNumeriche(piante(['1', '22', '035']))).toBe(true)
    expect(etichetteNumeriche(piante(['1', 'B3']))).toBe(false)
  })
  it('prossimaEtichetta', () => expect(prossimaEtichetta(piante(['1', '7', 'B3']))).toBe(8))
  it('prossimaEtichetta senza etichette numeriche → 1', () => {
    expect(prossimaEtichetta([])).toBe(1)
    expect(prossimaEtichetta(piante(['B3', 'A']))).toBe(1)
  })
})
