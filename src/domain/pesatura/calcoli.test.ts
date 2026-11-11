import { describe, expect, it } from 'vitest'
import {
  controllaAsciugatura,
  controllaReplica,
  inGrammi,
  mlTampone,
  percentualeCC,
  pesoAPercentualeCC,
  rwc,
  sostanzaSecca,
} from './calcoli'

describe('formule', () => {
  it('RWC', () => {
    expect(rwc(1.2, 1.5, 0.3)).toBeCloseTo(75)
    expect(rwc(1, 0.3, 0.3)).toBeNull()
  })
  it('sostanza secca', () => {
    expect(sostanzaSecca(2, 0.25)).toBeCloseTo(12.5)
    expect(sostanzaSecca(0, 0.25)).toBeNull()
  })
  it('% capacità di campo e peso corrispondente', () => {
    expect(percentualeCC(2350, 1800, 2600)).toBeCloseTo(68.75)
    expect(percentualeCC(2350, 2600, 2600)).toBeNull()
    expect(pesoAPercentualeCC(50, 1800, 2600)).toBeCloseTo(2200)
  })
})

describe('tampone', () => {
  it('converte in grammi e applica il rapporto mL/g', () => {
    expect(inGrammi(500, 'mg')).toBeCloseTo(0.5)
    expect(inGrammi(2, 'g')).toBe(2)
    expect(mlTampone(0.1023, 'g', 10)).toBeCloseTo(1.023)
    expect(mlTampone(10, 'mg', 10)).toBeCloseTo(0.1)
    expect(mlTampone(1, 'g', null)).toBeNull()
  })
})

describe('controlli', () => {
  it('RWC: segnala le tre incoerenze', () => {
    const m = controllaReplica('rwc', { fresco: 1, turgido: 0.9, secco: 1.1 })
    expect(m).toContain('Il peso secco è maggiore del fresco.')
    expect(m).toContain('Il peso turgido è minore del fresco.')
    expect(m).toContain('Il peso secco è maggiore del turgido.')
  })
  it('controlla solo le coppie presenti', () => {
    expect(controllaReplica('rwc', { fresco: 1 })).toEqual([])
    expect(controllaReplica('rwc', { fresco: 1, secco: 0.2 })).toEqual([])
    expect(controllaReplica('rwc', { fresco: 1, secco: 1.5 })).toEqual(['Il peso secco è maggiore del fresco.'])
  })
  it('sostanza secca', () => {
    expect(controllaReplica('sostanza_secca', { fresco: 1, secco: 2 })).toEqual(['Il peso secco è maggiore del fresco.'])
  })
  it('vasi: capacità di campo', () => {
    expect(controllaReplica('vasi', { secco: 2000, capacita_campo: 1900 })).toContain(
      'La capacità di campo deve essere maggiore del peso secco.',
    )
    expect(controllaReplica('vasi', { secco: 1800, capacita_campo: 2600 })).toEqual([])
  })
  it('asciugatura', () => {
    expect(controllaAsciugatura(1700, 1800)).toBe('Il vaso pesa meno del peso secco.')
    expect(controllaAsciugatura(1900, 1800)).toBeNull()
  })
})
