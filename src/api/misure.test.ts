import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { Misura } from '@/domain/tipi'
import { aRigaMisura } from './mappers'
import { caricaMisura, eliminaMisura, misureDelGiorno, misurePianta, misureStrumento, salvaMisura, ultimaMisuraPerStrumento, ultimeMisurePiante } from './misure'

const misura: Misura = {
  id: 'm1', pianta_id: 'p1', strumento_id: 'pa1', data_rilievo: '2026-10-28', ora: '09:12',
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

describe('ultimaMisuraPerStrumento', () => {
  it('chiama la RPC e restituisce una mappa strumento -> data più recente', async () => {
    mock.risponde('rpc:ultime_misure_per_strumento', {
      data: [{ strumento_id: 's1', ultima: '2026-10-21' }, { strumento_id: 's2', ultima: '2026-10-07' }],
    })

    expect(await ultimaMisuraPerStrumento('E')).toEqual(new Map([['s1', '2026-10-21'], ['s2', '2026-10-07']]))
    expect(supabase.rpc).toHaveBeenCalledWith('ultime_misure_per_strumento', { p_esperimento: 'E' })
  })

  it('senza misure restituisce una mappa vuota', async () => {
    mock.risponde('rpc:ultime_misure_per_strumento', { data: null })
    expect((await ultimaMisuraPerStrumento('E')).size).toBe(0)
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('rpc:ultime_misure_per_strumento', { error: errore })
    await expect(ultimaMisuraPerStrumento('E')).rejects.toBe(errore)
  })
})

describe('ultimeMisurePiante', () => {
  it('chiama la RPC e restituisce le misure convertite (ora senza secondi)', async () => {
    mock.risponde('rpc:ultime_misure_piante', { data: [riga] })

    expect(await ultimeMisurePiante('E')).toEqual([misura])
    expect(supabase.rpc).toHaveBeenCalledWith('ultime_misure_piante', { p_esperimento: 'E' })
  })

  it('senza misure restituisce una lista vuota', async () => {
    mock.risponde('rpc:ultime_misure_piante', { data: null })
    expect(await ultimeMisurePiante('E')).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('rpc:ultime_misure_piante', { error: errore })
    await expect(ultimeMisurePiante('E')).rejects.toBe(errore)
  })
})

describe('misureStrumento', () => {
  /** Una riga come la dà la lettura a pagine: senza `esperimento_id` né colonne solo-database. */
  const rigaStrumento = (id: string) => ({ id, pianta_id: 'p1', strumento_id: 'pa1', data_rilievo: '2026-10-28', ora: '09:12:00', valori: { par1: [1] } })
  const ids = (misure: Misura[]) => misure.map(m => m.id)
  /** Le risposte a turno, una per pagina: la prima chiamata prende la prima, e così via. */
  function pagine(...risposte: { data?: unknown; error?: unknown }[]) {
    let n = 0
    mock.risponde('misure', () => risposte[n++] ?? { data: [] })
  }

  it('legge solo le colonne che servono (con creato_il, per l\'ordine), di quell\'esperimento e quello strumento, per id, 1000 righe', async () => {
    pagine({ data: [rigaStrumento('a')] }, { data: [] })

    await misureStrumento('E', 'pa1')

    const prima = mock.di('misure').slice(0, 5)
    expect(prima.map(c => [c.metodo, ...c.args])).toEqual([
      ['select', 'id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_il'],
      ['eq', 'esperimento_id', 'E'],
      ['eq', 'strumento_id', 'pa1'],
      ['order', 'id'],
      ['limit', 1000],
    ])
  })

  it('la prima pagina non ha cursore; le successive ripartono dall\'ultimo id ricevuto (id > ultimo)', async () => {
    pagine({ data: [rigaStrumento('a'), rigaStrumento('b')] }, { data: [rigaStrumento('c')] }, { data: [] })

    const misure = await misureStrumento('E', 'pa1')

    expect(ids(misure)).toEqual(['a', 'b', 'c'])
    const cursori = mock.di('misure').filter(c => c.metodo === 'gt').map(c => c.args)
    expect(cursori).toEqual([['id', 'b'], ['id', 'c']])
    // Tre letture: ognuna con il suo limite, e il cursore solo dalla seconda.
    expect(mock.di('misure').filter(c => c.metodo === 'limit')).toHaveLength(3)
    expect(mock.chiamate.findIndex(c => c.metodo === 'gt')).toBeGreaterThan(mock.chiamate.findIndex((c, i) => i > 0 && c.metodo === 'select'))
  })

  it('una pagina più corta di 1000 non chiude la lettura: si finisce solo alla pagina vuota', async () => {
    // Il server (max_rows) può dare meno righe di quelle chieste: 3 su 1000 non vuol dire "finito".
    pagine({ data: [rigaStrumento('a'), rigaStrumento('b'), rigaStrumento('c')] }, { data: [rigaStrumento('d')] }, { data: [] })

    expect(ids(await misureStrumento('E', 'pa1'))).toEqual(['a', 'b', 'c', 'd'])
    expect(mock.di('misure').filter(c => c.metodo === 'select')).toHaveLength(3)
  })

  it('una pagina piena non è l\'ultima: se la successiva è vuota, finisce lì', async () => {
    const piena = Array.from({ length: 1000 }, (_, i) => rigaStrumento(`m${String(i).padStart(4, '0')}`))
    pagine({ data: piena }, { data: [] })

    const misure = await misureStrumento('E', 'pa1')

    expect(misure).toHaveLength(1000)
    expect(mock.di('misure').filter(c => c.metodo === 'gt').map(c => c.args)).toEqual([['id', 'm0999']])
  })

  it('senza misure restituisce una lista vuota (anche con data nulla)', async () => {
    pagine({ data: null })
    expect(await misureStrumento('E', 'pa1')).toEqual([])
  })

  it('ignora i doppioni per id, dentro una pagina e tra pagine', async () => {
    pagine({ data: [rigaStrumento('a'), rigaStrumento('a'), rigaStrumento('b')] }, { data: [rigaStrumento('b'), rigaStrumento('c')] }, { data: [] })

    expect(ids(await misureStrumento('E', 'pa1'))).toEqual(['a', 'b', 'c'])
  })

  it('le restituisce in ordine stabile: data, ora, creazione, id (non quello arbitrario delle pagine per id)', async () => {
    const r = (id: string, data_rilievo: string, ora: string, creato_il: string) => ({ ...rigaStrumento(id), data_rilievo, ora, creato_il })
    // Pagine per id (uuid casuali): l'ordine in cui arrivano non dice quale misura è venuta dopo.
    pagine(
      { data: [r('a', '2026-10-29', '09:00:00', '2026-10-29T09:00:05Z'), r('b', '2026-10-28', '10:00:00', '2026-10-28T10:00:01Z')] },
      { data: [
        r('c', '2026-10-28', '09:00:00', '2026-10-28T09:00:09Z'),
        // Stessa data e stessa ora di 'e': vince la creazione, non l'id.
        r('d', '2026-10-28', '09:00:00', '2026-10-28T09:00:30Z'),
        r('e', '2026-10-28', '09:00:00', '2026-10-28T09:00:20Z'),
        // Anche la creazione uguale: ultimo criterio l'id.
        r('g', '2026-10-27', '08:00:00', '2026-10-27T08:00:00Z'),
        r('f', '2026-10-27', '08:00:00', '2026-10-27T08:00:00Z'),
      ] },
      { data: [] },
    )

    expect(ids(await misureStrumento('E', 'pa1'))).toEqual(['f', 'g', 'c', 'e', 'd', 'b', 'a'])
  })

  it('l\'ordine non dipende da come arrivano le pagine', async () => {
    const r = (id: string, creato_il: string) => ({ ...rigaStrumento(id), creato_il })
    pagine({ data: [r('z', '2026-10-28T09:00:01Z')] }, { data: [r('a', '2026-10-28T09:00:02Z')] }, { data: [] })
    const prima = ids(await misureStrumento('E', 'pa1'))
    pagine({ data: [r('a', '2026-10-28T09:00:02Z')] }, { data: [r('z', '2026-10-28T09:00:01Z')] }, { data: [] })
    expect(ids(await misureStrumento('E', 'pa1'))).toEqual(prima)
    expect(prima).toEqual(['z', 'a'])
  })

  it('converte le righe: l\'ora senza secondi, nessuna colonna solo-database', async () => {
    pagine({ data: [rigaStrumento('a')] }, { data: [] })

    expect(await misureStrumento('E', 'pa1')).toEqual([
      { id: 'a', pianta_id: 'p1', strumento_id: 'pa1', data_rilievo: '2026-10-28', ora: '09:12', valori: { par1: [1] } },
    ])
  })

  it('un errore alla seconda pagina si rilancia: niente risultato a metà', async () => {
    pagine({ data: [rigaStrumento('a')] }, { error: errore })

    await expect(misureStrumento('E', 'pa1')).rejects.toBe(errore)
  })

  it('un errore alla prima pagina si rilancia', async () => {
    pagine({ error: errore })
    await expect(misureStrumento('E', 'pa1')).rejects.toBe(errore)
  })

  it('se il cursore non avanza (il server ignora il filtro) si ferma con un errore invece di girare per sempre', async () => {
    pagine({ data: [rigaStrumento('a')] }, { data: [rigaStrumento('a')] }, { data: [rigaStrumento('a')] })

    await expect(misureStrumento('E', 'pa1')).rejects.toThrow()
    expect(mock.di('misure').filter(c => c.metodo === 'select').length).toBeLessThanOrEqual(3)
  })
})
