import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import { SENZA_SESSIONE } from '@/lib/errori'
import { daSpazioProgetto, spazioProgetto } from './spazio'

const E = 'e0000000-0000-4000-8000-000000000001'

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

const risposta = {
  database_byte: 41_234_567, foto_byte: 210_000_000,
  esperimento: { misure: 3120, note: 14, foto: 85, dati_byte: 1_830_000, foto_byte: 29_000_000 },
}

describe('spazioProgetto', () => {
  it('chiama la RPC spazio_progetto con l\'esperimento e ne dà i numeri', async () => {
    mock.risponde('rpc:spazio_progetto', { data: risposta })
    expect(await spazioProgetto(E)).toEqual(risposta)
    expect(supabase.rpc).toHaveBeenCalledWith('spazio_progetto', { p_esperimento: E })
  })

  it('per chi non è membro l\'esperimento è null, i totali ci sono', async () => {
    mock.risponde('rpc:spazio_progetto', { data: { ...risposta, esperimento: null } })
    expect(await spazioProgetto(E)).toEqual({ database_byte: 41_234_567, foto_byte: 210_000_000, esperimento: null })
  })

  it('senza sessione la RPC restituisce null: lo dice', async () => {
    mock.risponde('rpc:spazio_progetto', { data: null })
    await expect(spazioProgetto(E)).rejects.toThrow(SENZA_SESSIONE)
  })

  it('un errore della RPC non si nasconde', async () => {
    const errore = { code: '42501', message: 'permission denied for function spazio_progetto' }
    mock.risponde('rpc:spazio_progetto', { error: errore })
    await expect(spazioProgetto(E)).rejects.toBe(errore)
  })
})

describe('daSpazioProgetto', () => {
  it('legge anche i numeri scritti come testo (bigint)', () => {
    expect(daSpazioProgetto({
      database_byte: '41234567', foto_byte: '0',
      esperimento: { misure: '3', note: 0, foto: '1', dati_byte: '900', foto_byte: 350000 },
    })).toEqual({
      database_byte: 41_234_567, foto_byte: 0, esperimento: { misure: 3, note: 0, foto: 1, dati_byte: 900, foto_byte: 350_000 },
    })
  })

  it('una risposta senza numeri validi è un errore, mai uno zero inventato', () => {
    expect(() => daSpazioProgetto({ database_byte: 'tanto', foto_byte: 1, esperimento: null })).toThrow()
    expect(() => daSpazioProgetto({ foto_byte: 1, esperimento: null })).toThrow()
    expect(() => daSpazioProgetto({ database_byte: 1, foto_byte: 1, esperimento: { misure: 1 } })).toThrow()
  })
})
