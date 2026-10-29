import { beforeEach, describe, expect, it } from 'vitest'
import type { Misura } from '@/domain/tipi'
import {
  cancellaBozzaCorrezione, chiaveAperto, chiaveBozza, leggiAperto, leggiBozza, scriviAperto, scriviBozza,
} from './bozza'

const misura: Misura = {
  id: 'm1', pianta_id: 'p1', strumento_id: 'pa1', data_rilievo: '2026-10-21', ora: '09:12', valori: {},
}
const base = { espId: 'E', piantaId: 'p1', strumentoId: 'pa1', dataRilievo: '2026-10-21' }

beforeEach(() => sessionStorage.clear())

describe('cancellaBozzaCorrezione', () => {
  it('toglie la bozza di quella misura alla sua data e il ricordo che il modulo era aperto', () => {
    const chiave = chiaveBozza({ ...base, misuraId: 'm1' })
    scriviBozza(chiave, { id: 'm1', valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm1')

    cancellaBozzaCorrezione('E', misura)

    expect(leggiBozza(chiave)).toBeNull()
    expect(leggiAperto(chiaveAperto(base))).toBeNull()
  })

  it('non tocca le bozze di altre misure, della misura nuova, di altre date né il ricordo di un\'altra correzione', () => {
    const altra = chiaveBozza({ ...base, misuraId: 'm2' })
    const nuova = chiaveBozza({ ...base, misuraId: null })
    const altraData = chiaveBozza({ ...base, dataRilievo: '2026-10-22', misuraId: 'm1' })
    for (const [chiave, id] of [[altra, 'm2'], [nuova, 'n'], [altraData, 'm1']] as const) scriviBozza(chiave, { id, valori: {}, ora: null })
    scriviAperto(chiaveAperto(base), 'm2')

    cancellaBozzaCorrezione('E', misura)

    expect(leggiBozza(altra)).not.toBeNull()
    expect(leggiBozza(nuova)).not.toBeNull()
    expect(leggiBozza(altraData)).not.toBeNull()
    expect(leggiAperto(chiaveAperto(base))).toBe('m2')
  })

  it('senza bozze non fa nulla', () => {
    expect(() => cancellaBozzaCorrezione('E', misura)).not.toThrow()
    expect(sessionStorage.length).toBe(0)
  })
})
