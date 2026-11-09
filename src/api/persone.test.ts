import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import { aggiungiMembro, autoriCatalogo, eRuolo, membriDi, ruoloIn, togliMembro } from './persone'

const E = 'e0000000-0000-4000-8000-000000000001'
const U = 'a0000000-0000-4000-8000-00000000000b'

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('eRuolo', () => {
  it('solo proprietario, rilevatore e lettore', () => {
    expect(['proprietario', 'rilevatore', 'lettore'].every(eRuolo)).toBe(true)
    for (const r of ['collaboratore', 'Proprietario', '', null, undefined, 1]) expect(eRuolo(r), String(r)).toBe(false)
  })
})

describe('ruoloIn', () => {
  it('chiama ruolo_in e dà il ruolo', async () => {
    mock.risponde('rpc:ruolo_in', { data: 'rilevatore' })
    expect(await ruoloIn(E)).toBe('rilevatore')
    expect(supabase.rpc).toHaveBeenCalledWith('ruolo_in', { p: E })
  })

  it('chi non è membro: null', async () => {
    mock.risponde('rpc:ruolo_in', { data: null })
    expect(await ruoloIn(E)).toBeNull()
  })

  it('un ruolo che l\'app non conosce è un errore, mai un permesso inventato', async () => {
    mock.risponde('rpc:ruolo_in', { data: 'collaboratore' })
    await expect(ruoloIn(E)).rejects.toThrow()
  })

  it('un errore della RPC non si nasconde', async () => {
    const errore = { code: '42501', message: 'permission denied for function ruolo_in' }
    mock.risponde('rpc:ruolo_in', { error: errore })
    await expect(ruoloIn(E)).rejects.toBe(errore)
  })
})

describe('membriDi', () => {
  it('chiama membri_di e dà le persone nell\'ordine del database', async () => {
    const righe = [
      { utente_id: 'u1', email: 'anna@test.it', ruolo: 'proprietario', sei_tu: true },
      { utente_id: 'u2', email: 'bruno@test.it', ruolo: 'rilevatore', sei_tu: false },
      { utente_id: 'u3', email: null, ruolo: 'lettore', sei_tu: false },
    ]
    mock.risponde('rpc:membri_di', { data: righe })
    expect(await membriDi(E)).toEqual(righe)
    expect(supabase.rpc).toHaveBeenCalledWith('membri_di', { p: E })
  })

  it('per chi non è membro nessuna riga', async () => {
    mock.risponde('rpc:membri_di', { data: null })
    expect(await membriDi(E)).toEqual([])
  })

  it('una riga con un ruolo sconosciuto è un errore', async () => {
    mock.risponde('rpc:membri_di', { data: [{ utente_id: 'u1', email: 'a@test.it', ruolo: 'collaboratore', sei_tu: true }] })
    await expect(membriDi(E)).rejects.toThrow()
  })
})

describe('aggiungiMembro', () => {
  it('chiama aggiungi_membro con l\'email senza spazi ai lati e il ruolo', async () => {
    mock.risponde('rpc:aggiungi_membro', { data: null })
    await aggiungiMembro(E, '  Bruno@Test.it ', 'lettore')
    expect(supabase.rpc).toHaveBeenCalledWith('aggiungi_membro', { p: E, p_email: 'Bruno@Test.it', p_ruolo: 'lettore' })
  })

  it('un rifiuto del database arriva a chi chiama (lo traduce messaggioErrore)', async () => {
    const errore = { code: 'P0001', message: 'UTENTE_NON_TROVATO' }
    mock.risponde('rpc:aggiungi_membro', { error: errore })
    await expect(aggiungiMembro(E, 'x@test.it', 'rilevatore')).rejects.toBe(errore)
  })
})

describe('togliMembro', () => {
  it('chiama togli_membro con l\'utente', async () => {
    mock.risponde('rpc:togli_membro', { data: null })
    await togliMembro(E, U)
    expect(supabase.rpc).toHaveBeenCalledWith('togli_membro', { p: E, p_utente: U })
  })

  it('un rifiuto del database arriva a chi chiama', async () => {
    const errore = { code: 'P0001', message: 'ULTIMO_PROPRIETARIO' }
    mock.risponde('rpc:togli_membro', { error: errore })
    await expect(togliMembro(E, U)).rejects.toBe(errore)
  })
})

describe('autoriCatalogo', () => {
  it('chiama autori_catalogo e dà una mappa da utente a email', async () => {
    mock.risponde('rpc:autori_catalogo', { data: [{ utente_id: 'u1', email: 'anna@test.it' }, { utente_id: 'u2', email: 'bruno@test.it' }] })
    expect(await autoriCatalogo()).toEqual(new Map([['u1', 'anna@test.it'], ['u2', 'bruno@test.it']]))
    expect(supabase.rpc).toHaveBeenCalledWith('autori_catalogo')
  })

  it('senza autori: una mappa vuota', async () => {
    mock.risponde('rpc:autori_catalogo', { data: null })
    expect(await autoriCatalogo()).toEqual(new Map())
  })

  it('un errore della RPC non si nasconde', async () => {
    const errore = { code: '42501', message: 'permission denied' }
    mock.risponde('rpc:autori_catalogo', { error: errore })
    await expect(autoriCatalogo()).rejects.toBe(errore)
  })
})
