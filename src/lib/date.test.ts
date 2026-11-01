import { describe, it, expect } from 'vitest'
import { dataLocaleDa, oggiLocale, oraLocale, formattaData, formattaGiornoMese, giorniTra, daQuanto } from './date'

describe('date', () => {
  it('oggiLocale usa la data locale anche dopo mezzanotte', () => {
    expect(oggiLocale(new Date(2026, 9, 28, 0, 30))).toBe('2026-10-28')
    expect(oggiLocale(new Date(2026, 9, 27, 23, 59))).toBe('2026-10-27')
  })
  it('il fuso dei test è fissato a Europe/Rome (vite.config.ts): 23:30 UTC è già il giorno dopo', () =>
    expect(oggiLocale(new Date(Date.UTC(2026, 9, 27, 23, 30)))).toBe('2026-10-28'))
  it('dataLocaleDa dà il giorno locale di un istante UTC: alle 00:30 locali non è il giorno prima', () => {
    const mezzanotteEMezza = new Date(2026, 9, 28, 0, 30).toISOString()   // 22:30 UTC del 27
    expect(mezzanotteEMezza.slice(0, 10)).toBe('2026-10-27')
    expect(dataLocaleDa(mezzanotteEMezza)).toBe('2026-10-28')
    expect(dataLocaleDa(new Date(2026, 9, 27, 23, 59).toISOString())).toBe('2026-10-27')
  })
  it('oraLocale', () => expect(oraLocale(new Date(2026, 9, 28, 9, 5))).toBe('09:05'))
  it('formattaData', () => expect(formattaData('2026-10-28')).toBe('28/10/2026'))
  it('formattaGiornoMese', () => expect(formattaGiornoMese('2026-10-08')).toBe('08/10'))
  it('giorniTra conta i giorni di calendario, anche a cavallo del cambio di ora e di mese', () => {
    expect(giorniTra('2026-10-20', '2026-10-31')).toBe(11)
    expect(giorniTra('2026-10-24', '2026-10-26')).toBe(2)   // il 25/10 in Europa torna l'ora solare: 25 ore, un giorno solo
    expect(giorniTra('2026-10-28', '2026-11-02')).toBe(5)
    expect(giorniTra('2026-10-31', '2026-10-31')).toBe(0)
    expect(giorniTra('2026-10-31', '2026-10-30')).toBe(-1)
  })
  it.each([
    ['2026-10-28', 'oggi'], ['2026-10-27', 'ieri'], ['2026-10-25', '3 giorni fa'], ['2026-09-28', '30 giorni fa'],
    ['2026-10-29', 'il 29/10'],
  ])('daQuanto(%s) con oggi 28/10 = %s', (data, atteso) => expect(daQuanto(data, '2026-10-28')).toBe(atteso))
  it('daQuanto conta i giorni di calendario anche a cavallo dell\'ora legale', () =>
    expect(daQuanto('2026-10-24', '2026-10-27')).toBe('3 giorni fa'))
})
