import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { Nota } from '@/domain/tipi'
import { ELEMENTO_NON_TROVATO } from '@/lib/errori'
import { eliminaNota, listaNote, salvaNota, segnaFatto } from './note'

const nota: Nota = {
  id: 'n1', data: '2026-11-01', testo: 'Irrigato', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [],
}
const toccata = (id: string) => ({ data: [{ id }] })

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})
afterEach(() => { vi.useRealTimers() })

describe('listaNote', () => {
  it('legge le note dell\'esperimento con i collegamenti, dalla data più recente e poi dall\'ultima creata', async () => {
    mock.risponde('note', {
      data: [{
        id: 'n1', esperimento_id: 'E', data: '2026-11-01', testo: 'Irrigato', promemoria: false, fatto_il: null,
        note_piante: [{ pianta_id: 'p1' }], note_trattamenti: [],
      }],
    })

    const note = await listaNote('E')

    expect(note).toEqual([{ ...nota, pianta_ids: ['p1'] }])
    expect(mock.di('note').map(c => [c.metodo, ...c.args])).toEqual([
      ['select', '*, note_piante(pianta_id), note_trattamenti(trattamento_id)'],
      ['eq', 'esperimento_id', 'E'],
      ['order', 'data', { ascending: false }],
      ['order', 'creato_il', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['range', 0, 999],
    ])
  })

  it('senza note restituisce un elenco vuoto', async () => {
    mock.risponde('note', { data: null })
    expect(await listaNote('E')).toEqual([])
  })

  it('legge a pagine: oltre le mille note non ne perde', async () => {
    const riga = (i: number) => ({
      id: `n${i}`, esperimento_id: 'E', data: '2026-11-01', testo: 't', promemoria: false, fatto_il: null,
      note_piante: [], note_trattamenti: [],
    })
    const pagine = [Array.from({ length: 1000 }, (_, i) => riga(i)), [riga(1000)]]
    vi.mocked(supabase.from).mockImplementation((() => {
      const pagina = pagine.shift() ?? []
      const q: unknown = new Proxy({}, {
        get: (_t, prop) => prop === 'then'
          ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: pagina, error: null }).then(ok)
          : () => q,
      })
      return q
    }) as never)

    expect(await listaNote('E')).toHaveLength(1001)
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('note', { error: e })
    await expect(listaNote('E')).rejects.toBe(e)
  })
})

describe('salvaNota', () => {
  it('senza collegamenti: upsert per id e tolti tutti i collegamenti, mai creato_da', async () => {
    await salvaNota('E', nota)

    expect(mock.di('note')).toEqual([
      { sorgente: 'note', metodo: 'upsert', args: [{ id: 'n1', esperimento_id: 'E', data: '2026-11-01', testo: 'Irrigato', promemoria: false, fatto_il: null }, { onConflict: 'id' }] },
    ])
    expect(mock.di('note_piante').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'nota_id', 'n1'], ['eq', 'esperimento_id', 'E']])
    expect(mock.di('note_trattamenti').map(c => [c.metodo, ...c.args])).toEqual([['delete'], ['eq', 'nota_id', 'n1'], ['eq', 'esperimento_id', 'E']])
  })

  it('scrive prima la nota, poi i collegamenti nuovi, infine toglie quelli non più presenti', async () => {
    await salvaNota('E', { ...nota, pianta_ids: ['p1', 'p2'] })

    expect(mock.chiamate.map(c => `${c.sorgente}.${c.metodo}`)).toEqual([
      'note.upsert',
      'note_piante.upsert',
      'note_piante.delete', 'note_piante.eq', 'note_piante.eq', 'note_piante.not',
      'note_trattamenti.delete', 'note_trattamenti.eq', 'note_trattamenti.eq',
    ])
    expect(mock.di('note_piante')[0].args).toEqual([
      [
        { nota_id: 'n1', pianta_id: 'p1', esperimento_id: 'E' },
        { nota_id: 'n1', pianta_id: 'p2', esperimento_id: 'E' },
      ],
      { onConflict: 'nota_id,pianta_id' },
    ])
    expect(mock.di('note_piante').at(-1)).toEqual({ sorgente: 'note_piante', metodo: 'not', args: ['pianta_id', 'in', '(p1,p2)'] })
  })

  it('i trattamenti si collegano allo stesso modo', async () => {
    await salvaNota('E', { ...nota, trattamento_ids: ['t1'] })

    expect(mock.di('note_trattamenti')[0]).toEqual({
      sorgente: 'note_trattamenti', metodo: 'upsert',
      args: [[{ nota_id: 'n1', trattamento_id: 't1', esperimento_id: 'E' }], { onConflict: 'nota_id,trattamento_id' }],
    })
    expect(mock.di('note_trattamenti').at(-1)).toEqual({ sorgente: 'note_trattamenti', metodo: 'not', args: ['trattamento_id', 'in', '(t1)'] })
  })

  it('un id ripetuto si scrive una volta sola (altrimenti l\'upsert fallisce)', async () => {
    await salvaNota('E', { ...nota, pianta_ids: ['p1', 'p1'] })
    expect((mock.di('note_piante')[0].args[0] as unknown[]).length).toBe(1)
  })

  it('un promemoria non azzera fatto_il nella nota (lo scrive solo la spunta)', async () => {
    await salvaNota('E', { ...nota, promemoria: true, fatto_il: '2026-11-01T09:00:00Z' })
    expect(mock.di('note')[0].args[0]).not.toHaveProperty('fatto_il')
  })

  it('se la nota non si salva, non tocca i collegamenti', async () => {
    const e = { code: '23514', message: 'testo vuoto' }
    mock.risponde('note', { error: e })

    await expect(salvaNota('E', { ...nota, pianta_ids: ['p1'] })).rejects.toBe(e)
    expect(mock.di('note_piante')).toEqual([])
    expect(mock.di('note_trattamenti')).toEqual([])
  })

  it('se i collegamenti nuovi falliscono, non toglie quelli vecchi', async () => {
    const e = { code: '23503', message: 'pianta di un altro esperimento' }
    mock.risponde('note_piante', { error: e })

    await expect(salvaNota('E', { ...nota, pianta_ids: ['p1'] })).rejects.toBe(e)
    expect(mock.di('note_piante').map(c => c.metodo)).toEqual(['upsert'])
    expect(mock.di('note_trattamenti')).toEqual([])
  })

  it('se la rimozione dei vecchi collegamenti fallisce, lancia l\'errore', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('note_trattamenti', { error: e })
    await expect(salvaNota('E', nota)).rejects.toBe(e)
  })
})

describe('eliminaNota', () => {
  it('elimina la nota dell\'esperimento e controlla la riga', async () => {
    mock.risponde('note', toccata('n1'))

    await eliminaNota('E', 'n1')

    expect(mock.di('note').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'n1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('una nota già eliminata altrove non sembra eliminata da noi', async () => {
    mock.risponde('note', { data: [] })
    await expect(eliminaNota('E', 'n1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('note', { error: e })
    await expect(eliminaNota('E', 'n1')).rejects.toBe(e)
  })
})

describe('segnaFatto', () => {
  it('spuntando salva data e ora e controlla la riga', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T10:30:00Z'))
    mock.risponde('note', toccata('n1'))

    await segnaFatto('E', 'n1', true)

    expect(mock.di('note').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { fatto_il: '2026-11-01T10:30:00.000Z' }], ['eq', 'id', 'n1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('togliendo la spunta azzera fatto_il', async () => {
    mock.risponde('note', toccata('n1'))
    await segnaFatto('E', 'n1', false)
    expect(mock.di('note')[0]).toEqual({ sorgente: 'note', metodo: 'update', args: [{ fatto_il: null }] })
  })

  it('una nota eliminata nel frattempo fa fallire la spunta', async () => {
    mock.risponde('note', { data: [] })
    await expect(segnaFatto('E', 'n1', true)).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })
})
