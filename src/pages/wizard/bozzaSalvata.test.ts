import { beforeEach, describe, expect, it } from 'vitest'
import { bozzaVuota } from '@/domain/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { chiaveBozza, leggiBozza, modificato, nuovoLavoro, rimuoviBozza, salvaBozza } from './bozzaSalvata'

const CHIAVE = chiaveBozza('u1', 'hydrochar')

beforeEach(() => sessionStorage.clear())

describe('bozzaSalvata', () => {
  it('la chiave distingue utente e modo di partenza', () => {
    expect(chiaveBozza('u1', 'da:e1')).toBe('fastlab:bozza:u1:da:e1')
    expect(chiaveBozza('u1', 'nuovo')).not.toBe(chiaveBozza('u2', 'nuovo'))
  })

  it('un lavoro nuovo non è modificato; lo diventa cambiando la bozza o la tabella', () => {
    const l = nuovoLavoro(bozzaHydrochar())
    expect(modificato(l)).toBe(false)
    expect(modificato({ ...l, bozza: { ...l.bozza, esperimento: { ...l.bozza.esperimento, nome: 'Altro' } } })).toBe(true)
    expect(modificato({ ...l, righe: l.righe.map((r, i) => (i === 0 ? { ...r, n: '15' } : r)) })).toBe(true)
  })

  it('salva e rilegge bozza, tabella, partenza e tentativo', () => {
    const l = { ...nuovoLavoro(bozzaHydrochar()), tentato: true }
    l.bozza.esperimento.nome = 'Modificato'
    salvaBozza(CHIAVE, l)
    const letto = leggiBozza(CHIAVE)
    expect(letto).toEqual(l)
    expect(letto && modificato(letto)).toBe(true)

    rimuoviBozza(CHIAVE)
    expect(leggiBozza(CHIAVE)).toBeNull()
  })

  it('ignora ciò che non è una bozza leggibile', () => {
    expect(leggiBozza(CHIAVE)).toBeNull()
    sessionStorage.setItem(CHIAVE, '{non è json')
    expect(leggiBozza(CHIAVE)).toBeNull()
    sessionStorage.setItem(CHIAVE, JSON.stringify({ versione: 99, ...nuovoLavoro(bozzaVuota()) }))
    expect(leggiBozza(CHIAVE)).toBeNull()
    sessionStorage.setItem(CHIAVE, JSON.stringify({ versione: 1, bozza: { esperimento: {} }, righe: [], iniziale: '' }))
    expect(leggiBozza(CHIAVE)).toBeNull()
  })
})
