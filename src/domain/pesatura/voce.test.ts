import { describe, expect, it } from 'vitest'
import { fraseSalvato, leggiComando, leggiNumeroParlato } from './voce'

describe('leggiNumeroParlato: le cifre del riconoscimento', () => {
  it.each([
    ['53', 53],
    ['0,12', 0.12],
    ['0.12', 0.12],
    ['53.2', 53.2],
    ['2.350', 2350],
    ['1.234.567', 1234567],
    ['0,1023', 0.1023],
  ])('%s → %s', (testo, atteso) => {
    expect(leggiNumeroParlato(testo)).toBe(atteso)
  })

  it('il punto è delle migliaia solo con esattamente tre cifre dopo', () => {
    expect(leggiNumeroParlato('2.35')).toBe(2.35)
    expect(leggiNumeroParlato('2.3500')).toBe(2.35)
  })

  it('con la virgola il punto non è delle migliaia: il numero non si capisce', () => {
    expect(leggiNumeroParlato('2.350,5')).toBeNull()
  })

  it('uno zero davanti non è un gruppo delle migliaia: 0.123 è un decimale', () => {
    expect(leggiNumeroParlato('0.123')).toBe(0.123)
  })
})

describe('leggiNumeroParlato: le parole', () => {
  it.each([
    ['zero', 0],
    ['uno', 1],
    ['dieci', 10],
    ['diciassette', 17],
    ['venti', 20],
    ['ventuno', 21],
    ['ventotto', 28],
    ['ventitré', 23],
    ['cinquantatré', 53],
    ['cinquantatre', 53],
    ['novantanove', 99],
    ['cento', 100],
    ['centotré', 103],
    ['centotto', 108],
    ['centottanta', 180],
    ['duecento', 200],
    ['novecentonovantanove', 999],
    ['mille', 1000],
    ['milleuno', 1001],
    ['milleduecento', 1200],
    ['duemila', 2000],
    ['duemilatrecentocinquanta', 2350],
    ['novemilanovecentonovantanove', 9999],
  ])('%s → %s', (testo, atteso) => {
    expect(leggiNumeroParlato(testo)).toBe(atteso)
  })

  it('maiuscole e spazi in più non contano', () => {
    expect(leggiNumeroParlato('  Cinquantatré ')).toBe(53)
  })
})

describe('leggiNumeroParlato: la virgola', () => {
  it.each([
    ['zero virgola uno due', 0.12],
    ['zero virgola dodici', 0.12],
    ['zero virgola zero cinque', 0.05],
    ['zero virgola cinque', 0.5],
    ['cinquantatré virgola due', 53.2],
    ['zero virgola uno zero due tre', 0.1023],
    ['53 virgola 2', 53.2],
    ['0 virgola 12', 0.12],
  ])('%s → %s', (testo, atteso) => {
    expect(leggiNumeroParlato(testo)).toBe(atteso)
  })

  it('dopo la virgola, più parole non tutte di una cifra non si capiscono', () => {
    expect(leggiNumeroParlato('zero virgola dodici tre')).toBeNull()
  })
})

describe('leggiNumeroParlato: meno', () => {
  it('meno davanti dà un numero negativo (le tensioni del sensore)', () => {
    expect(leggiNumeroParlato('meno trenta')).toBe(-30)
    expect(leggiNumeroParlato('-30')).toBe(-30)
    expect(leggiNumeroParlato('meno 5,5')).toBe(-5.5)
  })
})

describe('leggiNumeroParlato: null', () => {
  it.each([
    [''],
    ['   '],
    ['zero virgola'],
    ['virgola'],
    ['virgola cinque'],
    ['cinquanta tre'],
    ['53 2'],
    ['pippo'],
    ['cinquantapippo'],
    ['meno'],
    ['diecimila'],
    ['venti virgola virgola tre'],
    ['5,'],
    ['5..3'],
  ])('%j → null', testo => {
    expect(leggiNumeroParlato(testo)).toBeNull()
  })
})

describe('leggiComando', () => {
  it('<numero> avanti', () => {
    expect(leggiComando('53 avanti', false)).toEqual({ tipo: 'avanti', valore: 53, lettura: null })
    expect(leggiComando('0,1023 avanti', false)).toEqual({ tipo: 'avanti', valore: 0.1023, lettura: null })
    expect(leggiComando('zero virgola uno due avanti', false)).toEqual({ tipo: 'avanti', valore: 0.12, lettura: null })
  })

  it('senza distinguere maiuscole', () => {
    expect(leggiComando('53 Avanti', false)).toEqual({ tipo: 'avanti', valore: 53, lettura: null })
    expect(leggiComando('Indietro', false)).toEqual({ tipo: 'indietro' })
  })

  it('indietro ovunque nella frase', () => {
    expect(leggiComando('indietro', false)).toEqual({ tipo: 'indietro' })
    expect(leggiComando('torna indietro', false)).toEqual({ tipo: 'indietro' })
    expect(leggiComando('53 indietro avanti', true)).toEqual({ tipo: 'indietro' })
  })

  it('i casi ambigui o parziali non salvano un numero inventato', () => {
    expect(leggiComando('avanti', false)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('cinquanta tre avanti', false)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('zero virgola avanti', false)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('53', false)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('53 avanti 2', false)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('', false)).toEqual({ tipo: 'non_capito' })
  })

  it('53.2 avanti vale 53.2', () => {
    expect(leggiComando('53.2 avanti', false)).toEqual({ tipo: 'avanti', valore: 53.2, lettura: null })
  })

  it('un peso negativo non si capisce', () => {
    expect(leggiComando('meno 5 avanti', false)).toEqual({ tipo: 'non_capito' })
  })

  it('con la lettura: peso <n> tensione <n> avanti', () => {
    expect(leggiComando('peso 2350 tensione 30 avanti', true)).toEqual({ tipo: 'avanti', valore: 2350, lettura: 30 })
  })

  it('con la lettura: umidità o umidita, e la lettura può essere negativa', () => {
    expect(leggiComando('Peso centocinquanta umidità trentacinque avanti', true)).toEqual({ tipo: 'avanti', valore: 150, lettura: 35 })
    expect(leggiComando('peso 150 umidita 35,5 avanti', true)).toEqual({ tipo: 'avanti', valore: 150, lettura: 35.5 })
    expect(leggiComando('peso 150 tensione meno trenta avanti', true)).toEqual({ tipo: 'avanti', valore: 150, lettura: -30 })
  })

  it('lo stesso comando senza conLettura non si capisce', () => {
    expect(leggiComando('peso 2350 tensione 30 avanti', false)).toEqual({ tipo: 'non_capito' })
  })

  it('con la lettura servono entrambi i numeri', () => {
    expect(leggiComando('2350 avanti', true)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('peso 2350 avanti', true)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('peso tensione 30 avanti', true)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('peso 2350 tensione avanti', true)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('peso 2350 tensione 30', true)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('peso 2350 pressione 30 avanti', true)).toEqual({ tipo: 'non_capito' })
    expect(leggiComando('peso 2350 tensione 30 umidità 2 avanti', true)).toEqual({ tipo: 'non_capito' })
  })
})

describe('fraseSalvato', () => {
  it('con il prossimo campione', () => {
    expect(fraseSalvato(53, 'g', 'P12')).toBe('53 salvato, prossimo P12')
  })

  it('alla fine', () => {
    expect(fraseSalvato(53, 'mg', null)).toBe('53 salvato, pesata finita')
  })

  it('con la virgola decimale', () => {
    expect(fraseSalvato(0.1023, 'g', 'P13')).toBe('0,1023 salvato, prossimo P13')
  })
})
