import { describe, expect, it } from 'vitest'
import { percorsoFoto } from './foto'

describe('percorsoFoto', () => {
  it('è <esperimento>/<foto>.jpg, come impone il vincolo del database', () => {
    expect(percorsoFoto('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002'))
      .toBe('e0000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.jpg')
  })

  it('scrive gli uuid in minuscolo: il database confronta con il testo che dà lui, e le policy dello Storage accettano solo quello', () => {
    expect(percorsoFoto('E0000000-0000-4000-8000-00000000000A', 'F0000000-0000-4000-8000-00000000000B'))
      .toBe('e0000000-0000-4000-8000-00000000000a/f0000000-0000-4000-8000-00000000000b.jpg')
  })
})
