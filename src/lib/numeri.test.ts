import { describe, it, expect } from 'vitest'
import { parseNumero, formattaNumero } from './numeri'

describe('numeri', () => {
  it.each([
    ['24,5', 24.5],
    ['24.5', 24.5],
    [' 7 ', 7],
    ['-3,5', -3.5],
    ['24,', 24],
    ['0', 0],
  ])('parseNumero(%s) = %s', (raw, n) => expect(parseNumero(raw)).toBe(n))
  it('vuoto → null', () => {
    expect(parseNumero('')).toBeNull()
    expect(parseNumero('  ')).toBeNull()
  })
  it.each(['abc', '1,2,3', '12a', ','])('non valido %s → NaN', (raw) =>
    expect(parseNumero(raw)).toBeNaN(),
  )
  it('formattaNumero', () => {
    expect(formattaNumero(24.5)).toBe('24,5')
    expect(formattaNumero(null)).toBe('')
  })
})
