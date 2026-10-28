import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { Misura } from '@/domain/tipi'
import { aRigaMisura } from './mappers'
import { caricaMisura, eliminaMisura, misureDelGiorno, misurePianta, salvaMisura } from './misure'

const misura: Misura = {
  id: 'm1', pianta_id: 'p1', passata_id: 'pa1', data_rilievo: '2026-10-28', ora: '09:12',
  valori: { par1: [24.5] },
}
const riga = { ...aRigaMisura('E', misura), ora: '09:12:00', creato_da: 'u1', creato_il: 'x', aggiornato_il: 'y' }
const errore = { code: '23503', message: 'violates foreign key constraint', details: '', hint: '' }

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('salvaMisura', () => {
  it('fa upsert sulla tabella misure con onConflict id (un doppio salvataggio non duplica)', async () => {
    await salvaMisura('E', misura)

    expect(supabase.from).toHaveBeenCalledWith('misure')
    expect(mock.di('misure')).toEqual([
      { sorgente: 'misure', metodo: 'upsert', args: [aRigaMisura('E', misura), { onConflict: 'id' }] },
    ])
  })

  it('non manda mai creato_da', async () => {
    await salvaMisura('E', { ...misura, creato_da: 'u1' } as Misura)
    const [riga] = mock.di('misure')[0].args as [Record<string, unknown>]
    expect(riga).not.toHaveProperty('creato_da')
  })

  it('lancia l\'errore di Supabase se valorizzato', async () => {
    mock.risponde('misure', { error: errore })
    await expect(salvaMisura('E', misura)).rejects.toBe(errore)
  })
})

describe('misureDelGiorno', () => {
  it('filtra per esperimento e data e converte le righe', async () => {
    mock.risponde('misure', { data: [riga] })

    const misure = await misureDelGiorno('E', '2026-10-28')

    expect(misure).toEqual([misura])
    const chiamate = mock.di('misure')
    expect(chiamate.find(c => c.metodo === 'select')?.args).toEqual(['*'])
    expect(chiamate.filter(c => c.metodo === 'eq').map(c => c.args)).toEqual([
      ['esperimento_id', 'E'], ['data_rilievo', '2026-10-28'],
    ])
  })

  it('senza righe restituisce un array vuoto', async () => {
    mock.risponde('misure', { data: null })
    expect(await misureDelGiorno('E', '2026-10-28')).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('misure', { error: errore })
    await expect(misureDelGiorno('E', '2026-10-28')).rejects.toBe(errore)
  })
})

describe('misurePianta', () => {
  it('filtra per pianta e converte le righe', async () => {
    mock.risponde('misure', { data: [riga] })

    expect(await misurePianta('p1')).toEqual([misura])
    expect(mock.di('misure').filter(c => c.metodo === 'eq').map(c => c.args)).toEqual([['pianta_id', 'p1']])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('misure', { error: errore })
    await expect(misurePianta('p1')).rejects.toBe(errore)
  })
})

describe('caricaMisura', () => {
  it('legge una misura per id e la converte', async () => {
    mock.risponde('misure', { data: riga })

    expect(await caricaMisura('m1')).toEqual(misura)
    expect(mock.di('misure').filter(c => c.metodo === 'eq').map(c => c.args)).toEqual([['id', 'm1']])
  })

  it('lancia un errore se la misura non esiste', async () => {
    mock.risponde('misure', { data: null })
    await expect(caricaMisura('m1')).rejects.toThrow('Misura non trovata')
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('misure', { error: errore })
    await expect(caricaMisura('m1')).rejects.toBe(errore)
  })
})

describe('eliminaMisura', () => {
  it('elimina per id', async () => {
    await eliminaMisura('m1')

    expect(mock.di('misure').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'id', 'm1']])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('misure', { error: errore })
    await expect(eliminaMisura('m1')).rejects.toBe(errore)
  })
})
