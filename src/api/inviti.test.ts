import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { EMAIL_GIA_INVITATA, INVITO_GIA_USATO } from '@/lib/errori'
import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import { creaInvito, listaInviti, revocaInvito, sonoAdmin, type Invito } from './inviti'

const invito: Invito = {
  id: 'i1', email: 'a@b.it', codice: 'ABCD2345', creato_il: '2026-10-28T10:00:00+00:00', usato_il: null,
}
const errore = { code: '42501', message: 'permission denied', details: '', hint: '' }

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('sonoAdmin', () => {
  it('chiama la RPC is_admin', async () => {
    mock.risponde('rpc:is_admin', { data: true })
    expect(await sonoAdmin()).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('is_admin')
  })

  it('false se la RPC non restituisce true', async () => {
    mock.risponde('rpc:is_admin', { data: false })
    expect(await sonoAdmin()).toBe(false)
    mock.risponde('rpc:is_admin', { data: null })
    expect(await sonoAdmin()).toBe(false)
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('rpc:is_admin', { error: errore })
    await expect(sonoAdmin()).rejects.toBe(errore)
  })
})

describe('listaInviti', () => {
  it('legge gli inviti, i più recenti per primi', async () => {
    mock.risponde('inviti', { data: [invito] })

    expect(await listaInviti()).toEqual([invito])
    expect(mock.di('inviti').map(c => [c.metodo, ...c.args])).toEqual([
      ['select', 'id, email, codice, creato_il, usato_il'],
      ['order', 'creato_il', { ascending: false }],
    ])
  })

  it('senza dati restituisce un array vuoto', async () => {
    mock.risponde('inviti', { data: null })
    expect(await listaInviti()).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('inviti', { error: errore })
    await expect(listaInviti()).rejects.toBe(errore)
  })
})

describe('creaInvito', () => {
  it('inserisce l\'email in minuscolo e senza spazi, e restituisce l\'invito con il suo codice', async () => {
    mock.risponde('inviti', { data: invito })

    expect(await creaInvito('  A@B.it ')).toEqual(invito)
    const chiamate = mock.di('inviti')
    expect(chiamate[0]).toEqual({ sorgente: 'inviti', metodo: 'insert', args: [{ email: 'a@b.it' }] })
    expect(chiamate.find(c => c.metodo === 'select')?.args).toEqual(['id, email, codice, creato_il, usato_il'])
  })

  it('con un\'email già invitata (indice inviti_email_unica) lo dice con un messaggio suo', async () => {
    mock.risponde('inviti', {
      error: { code: '23505', message: 'duplicate key value violates unique constraint "inviti_email_unica"' },
    })
    await expect(creaInvito('a@b.it')).rejects.toThrow(EMAIL_GIA_INVITATA)
  })

  it('lancia l\'errore di Supabase (anche un 23505 di un altro indice)', async () => {
    const e = { code: '23505', message: 'duplicate key value violates unique constraint "inviti_codice_unico"' }
    mock.risponde('inviti', { error: e })
    await expect(creaInvito('a@b.it')).rejects.toBe(e)
  })
})

describe('revocaInvito', () => {
  it('elimina per id, solo se non è stato usato', async () => {
    mock.risponde('inviti', { data: [{ id: 'i1' }] })
    await revocaInvito('i1')
    expect(mock.di('inviti').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'i1'], ['is', 'usato_il', null], ['select', 'id'],
    ])
  })

  it('se non elimina nulla (usato nel frattempo o già revocato) non sembra riuscita', async () => {
    mock.risponde('inviti', { data: [] })
    await expect(revocaInvito('i1')).rejects.toThrow(INVITO_GIA_USATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('inviti', { error: errore })
    await expect(revocaInvito('i1')).rejects.toBe(errore)
  })
})
