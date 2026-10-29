import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { Parametro, Strumento, Pianta } from '@/domain/tipi'
import { ELEMENTO_NON_TROVATO } from '@/lib/errori'
import {
  aggiornaParametroDaCatalogo, aggiornaPianta, aggiornaTrattamento, aggiungiPiante, archiviaParametro, archiviaStrumento,
  collegaParametri, eliminaOArchiviaParametro, eliminaStrumento, eliminaPianta, pianteConDati, parametriConDati, salvaParametro,
  salvaStrumento,
} from './configurazione'

const errore = { code: '23505', message: 'duplicate key', details: '', hint: '' }

const parametro: Parametro = {
  id: 'par1', nome: 'Altezza', unita: 'cm', tipo: 'numero', ordine: 0, archiviato: false, progressivo: false,
  n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [], catalogo_chiave: null,
}
const pianta: Pianta = { id: 'p1', trattamento_id: 't1', etichetta: '1', blocco: null, ordine: 0 }
/** La risposta di un update o di una delete con `.select('id')`: le righe toccate. */
const toccata = (id: string) => ({ data: [{ id }] })

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

describe('aggiornaParametroDaCatalogo', () => {
  const daCatalogo: Parametro = { ...parametro, tipo: 'testo', archiviato: true, progressivo: true, unita: 'mm', n_letture: 2, valore_min: 1, valore_max: 9 }

  it('aggiorna solo nome, unità, minimo, massimo e letture (mai tipo, archiviato o progressivo) e controlla la riga', async () => {
    mock.risponde('parametri', toccata('par1'))

    await aggiornaParametroDaCatalogo('E', daCatalogo)

    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { nome: 'Altezza', unita: 'mm', valore_min: 1, valore_max: 9, n_letture: 2 }],
      ['eq', 'id', 'par1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('se il parametro non c\'è più lo dice, invece di ricrearlo', async () => {
    mock.risponde('parametri', { data: [] })
    await expect(aggiornaParametroDaCatalogo('E', daCatalogo)).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('parametri', { error: errore })
    await expect(aggiornaParametroDaCatalogo('E', daCatalogo)).rejects.toBe(errore)
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
    mock.risponde('parametri', toccata('par1'))

    expect(await eliminaOArchiviaParametro('E', parametro)).toBe('eliminato')
    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'par1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('con dati lo archivia e non lo elimina', async () => {
    mock.risponde('rpc:parametri_con_dati', { data: ['par1'] })
    mock.risponde('parametri', toccata('par1'))

    expect(await eliminaOArchiviaParametro('E', parametro)).toBe('archiviato')
    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { archiviato: true }], ['eq', 'id', 'par1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('se nessuna riga è stata toccata (parametro già rimosso) lo dice, in entrambi i casi', async () => {
    mock.risponde('parametri', { data: [] })
    mock.risponde('rpc:parametri_con_dati', { data: [] })
    await expect(eliminaOArchiviaParametro('E', parametro)).rejects.toThrow(ELEMENTO_NON_TROVATO)
    mock.risponde('rpc:parametri_con_dati', { data: ['par1'] })
    await expect(eliminaOArchiviaParametro('E', parametro)).rejects.toThrow(ELEMENTO_NON_TROVATO)
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

describe('archiviaParametro', () => {
  it('archivia il parametro dell\'esperimento, senza mai eliminarlo', async () => {
    mock.risponde('parametri', toccata('par1'))
    await archiviaParametro('E', 'par1')
    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { archiviato: true }], ['eq', 'id', 'par1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('lancia l\'errore se nessuna riga è stata toccata, o quello di Supabase', async () => {
    mock.risponde('parametri', { data: [] })
    await expect(archiviaParametro('E', 'par1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
    mock.risponde('parametri', { error: errore })
    await expect(archiviaParametro('E', 'par1')).rejects.toBe(errore)
  })
})

const RIGA_STRUMENTO = {
  id: 'pa1', esperimento_id: 'E', nome: 'Altezza', icona: '📏', ordine: 0, tipo: 'strumento', archiviato: false,
  catalogo_id: null,
}

describe('salvaStrumento', () => {
  const strumento: Strumento = {
    id: 'pa1', nome: 'Altezza', icona: '📏', ordine: 0, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: [
      { parametro_id: 'par1', obbligatorio: true, ordine: 0 },
      { parametro_id: 'par2', obbligatorio: false, ordine: 1 },
    ],
  }

  it('fa upsert dello strumento, poi dei collegamenti, poi toglie quelli non più presenti', async () => {
    await salvaStrumento('E', strumento)

    expect(mock.chiamate.map(c => [c.sorgente, c.metodo, ...c.args])).toEqual([
      ['strumenti', 'upsert', RIGA_STRUMENTO, { onConflict: 'id' }],
      ['strumento_parametri', 'upsert', [
        { esperimento_id: 'E', strumento_id: 'pa1', parametro_id: 'par1', obbligatorio: true, ordine: 0 },
        { esperimento_id: 'E', strumento_id: 'pa1', parametro_id: 'par2', obbligatorio: false, ordine: 1 },
      ], { onConflict: 'strumento_id,parametro_id' }],
      ['strumento_parametri', 'delete'],
      ['strumento_parametri', 'eq', 'strumento_id', 'pa1'],
      ['strumento_parametri', 'eq', 'esperimento_id', 'E'],
      ['strumento_parametri', 'not', 'parametro_id', 'in', '(par1,par2)'],
    ])
  })

  it('senza parametri elimina tutti i collegamenti dello strumento', async () => {
    await salvaStrumento('E', { ...strumento, parametri: [] })

    expect(mock.chiamate.map(c => [c.sorgente, c.metodo, ...c.args])).toEqual([
      ['strumenti', 'upsert', RIGA_STRUMENTO, { onConflict: 'id' }],
      ['strumento_parametri', 'delete'],
      ['strumento_parametri', 'eq', 'strumento_id', 'pa1'],
      ['strumento_parametri', 'eq', 'esperimento_id', 'E'],
    ])
  })

  it('si ferma al primo errore', async () => {
    mock.risponde('strumenti', { error: errore })
    await expect(salvaStrumento('E', strumento)).rejects.toBe(errore)
    expect(mock.di('strumento_parametri')).toEqual([])
  })

  it('lancia l\'errore dei collegamenti', async () => {
    mock.risponde('strumento_parametri', { error: errore })
    await expect(salvaStrumento('E', strumento)).rejects.toBe(errore)
  })
})

describe('collegaParametri', () => {
  it('aggiunge o aggiorna i collegamenti indicati, senza toccare gli altri dello strumento', async () => {
    await collegaParametri('E', 'pa1', [{ parametro_id: 'par3', obbligatorio: false, ordine: 2 }])

    expect(mock.chiamate.map(c => [c.sorgente, c.metodo, ...c.args])).toEqual([
      ['strumento_parametri', 'upsert', [
        { esperimento_id: 'E', strumento_id: 'pa1', parametro_id: 'par3', obbligatorio: false, ordine: 2 },
      ], { onConflict: 'strumento_id,parametro_id' }],
    ])
  })

  it('senza collegamenti non scrive nulla', async () => {
    await collegaParametri('E', 'pa1', [])
    expect(mock.chiamate).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('strumento_parametri', { error: errore })
    await expect(collegaParametri('E', 'pa1', [{ parametro_id: 'par3', obbligatorio: false, ordine: 2 }])).rejects.toBe(errore)
  })
})

describe('eliminaStrumento', () => {
  it('elimina per id e esperimento', async () => {
    mock.risponde('strumenti', toccata('pa1'))
    await eliminaStrumento('E', 'pa1')
    expect(mock.di('strumenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'pa1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('se non ha eliminato nulla lo dice', async () => {
    mock.risponde('strumenti', { data: [] })
    await expect(eliminaStrumento('E', 'pa1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore (misure collegate: 23503)', async () => {
    const e = { code: '23503', message: 'violates foreign key constraint' }
    mock.risponde('strumenti', { error: e })
    await expect(eliminaStrumento('E', 'pa1')).rejects.toBe(e)
  })
})

describe('archiviaStrumento', () => {
  it('segna lo strumento come archiviato, per id e esperimento (mai una delete)', async () => {
    mock.risponde('strumenti', toccata('pa1'))
    await archiviaStrumento('E', 'pa1')
    expect(mock.di('strumenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { archiviato: true }], ['eq', 'id', 'pa1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('se non ha toccato nulla lo dice', async () => {
    mock.risponde('strumenti', { data: [] })
    await expect(archiviaStrumento('E', 'pa1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('strumenti', { error: errore })
    await expect(archiviaStrumento('E', 'pa1')).rejects.toBe(errore)
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
    mock.risponde('piante', toccata('p1'))
    await aggiornaPianta('E', { ...pianta, etichetta: '9', blocco: 'B' })

    expect(mock.di('piante').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { trattamento_id: 't1', etichetta: '9', blocco: 'B', ordine: 0 }],
      ['eq', 'id', 'p1'],
      ['eq', 'esperimento_id', 'E'],
      ['select', 'id'],
    ])
  })

  it('aggiornaPianta senza righe toccate lo dice', async () => {
    mock.risponde('piante', { data: [] })
    await expect(aggiornaPianta('E', pianta)).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('aggiornaPianta lancia l\'errore di Supabase', async () => {
    mock.risponde('piante', { error: errore })
    await expect(aggiornaPianta('E', pianta)).rejects.toBe(errore)
  })

  it('eliminaPianta elimina per id e esperimento', async () => {
    mock.risponde('piante', toccata('p1'))
    await eliminaPianta('E', 'p1')
    expect(mock.di('piante').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'p1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('eliminaPianta senza righe toccate lo dice', async () => {
    mock.risponde('piante', { data: null })
    await expect(eliminaPianta('E', 'p1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('eliminaPianta lancia l\'errore (misure collegate: 23503)', async () => {
    const e = { code: '23503', message: 'violates foreign key constraint' }
    mock.risponde('piante', { error: e })
    await expect(eliminaPianta('E', 'p1')).rejects.toBe(e)
  })
})

describe('aggiornaTrattamento', () => {
  it('aggiorna l\'etichetta per id e esperimento', async () => {
    mock.risponde('trattamenti', toccata('t1'))
    await aggiornaTrattamento('E', 't1', 'Nuova')
    expect(mock.di('trattamenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { etichetta: 'Nuova' }], ['eq', 'id', 't1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('senza righe toccate lo dice', async () => {
    mock.risponde('trattamenti', { data: [] })
    await expect(aggiornaTrattamento('E', 't1', 'x')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('trattamenti', { error: errore })
    await expect(aggiornaTrattamento('E', 't1', 'x')).rejects.toBe(errore)
  })
})
