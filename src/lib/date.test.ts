import { describe, it, expect } from 'vitest'
import { oggiLocale, oraLocale, formattaData } from './date'

describe('date', () => {
  it('oggiLocale usa la data locale anche dopo mezzanotte', () => {
    expect(oggiLocale(new Date(2026, 9, 28, 0, 30))).toBe('2026-10-28')
    expect(oggiLocale(new Date(2026, 9, 27, 23, 59))).toBe('2026-10-27')
  })
  it('oraLocale', () => expect(oraLocale(new Date(2026, 9, 28, 9, 5))).toBe('09:05'))
  it('formattaData', () => expect(formattaData('2026-10-28')).toBe('28/10/2026'))
})
