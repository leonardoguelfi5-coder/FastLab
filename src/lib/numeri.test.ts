import { describe, it, expect } from 'vitest'
import { parseNumero, formattaNumero, leggiIntero } from './numeri'

describe('numeri', () => {
  it.each([
    ['24,5', 24.5],
    ['24.5', 24.5],
    [' 7 ', 7],
    ['-3,5', -3.5],
    ['24,', 24],
    ['0', 0],
    [',5', 0.5],
    ['.5', 0.5],
    ['-,5', -0.5],
    ['-.5', -0.5],
  ])('parseNumero(%s) = %s', (raw, n) => expect(parseNumero(raw)).toBe(n))
  it('vuoto → null', () => {
    expect(parseNumero('')).toBeNull()
    expect(parseNumero('  ')).toBeNull()
  })
  it.each(['abc', '1,2,3', '12a', ',', '.', '-', '-,', ',,5'])('non valido %s → NaN', (raw) =>
    expect(parseNumero(raw)).toBeNaN(),
  )
  it('formattaNumero', () => {
    expect(formattaNumero(24.5)).toBe('24,5')
    expect(formattaNumero(null)).toBe('')
  })
  it.each([
    ['1', 1], [' 20 ', 20], ['007', 7],
  ])('leggiIntero(%s, 1, 20) = %s', (raw, n) => expect(leggiIntero(raw, 1, 20)).toBe(n))
  it.each(['', '0', '21', '-1', '2,5', '2.5', '2,0', 'tre', '1e1', '+3'])('leggiIntero(%s, 1, 20) → null', (raw) =>
    expect(leggiIntero(raw, 1, 20)).toBeNull(),
  )
  it('leggiIntero accetta lo zero se il minimo è zero', () => expect(leggiIntero('0', 0, 10)).toBe(0))
})
