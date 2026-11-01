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
  /** Un client che risponde con le pagine date, una per chiamata, e registra gli `range` chiesti. */
  function pagineDa(pagine: unknown[][]) {
    const chiamate: unknown[][] = []
    const range: unknown[][] = []
    vi.mocked(supabase.from).mockImplementation((() => {
      const pagina = pagine.shift() ?? []
      const q: unknown = new Proxy({}, {
        get: (_t, prop) => prop === 'then'
          ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: pagina, error: null }).then(ok)
          : (...args: unknown[]) => {
            chiamate.push([prop, ...args])
            if (prop === 'range') range.push(args)
            return q
          },
      })
      return q
    }) as never)
    return { chiamate, range }
  }
  const rigaNota = (i: number) => ({
    id: `n${i}`, esperimento_id: 'E', data: '2026-11-01', testo: 't', promemoria: false, fatto_il: null,
    note_piante: [], note_trattamenti: [],
  })

  it('legge le note dell\'esperimento con i collegamenti, dalla data più recente e poi dall\'ultima creata', async () => {
    const { chiamate } = pagineDa([
      [{ ...rigaNota(1), testo: 'Irrigato', note_piante: [{ pianta_id: 'p1' }] }],
      [],
    ])

    const note = await listaNote('E')

    expect(note).toEqual([{ ...nota, pianta_ids: ['p1'] }])
    expect(chiamate.slice(0, 6)).toEqual([
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

  it('legge a pagine fino a una pagina vuota, ripartendo da quante righe sono arrivate', async () => {
    const { range } = pagineDa([[0, 1, 2].map(rigaNota), [3, 4].map(rigaNota), []])

    const note = await listaNote('E')

    expect(note.map(n => n.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4'])
    expect(range).toEqual([[0, 999], [3, 1002], [5, 1004]])
  })

  it('non perde le note se il server dà meno di mille righe per pagina (max_rows più basso)', async () => {
    const tutte = Array.from({ length: 1001 }, (_, i) => rigaNota(i))
    pagineDa([tutte.slice(0, 500), tutte.slice(500, 1000), tutte.slice(1000), []])
    expect(await listaNote('E')).toHaveLength(1001)
  })

  it('una nota che compare in due pagine (inserimento concorrente) resta una sola', async () => {
    pagineDa([[0, 1].map(rigaNota), [1, 2].map(rigaNota), []])
    expect((await listaNote('E')).map(n => n.id)).toEqual(['n0', 'n1', 'n2'])
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('note', { error: e })
    await expect(listaNote('E')).rejects.toBe(e)
  })
})

describe('salvaNota', () => {
  /** Le chiamate di una tabella come [metodo, ...argomenti], per confrontarle per intero. */
  const metodi = (tabella: string) => mock.di(tabella).map(c => [c.metodo, ...c.args])
  const sequenza = () => mock.chiamate
    .filter(c => ['select', 'upsert', 'delete'].includes(c.metodo))
    .map(c => `${c.sorgente}.${c.metodo}`)
  /** I collegamenti che la nota ha già nel database, come li restituisce la select. */
  const eraCollegataA = (tabella: 'note_piante' | 'note_trattamenti', colonna: string, ids: string[]) =>
    mock.risponde(tabella, m => ({ data: m.includes('select') ? ids.map(id => ({ [colonna]: id })) : null }))

  it('senza collegamenti né vecchi né nuovi: solo la nota, upsert per id, mai creato_da', async () => {
    await salvaNota('E', nota)

    expect(mock.di('note')).toEqual([
      { sorgente: 'note', metodo: 'upsert', args: [{ id: 'n1', esperimento_id: 'E', data: '2026-11-01', testo: 'Irrigato', promemoria: false, fatto_il: null }, { onConflict: 'id' }] },
    ])
    expect(metodi('note_piante')).toEqual([['select', 'pianta_id'], ['eq', 'nota_id', 'n1'], ['eq', 'esperimento_id', 'E']])
    expect(metodi('note_trattamenti')).toEqual([['select', 'trattamento_id'], ['eq', 'nota_id', 'n1'], ['eq', 'esperimento_id', 'E']])
  })

  it('scrive la nota, legge i collegamenti che ha, scrive tutti i nuovi e solo alla fine toglie i vecchi', async () => {
    eraCollegataA('note_piante', 'pianta_id', ['p1', 'p9'])
    eraCollegataA('note_trattamenti', 'trattamento_id', ['t9'])

    await salvaNota('E', { ...nota, pianta_ids: ['p1', 'p2'], trattamento_ids: [] })

    expect(sequenza()).toEqual([
      'note.upsert',
      'note_piante.select', 'note_trattamenti.select',
      'note_piante.upsert',
      'note_piante.delete', 'note_trattamenti.delete',
    ])
    expect(mock.di('note_piante').find(c => c.metodo === 'upsert')?.args).toEqual([
      [
        { nota_id: 'n1', pianta_id: 'p1', esperimento_id: 'E' },
        { nota_id: 'n1', pianta_id: 'p2', esperimento_id: 'E' },
      ],
      { onConflict: 'nota_id,pianta_id' },
    ])
  })

  it('cancella solo i collegamenti tolti, con i loro id (niente "not in" con tutti gli altri)', async () => {
    eraCollegataA('note_piante', 'pianta_id', ['p1', 'p9', 'p8'])

    await salvaNota('E', { ...nota, pianta_ids: ['p1', 'p2'] })

    expect(metodi('note_piante').slice(-4)).toEqual([
      ['delete'], ['eq', 'nota_id', 'n1'], ['eq', 'esperimento_id', 'E'], ['in', 'pianta_id', ['p9', 'p8']],
    ])
    expect(mock.di('note_piante').some(c => c.metodo === 'not')).toBe(false)
  })

  it('se non è stato tolto nessun collegamento, non cancella nulla', async () => {
    eraCollegataA('note_piante', 'pianta_id', ['p1'])
    eraCollegataA('note_trattamenti', 'trattamento_id', ['t1'])

    await salvaNota('E', { ...nota, pianta_ids: ['p1', 'p2'], trattamento_ids: ['t1'] })

    expect(sequenza().filter(x => x.endsWith('.delete'))).toEqual([])
  })

  it('togliendo tutti i collegamenti li cancella tutti con i loro id', async () => {
    eraCollegataA('note_trattamenti', 'trattamento_id', ['t1', 't2'])

    await salvaNota('E', nota)

    expect(metodi('note_trattamenti').slice(-1)).toEqual([['in', 'trattamento_id', ['t1', 't2']]])
    expect(sequenza().filter(x => x.startsWith('note_piante.delete'))).toEqual([])
  })

  it('i trattamenti si collegano allo stesso modo', async () => {
    await salvaNota('E', { ...nota, trattamento_ids: ['t1'] })

    expect(mock.di('note_trattamenti').find(c => c.metodo === 'upsert')).toEqual({
      sorgente: 'note_trattamenti', metodo: 'upsert',
      args: [[{ nota_id: 'n1', trattamento_id: 't1', esperimento_id: 'E' }], { onConflict: 'nota_id,trattamento_id' }],
    })
  })

  it('un id ripetuto si scrive una volta sola (altrimenti l\'upsert fallisce)', async () => {
    await salvaNota('E', { ...nota, pianta_ids: ['p1', 'p1'] })
    expect((mock.di('note_piante').find(c => c.metodo === 'upsert')?.args[0] as unknown[]).length).toBe(1)
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

  it('passando da Piante a Trattamenti, se i trattamenti non si scrivono non toglie le piante', async () => {
    const e = { code: '23503', message: 'trattamento di un altro esperimento' }
    eraCollegataA('note_piante', 'pianta_id', ['p1', 'p2'])
    mock.risponde('note_trattamenti', m => (m.includes('upsert') ? { error: e } : { data: [] }))

    await expect(salvaNota('E', { ...nota, pianta_ids: [], trattamento_ids: ['t1'] })).rejects.toBe(e)

    expect(sequenza().filter(x => x.endsWith('.delete'))).toEqual([])
    expect(mock.di('note_piante').map(c => c.metodo)).not.toContain('delete')
  })

  it('se i collegamenti nuovi non si scrivono, non toglie quelli vecchi', async () => {
    const e = { code: '23503', message: 'pianta di un altro esperimento' }
    eraCollegataA('note_trattamenti', 'trattamento_id', ['t1'])
    mock.risponde('note_piante', m => (m.includes('upsert') ? { error: e } : { data: [] }))

    await expect(salvaNota('E', { ...nota, pianta_ids: ['p1'] })).rejects.toBe(e)
    expect(sequenza().filter(x => x.endsWith('.delete'))).toEqual([])
  })

  it('se non riesce a leggere i collegamenti esistenti, non scrive né toglie nulla', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('note_piante', { error: e })

    await expect(salvaNota('E', { ...nota, pianta_ids: ['p1'] })).rejects.toBe(e)
    expect(sequenza().filter(x => x.endsWith('.upsert') && x !== 'note.upsert')).toEqual([])
    expect(sequenza().filter(x => x.endsWith('.delete'))).toEqual([])
  })

  it('se la rimozione dei vecchi collegamenti fallisce, lancia l\'errore', async () => {
    const e = { code: '42501', message: 'negato' }
    mock.risponde('note_trattamenti', m => (m.includes('delete') ? { error: e } : { data: [{ trattamento_id: 't1' }] }))
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
