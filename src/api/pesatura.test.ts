import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { AnalisiPesatura, CampionePesatura, Peso, SessionePesatura } from '@/domain/pesatura/tipi'
import { ELEMENTO_NON_TROVATO, ePesoGiaInserito, messaggioErrore, PESO_GIA_INSERITO } from '@/lib/errori'
import {
  aggiornaSessione, creaSessione, eliminaPeso, eliminaSessione, listaAnalisi, listaPesatura, salvaAnalisi, salvaCampioni, salvaPeso,
} from './pesatura'

const impostazioni = { repliche: 1, rapportoTampone: null, sensore: null }
const analisi: AnalisiPesatura = { id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g', impostazioni, archiviata: false }
const sessione: SessionePesatura = {
  id: 's1', esperimento_id: 'E', analisi_id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g', impostazioni,
  data: '2026-11-11', nota: null, conclusa: false,
}
const campione: CampionePesatura = { id: 'c1', sessione_id: 's1', pianta_id: 'p1', nome: null, substrato: null, ordine: 1 }
const peso: Peso = { id: 'w1', campione_id: 'c1', replica: 1, tipo: 'fresco', valore: 1.25, lettura: null, misurato_il: '2026-11-11T09:00:00Z' }

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

/** Un client che risponde con le pagine date per tabella (una per chiamata) e registra gli `range` chiesti. */
function pagineDa(pagine: Record<string, unknown[][]>) {
  const range: Record<string, unknown[][]> = {}
  vi.mocked(supabase.from).mockImplementation(((tabella: string) => {
    const pagina = pagine[tabella]?.shift() ?? []
    const q: unknown = new Proxy({}, {
      get: (_t, prop) => prop === 'then'
        ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: pagina, error: null }).then(ok)
        : (...args: unknown[]) => {
          if (prop === 'range') (range[tabella] ??= []).push(args)
          return q
        },
    })
    return q
  }) as never)
  return range
}
const rigaSessione = (i: number) => ({ ...sessione, id: `s${i}`, creato_da: 'u1', creato_il: '2026-11-11T08:00:00Z', aggiornato_il: 'x' })
const rigaCampione = (i: number) => ({ ...campione, id: `c${i}`, esperimento_id: 'E', creato_il: 'x', aggiornato_il: 'x' })
const rigaPeso = (i: number) => ({ ...peso, id: `w${i}`, sessione_id: 's1', esperimento_id: 'E', creato_da: 'u1', creato_il: 'x', aggiornato_il: 'x' })

describe('listaAnalisi', () => {
  it('legge tutte le analisi visibili, ordinate per titolo', async () => {
    mock.risponde('analisi_pesatura', { data: [{ ...analisi, creato_da: 'u1', creato_il: 'x', aggiornato_il: 'x' }] })

    expect(await listaAnalisi('E')).toEqual([{ ...analisi, creato_da: 'u1' }])
    expect(mock.di('analisi_pesatura').map(c => [c.metodo, ...c.args])).toEqual([['select', '*'], ['order', 'titolo', { ascending: true }]])
  })

  it('senza analisi dà un elenco vuoto', async () => {
    mock.risponde('analisi_pesatura', { data: null })
    expect(await listaAnalisi('E')).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('analisi_pesatura', { error: e })
    await expect(listaAnalisi('E')).rejects.toBe(e)
  })
})

describe('impostazioni vuote nel database ({})', () => {
  const predefinite = { repliche: 1, rapportoTampone: null, sensore: null }

  it('analisi e sessioni ricevono le impostazioni predefinite', async () => {
    mock.risponde('analisi_pesatura', { data: [{ ...analisi, impostazioni: {} }] })
    expect((await listaAnalisi('E'))[0].impostazioni).toEqual(predefinite)

    pagineDa({ sessioni_pesatura: [[{ ...rigaSessione(1), impostazioni: {} }], []], campioni_pesatura: [[]], pesi: [[]] })
    expect((await listaPesatura('E')).sessioni[0].impostazioni).toEqual(predefinite)
  })

  it('i campi presenti restano, quelli mancanti si completano', async () => {
    mock.risponde('analisi_pesatura', { data: [{ ...analisi, impostazioni: { repliche: 3 } }] })
    expect((await listaAnalisi('E'))[0].impostazioni).toEqual({ ...predefinite, repliche: 3 })
  })
})

describe('salvaAnalisi', () => {
  it('upsert per id, senza creato_da', async () => {
    await salvaAnalisi({ ...analisi, creato_da: 'u1' })

    expect(mock.di('analisi_pesatura')).toEqual([{
      sorgente: 'analisi_pesatura', metodo: 'upsert',
      args: [{ id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g', impostazioni, archiviata: false }, { onConflict: 'id' }],
    }])
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '23514', message: 'tipo' }
    mock.risponde('analisi_pesatura', { error: e })
    await expect(salvaAnalisi(analisi)).rejects.toBe(e)
  })
})

describe('listaPesatura', () => {
  it('legge sessioni, campioni e pesi dell\'esperimento', async () => {
    pagineDa({
      sessioni_pesatura: [[rigaSessione(1)], []],
      campioni_pesatura: [[rigaCampione(1)], []],
      pesi: [[rigaPeso(1)], []],
    })

    const dati = await listaPesatura('E')

    expect(dati.sessioni).toEqual([{ ...sessione, id: 's1', creato_da: 'u1', creato_il: '2026-11-11T08:00:00Z' }])
    expect(dati.campioni).toEqual([{ ...campione, id: 'c1' }])
    expect(dati.pesi).toEqual([{ ...peso, id: 'w1', creato_da: 'u1' }])
  })

  it('legge a pagine fino a una pagina vuota, ripartendo da quante righe sono arrivate', async () => {
    const range = pagineDa({
      sessioni_pesatura: [[1, 2, 3].map(rigaSessione), [4, 5].map(rigaSessione), []],
      campioni_pesatura: [[]],
      pesi: [[]],
    })

    const { sessioni } = await listaPesatura('E')

    expect(sessioni.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(range.sessioni_pesatura).toEqual([[0, 999], [3, 1002], [5, 1004]])
  })

  it('pesi e campioni a più pagine, senza doppioni se una riga si sposta tra due pagine', async () => {
    pagineDa({
      sessioni_pesatura: [[]],
      campioni_pesatura: [[1, 2].map(rigaCampione), [2, 3].map(rigaCampione), []],
      pesi: [[1, 2].map(rigaPeso), [2, 3].map(rigaPeso), []],
    })

    const { campioni, pesi } = await listaPesatura('E')

    expect(campioni.map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(pesi.map(p => p.id)).toEqual(['w1', 'w2', 'w3'])
  })

  it('filtra per esperimento e ordina per id, per un paging stabile', async () => {
    mock.risponde('pesi', { data: [] })
    await listaPesatura('E')
    expect(mock.di('pesi').map(c => [c.metodo, ...c.args]).slice(0, 3)).toEqual([
      ['select', '*'], ['eq', 'esperimento_id', 'E'], ['order', 'id', { ascending: true }],
    ])
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('pesi', { error: e })
    await expect(listaPesatura('E')).rejects.toBe(e)
  })
})

describe('creaSessione', () => {
  it('scrive la sessione prima dei campioni, senza creato_da', async () => {
    await creaSessione({ ...sessione, creato_da: 'u1', creato_il: 'x' }, [campione])

    expect(mock.chiamate.filter(c => c.metodo === 'upsert').map(c => c.sorgente)).toEqual(['sessioni_pesatura', 'campioni_pesatura'])
    expect(mock.di('sessioni_pesatura')[0].args).toEqual([
      {
        id: 's1', esperimento_id: 'E', analisi_id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g', impostazioni,
        data: '2026-11-11', nota: null, conclusa: false,
      },
      { onConflict: 'id' },
    ])
    expect(mock.di('campioni_pesatura')[0].args).toEqual([
      [{ id: 'c1', sessione_id: 's1', esperimento_id: 'E', pianta_id: 'p1', nome: null, substrato: null, ordine: 1 }],
      { onConflict: 'id' },
    ])
  })

  it('se la sessione fallisce non scrive i campioni', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('sessioni_pesatura', { error: e })

    await expect(creaSessione(sessione, [campione])).rejects.toBe(e)
    expect(mock.di('campioni_pesatura')).toEqual([])
  })

  it('senza campioni scrive solo la sessione', async () => {
    await creaSessione(sessione, [])
    expect(mock.di('campioni_pesatura')).toEqual([])
  })

  it('lancia l\'errore dei campioni', async () => {
    const e = { code: '23503', message: 'pianta' }
    mock.risponde('campioni_pesatura', { error: e })
    await expect(creaSessione(sessione, [campione])).rejects.toBe(e)
  })
})

describe('aggiornaSessione', () => {
  it('aggiorna solo data, nota e conclusa e controlla la riga', async () => {
    mock.risponde('sessioni_pesatura', { data: [{ id: 's1' }] })

    await aggiornaSessione({ id: 's1', data: '2026-11-12', nota: 'ok', conclusa: true })

    expect(mock.di('sessioni_pesatura').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { data: '2026-11-12', nota: 'ok', conclusa: true }], ['eq', 'id', 's1'], ['select', 'id'],
    ])
  })

  it('una sessione eliminata nel frattempo fa fallire', async () => {
    mock.risponde('sessioni_pesatura', { data: [] })
    await expect(aggiornaSessione({ id: 's1', data: '2026-11-12', nota: null, conclusa: false })).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })
})

describe('salvaCampioni', () => {
  it('upsert per id con l\'esperimento', async () => {
    await salvaCampioni('E', [campione, { ...campione, id: 'c2', ordine: 2 }])

    const [righe, opzioni] = mock.di('campioni_pesatura')[0].args as [{ id: string; esperimento_id: string }[], unknown]
    expect(righe.map(r => [r.id, r.esperimento_id])).toEqual([['c1', 'E'], ['c2', 'E']])
    expect(opzioni).toEqual({ onConflict: 'id' })
  })

  it('senza campioni non chiama il database', async () => {
    await salvaCampioni('E', [])
    expect(mock.chiamate).toEqual([])
  })
})

describe('salvaPeso', () => {
  it('upsert per id con un payload senza creato_da', async () => {
    await salvaPeso('E', 's1', { ...peso, creato_da: 'u1' })

    expect(mock.di('pesi')).toEqual([{
      sorgente: 'pesi', metodo: 'upsert',
      args: [
        {
          id: 'w1', campione_id: 'c1', sessione_id: 's1', esperimento_id: 'E', replica: 1, tipo: 'fresco', valore: 1.25,
          lettura: null, misurato_il: '2026-11-11T09:00:00Z',
        },
        { onConflict: 'id' },
      ],
    }])
    expect(mock.di('pesi')[0].args[0]).not.toHaveProperty('creato_da')
  })

  it('lascia passare l\'errore dell\'indice pesi_unico, riconoscibile da ePesoGiaInserito', async () => {
    const e = { code: '23505', message: 'duplicate key value violates unique constraint "pesi_unico"' }
    mock.risponde('pesi', { error: e })

    const errore = await salvaPeso('E', 's1', peso).catch(x => x)

    expect(errore).toBe(e)
    expect(ePesoGiaInserito(errore)).toBe(true)
  })
})

describe('eliminaPeso ed eliminaSessione', () => {
  it('eliminano per id e controllano la riga', async () => {
    mock.risponde('pesi', { data: [{ id: 'w1' }] })
    mock.risponde('sessioni_pesatura', { data: [{ id: 's1' }] })

    await eliminaPeso('w1')
    await eliminaSessione('s1')

    expect(mock.di('pesi').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'id', 'w1'], ['select', 'id']])
    expect(mock.di('sessioni_pesatura').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'id', 's1'], ['select', 'id']])
  })

  it('un elemento già eliminato non sembra eliminato da noi', async () => {
    mock.risponde('pesi', { data: [] })
    mock.risponde('sessioni_pesatura', { data: [] })
    await expect(eliminaPeso('w1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
    await expect(eliminaSessione('s1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })
})

describe('ePesoGiaInserito', () => {
  const unico = { code: '23505', message: 'duplicate key value violates unique constraint "pesi_unico"' }

  it('vero per 23505 sull\'indice pesi_unico', () => {
    expect(ePesoGiaInserito(unico)).toBe(true)
    expect(messaggioErrore(unico)).toBe(PESO_GIA_INSERITO)
  })

  it('falso per altri indici, altri codici, errori senza codice e valori strani', () => {
    expect(ePesoGiaInserito({ code: '23505', message: 'duplicate key value violates unique constraint "pesi_pkey"' })).toBe(false)
    expect(ePesoGiaInserito({ code: '42501', message: 'pesi_unico' })).toBe(false)
    expect(ePesoGiaInserito(new Error('pesi_unico'))).toBe(false)
    expect(ePesoGiaInserito(null)).toBe(false)
  })
})
