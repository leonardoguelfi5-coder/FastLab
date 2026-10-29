import { describe, expect, it } from 'vitest'
import { uguali } from './modifiche'

describe('uguali', () => {
  it('confronta in profondità oggetti e array, senza badare all\'ordine delle chiavi', () => {
    expect(uguali({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true)
    expect(uguali({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(uguali([1, 2], [2, 1])).toBe(false)
    expect(uguali([], {})).toBe(false)
    expect(uguali(null, {})).toBe(false)
    expect(uguali('1', 1)).toBe(false)
    expect(uguali(Number.NaN, Number.NaN)).toBe(true)
  })
})
