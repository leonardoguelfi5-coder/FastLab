import { describe, it, expect } from 'vitest'
import {
  arrotondaCifre, cifreMassime, cifreSignificativeDi, decimaliDi, decimaliMassimi, formattaCifre, formattaConUnita, formattaMedia,
  formattaNumero, leggiIntero, parseNumero,
} from './numeri'

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
  it.each([
    [0.412, 3], [24.5, 1], [2350, 0], [0.1 + 0.2, 1], [0.0017, 4], [1e-7, 7], [-3.25, 2],
  ])('decimaliDi(%s) = %s', (n, d) => expect(decimaliDi(n)).toBe(d))
  it('decimaliMassimi: la precisione dei dati', () => {
    expect(decimaliMassimi([24.5, 25.1, 9.8])).toBe(1)
    expect(decimaliMassimi([0.41, 0.412])).toBe(3)
    expect(decimaliMassimi([])).toBe(0)
  })
  it.each([
    [0.412, 3], [0.062, 2], [2350, 4], [0.0017, 2], [91.43, 4], [0, 1], [-5.5, 2],
  ])('cifreSignificativeDi(%s) = %s', (n, c) => expect(cifreSignificativeDi(n)).toBe(c))
  it('cifreMassime: le cifre del dato che ne ha di più', () => {
    expect(cifreMassime([0.412, 0.445, 0.062])).toBe(3)
    expect(cifreMassime([])).toBe(1)
  })
  it.each([
    [91.428, 3, '91,4'], [90, 3, '90,0'], [0.017, 2, '0,017'], [9.996, 3, '10,0'], [12345, 3, '12300'], [0.0004567, 2, '0,00046'],
    [-3.456, 2, '-3,5'], [0, 3, '0,00'],
  ])('formattaCifre(%s, %s) = %s', (n, c, testo) => expect(formattaCifre(n, c)).toBe(testo))
  it.each([
    [12345, 3, 12300], [91.428, 3, 91.4], [0.0004567, 2, 0.00046],
  ])('arrotondaCifre(%s, %s) = %s', (n, c, atteso) => expect(arrotondaCifre(n, c)).toBe(atteso))
  it.each([
    [19.8333, 1, '19,8'], [19.8, 2, '19,80'], [41.2351, 2, '41,24'], [40, 0, '40'], [0.1 + 0.2, 1, '0,3'], [-0.001, 1, '0,0'],
  ])('formattaMedia(%s, %s decimali) = %s: i decimali dei dati, zeri compresi', (n, d, testo) => expect(formattaMedia(n, d)).toBe(testo))
  it.each([
    [24.53, 1, '°C', '24,5 °C'], [41.234, 2, null, '41,23'], [80, 0, 'cm', '80 cm'], [3, 0, '', '3'],
  ])('formattaConUnita(%s, %s, %s) = %s', (n, d, unita, testo) => expect(formattaConUnita(n, d, unita)).toBe(testo))
})
