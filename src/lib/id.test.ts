import { afterEach, describe, expect, it, vi } from 'vitest'
import { nuovoId } from './id'

const FORMA_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('nuovoId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('restituisce un uuid v4', () => {
    expect(nuovoId()).toMatch(FORMA_UUID_V4)
  })

  it('funziona anche senza crypto.randomUUID (pagina in http fuori da localhost)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const a = nuovoId()
    const b = nuovoId()
    expect(a).toMatch(FORMA_UUID_V4)
    expect(b).toMatch(FORMA_UUID_V4)
    expect(a).not.toBe(b)
  })
})
