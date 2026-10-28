import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { Parametro, Passata, Pianta } from '@/domain/tipi'
import {
  aggiornaPianta, aggiornaTrattamento, aggiungiPiante, eliminaOArchiviaParametro, eliminaPassata, eliminaPianta,
  pianteConDati, parametriConDati, salvaParametro, salvaPassata,
} from './configurazione'

const errore = { code: '23505', message: 'duplicate key', details: '', hint: '' }

const parametro: Parametro = {
  id: 'par1', nome: 'Altezza', unita: 'cm', tipo: 'numero', ordine: 0, archiviato: false, progressivo: false,
  ricorda_tra_piante: false, n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [],
}
const pianta: Pianta = { id: 'p1', trattamento_id: 't1', etichetta: '1', blocco: null, ordine: 0 }

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('salvaParametro', () => {
  it('fa upsert per id con esperimento_id', async () => {
    await salvaParametro('E', parametro)

    expect(mock.di('parametri')).toEqual([
      { sorgente: 'parametri', metodo: 'upsert', args: [{ ...parametro, esperimento_id: 'E' }, { onConflict: 'id' }] },
    ])
  })

  it('lancia l\'errore di Supabase (es. cambio di tipo con dati)', async () => {
    const e = { code: 'P0001', message: 'PARAMETRO_CON_DATI' }
    mock.risponde('parametri', { error: e })
    await expect(salvaParametro('E', parametro)).rejects.toBe(e)
  })
})

describe('parametriConDati e pianteConDati', () => {
  it('parametriConDati chiama la RPC e restituisce un Set di id', async () => {
    mock.risponde('rpc:parametri_con_dati', { data: ['par1', 'par2'] })

    expect(await parametriConDati('E')).toEqual(new Set(['par1', 'par2']))
    expect(supabase.rpc).toHaveBeenCalledWith('parametri_con_dati', { p_esperimento: 'E' })
  })

  it('pianteConDati chiama la RPC e restituisce un Set di id', async () => {
    mock.risponde('rpc:piante_con_dati', { data: ['p1'] })

    expect(await pianteConDati('E')).toEqual(new Set(['p1']))
    expect(supabase.rpc).toHaveBeenCalledWith('piante_con_dati', { p_esperimento: 'E' })
  })

  it('senza dati restituiscono un Set vuoto', async () => {
    mock.risponde('rpc:parametri_con_dati', { data: null })
    mock.risponde('rpc:piante_con_dati', { data: null })
    expect((await parametriConDati('E')).size).toBe(0)
    expect((await pianteConDati('E')).size).toBe(0)
  })

  it('lanciano l\'errore di Supabase', async () => {
    mock.risponde('rpc:parametri_con_dati', { error: errore })
    mock.risponde('rpc:piante_con_dati', { error: errore })
    await expect(parametriConDati('E')).rejects.toBe(errore)
    await expect(pianteConDati('E')).rejects.toBe(errore)
  })
})

describe('eliminaOArchiviaParametro', () => {
  it('senza dati elimina il parametro', async () => {
    mock.risponde('rpc:parametri_con_dati', { data: [] })

    expect(await eliminaOArchiviaParametro('E', parametro)).toBe('eliminato')
    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'par1'], ['eq', 'esperimento_id', 'E'],
    ])
  })

  it('con dati lo archivia e non lo elimina', async () => {
    mock.risponde('rpc:parametri_con_dati', { data: ['par1'] })

    expect(await eliminaOArchiviaParametro('E', parametro)).toBe('archiviato')
    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { archiviato: true }], ['eq', 'id', 'par1'], ['eq', 'esperimento_id', 'E'],
    ])
  })

  it('lancia l\'errore se il controllo dei dati fallisce, senza toccare il parametro', async () => {
    mock.risponde('rpc:parametri_con_dati', { error: errore })
    await expect(eliminaOArchiviaParametro('E', parametro)).rejects.toBe(errore)
    expect(mock.di('parametri')).toEqual([])
  })

  it('lancia l\'errore se l\'eliminazione fallisce (es. dati arrivati nel frattempo)', async () => {
    const e = { code: 'P0001', message: 'PARAMETRO_CON_DATI' }
    mock.risponde('rpc:parametri_con_dati', { data: [] })
    mock.risponde('parametri', { error: e })
    await expect(eliminaOArchiviaParametro('E', parametro)).rejects.toBe(e)
  })
})

describe('salvaPassata', () => {
  const passata: Passata = {
    id: 'pa1', nome: 'Altezza', icona: '📏', ordine: 0,
    parametri: [
      { parametro_id: 'par1', obbligatorio: true, ordine: 0 },
      { parametro_id: 'par2', obbligatorio: false, ordine: 1 },
    ],
  }

  it('fa upsert della passata, poi dei collegamenti, poi toglie quelli non più presenti', async () => {
    await salvaPassata('E', passata)

    expect(mock.chiamate.map(c => [c.sorgente, c.metodo, ...c.args])).toEqual([
      ['passate', 'upsert', { id: 'pa1', esperimento_id: 'E', nome: 'Altezza', icona: '📏', ordine: 0 }, { onConflict: 'id' }],
      ['passata_parametri', 'upsert', [
        { esperimento_id: 'E', passata_id: 'pa1', parametro_id: 'par1', obbligatorio: true, ordine: 0 },
        { esperimento_id: 'E', passata_id: 'pa1', parametro_id: 'par2', obbligatorio: false, ordine: 1 },
      ], { onConflict: 'passata_id,parametro_id' }],
      ['passata_parametri', 'delete'],
      ['passata_parametri', 'eq', 'passata_id', 'pa1'],
      ['passata_parametri', 'not', 'parametro_id', 'in', '(par1,par2)'],
    ])
  })

  it('senza parametri elimina tutti i collegamenti della passata', async () => {
    await salvaPassata('E', { ...passata, parametri: [] })

    expect(mock.chiamate.map(c => [c.sorgente, c.metodo, ...c.args])).toEqual([
      ['passate', 'upsert', { id: 'pa1', esperimento_id: 'E', nome: 'Altezza', icona: '📏', ordine: 0 }, { onConflict: 'id' }],
      ['passata_parametri', 'delete'],
      ['passata_parametri', 'eq', 'passata_id', 'pa1'],
    ])
  })

  it('si ferma al primo errore', async () => {
    mock.risponde('passate', { error: errore })
    await expect(salvaPassata('E', passata)).rejects.toBe(errore)
    expect(mock.di('passata_parametri')).toEqual([])
  })

  it('lancia l\'errore dei collegamenti', async () => {
    mock.risponde('passata_parametri', { error: errore })
    await expect(salvaPassata('E', passata)).rejects.toBe(errore)
  })
})

describe('eliminaPassata', () => {
  it('elimina per id', async () => {
    await eliminaPassata('pa1')
    expect(mock.di('passate').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'id', 'pa1']])
  })

  it('lancia l\'errore (misure collegate: 23503)', async () => {
    const e = { code: '23503', message: 'violates foreign key constraint' }
    mock.risponde('passate', { error: e })
    await expect(eliminaPassata('pa1')).rejects.toBe(e)
  })
})

describe('piante', () => {
  it('aggiungiPiante inserisce tutte le righe con esperimento_id in una sola chiamata', async () => {
    await aggiungiPiante('E', [pianta, { ...pianta, id: 'p2', etichetta: '2', ordine: 1 }])

    expect(mock.di('piante')).toEqual([{
      sorgente: 'piante', metodo: 'insert',
      args: [[{ ...pianta, esperimento_id: 'E' }, { ...pianta, id: 'p2', etichetta: '2', ordine: 1, esperimento_id: 'E' }]],
    }])
  })

  it('aggiungiPiante con elenco vuoto non chiama il database', async () => {
    await aggiungiPiante('E', [])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('aggiungiPiante lancia l\'errore (etichetta duplicata: 23505)', async () => {
    mock.risponde('piante', { error: errore })
    await expect(aggiungiPiante('E', [pianta])).rejects.toBe(errore)
  })

  it('aggiornaPianta aggiorna i campi della pianta per id e esperimento', async () => {
    await aggiornaPianta('E', { ...pianta, etichetta: '9', blocco: 'B' })

    expect(mock.di('piante').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { trattamento_id: 't1', etichetta: '9', blocco: 'B', ordine: 0 }],
      ['eq', 'id', 'p1'],
      ['eq', 'esperimento_id', 'E'],
    ])
  })

  it('aggiornaPianta lancia l\'errore di Supabase', async () => {
    mock.risponde('piante', { error: errore })
    await expect(aggiornaPianta('E', pianta)).rejects.toBe(errore)
  })

  it('eliminaPianta elimina per id', async () => {
    await eliminaPianta('p1')
    expect(mock.di('piante').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'id', 'p1']])
  })

  it('eliminaPianta lancia l\'errore (misure collegate: 23503)', async () => {
    const e = { code: '23503', message: 'violates foreign key constraint' }
    mock.risponde('piante', { error: e })
    await expect(eliminaPianta('p1')).rejects.toBe(e)
  })
})

describe('aggiornaTrattamento', () => {
  it('aggiorna l\'etichetta per id', async () => {
    await aggiornaTrattamento('t1', 'Nuova')
    expect(mock.di('trattamenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { etichetta: 'Nuova' }], ['eq', 'id', 't1'],
    ])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('trattamenti', { error: errore })
    await expect(aggiornaTrattamento('t1', 'x')).rejects.toBe(errore)
  })
})
