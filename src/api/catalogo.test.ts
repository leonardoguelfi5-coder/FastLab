import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { VoceCatalogo } from '@/domain/tipi'
import { ELEMENTO_NON_TROVATO } from '@/lib/errori'
import { archiviaVoceCatalogo, listaCatalogo, salvaVoceCatalogo } from './catalogo'

const termometro: VoceCatalogo = {
  id: 'c2', nome: 'Termometro', icona: '🌡', descrizione: 'Temperatura dell\'aria e della pianta.', archiviato: false,
  parametri: [
    { chiave: 'temp_aria', nome: 'Temp aria', unita: '°C', n_letture: 1, valore_min: null, valore_max: null },
    { chiave: 'temp_pianta', nome: 'Temp pianta', unita: '°C', n_letture: 2, valore_min: -5, valore_max: 50 },
  ],
}

/** Una riga come la restituisce PostgREST con select('*'), con le colonne solo del database. */
const riga = (v: VoceCatalogo) => ({
  ...v, creato_da: 'u1', creato_il: '2026-10-29T08:00:00+00:00', aggiornato_il: '2026-10-29T08:00:00+00:00',
})

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('listaCatalogo', () => {
  it('legge le voci non archiviate, ordinate per nome', async () => {
    mock.risponde('catalogo_strumenti', { data: [riga(termometro)] })

    await listaCatalogo()

    expect(mock.di('catalogo_strumenti')).toEqual([
      { sorgente: 'catalogo_strumenti', metodo: 'select', args: ['*'] },
      { sorgente: 'catalogo_strumenti', metodo: 'eq', args: ['archiviato', false] },
      { sorgente: 'catalogo_strumenti', metodo: 'order', args: ['nome'] },
    ])
  })

  it('restituisce le voci del dominio, senza colonne del database', async () => {
    mock.risponde('catalogo_strumenti', { data: [riga(termometro)] })

    expect(await listaCatalogo()).toEqual([termometro])
  })

  it('ordina senza badare alle maiuscole (il database mette le maiuscole prima)', async () => {
    const voce = (id: string, nome: string): VoceCatalogo => ({ ...termometro, id, nome })
    mock.risponde('catalogo_strumenti', { data: [voce('1', 'SPAD'), voce('2', 'calibro'), voce('3', 'Metro')].map(riga) })

    expect((await listaCatalogo()).map(v => v.nome)).toEqual(['calibro', 'Metro', 'SPAD'])
  })

  it('legge con tolleranza i valori salvati male: i campi mancanti prendono i default', async () => {
    mock.risponde('catalogo_strumenti', {
      data: [{
        id: 'c9', nome: 'Strano', icona: null, descrizione: null, archiviato: false,
        parametri: [{ chiave: 'x', nome: 'X' }, { chiave: 'y', nome: 'Y', unita: 'cm', n_letture: 0, valore_min: '3' }],
      }],
    })

    expect(await listaCatalogo()).toEqual([{
      id: 'c9', nome: 'Strano', icona: null, descrizione: '', archiviato: false,
      parametri: [
        { chiave: 'x', nome: 'X', unita: null, n_letture: 1, valore_min: null, valore_max: null },
        { chiave: 'y', nome: 'Y', unita: 'cm', n_letture: 1, valore_min: null, valore_max: null },
      ],
    }])
  })

  it('scarta i valori senza chiave (o con chiave vuota): il confronto per chiave non li distinguerebbe', async () => {
    mock.risponde('catalogo_strumenti', {
      data: [{
        ...riga(termometro),
        parametri: [
          { nome: 'Senza chiave' }, { chiave: '   ', nome: 'Spazi' }, { chiave: 7, nome: 'Numero' }, null,
          ...termometro.parametri,
        ],
      }],
    })
    expect((await listaCatalogo())[0].parametri).toEqual(termometro.parametri)
  })

  it('parametri che non sono un array diventano un elenco vuoto', async () => {
    mock.risponde('catalogo_strumenti', { data: [{ ...riga(termometro), parametri: null }] })
    expect((await listaCatalogo())[0].parametri).toEqual([])
  })

  it('senza dati restituisce un elenco vuoto', async () => {
    mock.risponde('catalogo_strumenti', { data: null })
    expect(await listaCatalogo()).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'permission denied' }
    mock.risponde('catalogo_strumenti', { error: e })
    await expect(listaCatalogo()).rejects.toBe(e)
  })
})

describe('salvaVoceCatalogo', () => {
  it('fa upsert per id con le sole colonne scrivibili', async () => {
    await salvaVoceCatalogo(termometro)

    expect(mock.di('catalogo_strumenti')).toEqual([{
      sorgente: 'catalogo_strumenti', metodo: 'upsert',
      args: [{
        id: 'c2', nome: 'Termometro', icona: '🌡', descrizione: termometro.descrizione,
        parametri: termometro.parametri, archiviato: false,
      }, { onConflict: 'id' }],
    }])
  })

  it('non manda mai creato_da, creato_il o aggiornato_il, anche se l\'oggetto li porta', async () => {
    await salvaVoceCatalogo(riga(termometro) as VoceCatalogo)

    const payload = mock.di('catalogo_strumenti')[0].args[0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['archiviato', 'descrizione', 'icona', 'id', 'nome', 'parametri'])
  })

  it('lancia l\'errore di Supabase (es. nome doppio nel catalogo)', async () => {
    const e = { code: '23505', message: 'duplicate key value violates unique constraint "catalogo_strumenti_nome_unico"' }
    mock.risponde('catalogo_strumenti', { error: e })
    await expect(salvaVoceCatalogo(termometro)).rejects.toBe(e)
  })
})

describe('archiviaVoceCatalogo', () => {
  it('archivia la voce (mai delete) e controlla che una riga sia stata toccata', async () => {
    mock.risponde('catalogo_strumenti', { data: [{ id: 'c2' }] })

    await archiviaVoceCatalogo('c2')

    expect(mock.di('catalogo_strumenti')).toEqual([
      { sorgente: 'catalogo_strumenti', metodo: 'update', args: [{ archiviato: true }] },
      { sorgente: 'catalogo_strumenti', metodo: 'eq', args: ['id', 'c2'] },
      { sorgente: 'catalogo_strumenti', metodo: 'select', args: ['id'] },
    ])
  })

  it('senza righe toccate dice che la voce non c\'è più', async () => {
    mock.risponde('catalogo_strumenti', { data: [] })
    await expect(archiviaVoceCatalogo('c2')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    const e = { code: '42501', message: 'permission denied' }
    mock.risponde('catalogo_strumenti', { error: e })
    await expect(archiviaVoceCatalogo('c2')).rejects.toBe(e)
  })
})
