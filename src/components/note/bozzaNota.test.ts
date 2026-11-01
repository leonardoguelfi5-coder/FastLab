import { beforeEach, describe, expect, it } from 'vitest'
import { cancellaTutteLeBozze } from '@/components/scheda/bozza'
import {
  cancellaBozzaNota, chiaveBozzaNota, leggiBozzaNota, notaAperta, scriviBozzaNota, type BozzaNota,
} from './bozzaNota'
import { statoVuoto } from './statoNota'

const bozza = (id = 'n1', extra: Partial<BozzaNota> = {}): BozzaNota => ({
  id, esistente: false, stato: { ...statoVuoto('2026-11-01'), testo: 'Foglie gialle', collegamento: 'piante', pianta_ids: ['p1'] }, ...extra,
})

beforeEach(() => sessionStorage.clear())

describe('bozza di una nota', () => {
  it('la chiave è fastlab-bozza:nota:<espId>:<id>', () => {
    expect(chiaveBozzaNota('E', 'n1')).toBe('fastlab-bozza:nota:E:n1')
  })

  it('scrive e rilegge la bozza, e ricorda quale nota era aperta', () => {
    scriviBozzaNota('E', bozza())
    expect(leggiBozzaNota('E', 'n1')).toEqual(bozza())
    expect(notaAperta('E')).toBe('n1')
  })

  it('è di un solo esperimento', () => {
    scriviBozzaNota('E', bozza())
    expect(leggiBozzaNota('F', 'n1')).toBeNull()
    expect(notaAperta('F')).toBeNull()
  })

  it('cancellare toglie la bozza e il ricordo, ma non il ricordo di un\'altra nota', () => {
    scriviBozzaNota('E', bozza('n1'))
    scriviBozzaNota('E', bozza('n2'))
    cancellaBozzaNota('E', 'n1')
    expect(leggiBozzaNota('E', 'n1')).toBeNull()
    expect(notaAperta('E')).toBe('n2')
    cancellaBozzaNota('E', 'n2')
    expect(notaAperta('E')).toBeNull()
  })

  it('una bozza rovinata o di un\'altra forma si ignora', () => {
    sessionStorage.setItem(chiaveBozzaNota('E', 'n1'), '{non json')
    expect(leggiBozzaNota('E', 'n1')).toBeNull()
    sessionStorage.setItem(chiaveBozzaNota('E', 'n1'), JSON.stringify({ id: 'n1', esistente: false, stato: { testo: 3 } }))
    expect(leggiBozzaNota('E', 'n1')).toBeNull()
    sessionStorage.setItem(chiaveBozzaNota('E', 'n1'), JSON.stringify({ id: 'altra', esistente: false, stato: bozza().stato }))
    expect(leggiBozzaNota('E', 'n1')).toBeNull()
  })

  it('cambiando utente (o all\'uscita dall\'account) le bozze delle note vanno via con le altre', () => {
    scriviBozzaNota('E', bozza())
    cancellaTutteLeBozze()
    expect(leggiBozzaNota('E', 'n1')).toBeNull()
    expect(notaAperta('E')).toBeNull()
  })

  it('senza sessionStorage non fa danni', () => {
    const originale = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('pieno') }
    try {
      expect(() => scriviBozzaNota('E', bozza())).not.toThrow()
    } finally {
      Storage.prototype.setItem = originale
    }
  })
})
