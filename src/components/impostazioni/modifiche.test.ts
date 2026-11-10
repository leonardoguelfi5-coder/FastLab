import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { uguali, useBozze } from './modifiche'

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

describe('useBozze: modifica', () => {
  const originale = { id: 'a', nome: 'uno' }

  it('cambia una bozza che c\'è', () => {
    const { result } = renderHook(() => useBozze<{ id: string; nome: string }>())
    act(() => result.current.cambia({ id: 'a', nome: 'due' }))
    act(() => result.current.modifica('a', b => ({ ...b, nome: `${b.nome}!` })))
    expect(result.current.valore(originale).nome).toBe('due!')
  })

  it('senza bozza non ne crea una: l\'elemento segue la configurazione', () => {
    const { result } = renderHook(() => useBozze<{ id: string; nome: string }>())
    act(() => result.current.modifica('a', b => ({ ...b, nome: 'x' })))
    expect(result.current.valore(originale)).toBe(originale)
    expect(result.current.modificato(originale)).toBe(false)
  })
})
