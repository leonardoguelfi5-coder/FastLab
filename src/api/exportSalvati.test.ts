import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import { ELEMENTO_NON_TROVATO, eNomeExportGiaUsato, messaggioErrore } from '@/lib/errori'
import { eliminaExportSalvato, listaExportSalvati, salvaExportSalvato } from './exportSalvati'

const scelte = { v: 1, strumenti: { modo: 'tutti' }, piante: { modo: 'tutte' }, periodo: { modo: 'tutto' }, come: { valori: true, medie: false, grafici: false, diario: false, info: false } }
const riga = (id: string, nome: string) => ({
  id, esperimento_id: 'E', nome, scelte, creato_da: 'u1', creato_il: '2026-10-28T08:00:00Z', aggiornato_il: '2026-10-29T08:00:00Z',
})
const doppio = { code: '23505', message: 'duplicate key value violates unique constraint "export_salvati_nome_unico"', details: '', hint: '' }

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('listaExportSalvati', () => {
  it('legge gli export dell\'esperimento e tiene id, nome, scelte e data di modifica', async () => {
    mock.risponde('export_salvati', { data: [riga('x1', 'Solo SPAD')] })

    expect(await listaExportSalvati('E')).toEqual([
      { id: 'x1', nome: 'Solo SPAD', scelte, aggiornato_il: '2026-10-29T08:00:00Z' },
    ])
    expect(supabase.from).toHaveBeenCalledWith('export_salvati')
    expect(mock.di('export_salvati').find(c => c.metodo === 'eq')?.args).toEqual(['esperimento_id', 'E'])
  })

  it('li ordina per nome senza badare a maiuscole e accenti (il database mette le maiuscole prima)', async () => {
    mock.risponde('export_salvati', { data: [riga('1', 'zeta'), riga('2', 'Èra'), riga('3', 'Alfa'), riga('4', 'beta')] })

    expect((await listaExportSalvati('E')).map(e => e.nome)).toEqual(['Alfa', 'beta', 'Èra', 'zeta'])
  })

  it('le scelte restano come sono: le legge la pagina con leggiSceltaExport', async () => {
    mock.risponde('export_salvati', { data: [{ ...riga('x1', 'A'), scelte: { qualunque: 'cosa' } }] })
    expect((await listaExportSalvati('E'))[0].scelte).toEqual({ qualunque: 'cosa' })
  })

  it('senza export restituisce una lista vuota', async () => {
    mock.risponde('export_salvati', { data: null })
    expect(await listaExportSalvati('E')).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    const errore = { code: '42501', message: 'x' }
    mock.risponde('export_salvati', { error: errore })
    await expect(listaExportSalvati('E')).rejects.toBe(errore)
  })
})

describe('salvaExportSalvato', () => {
  it('fa upsert per id con esperimento, nome e scelte, e nient\'altro (mai creato_da)', async () => {
    await salvaExportSalvato('E', { id: 'x1', nome: 'Solo SPAD', scelte })

    expect(mock.di('export_salvati')).toEqual([
      { sorgente: 'export_salvati', metodo: 'upsert', args: [{ id: 'x1', esperimento_id: 'E', nome: 'Solo SPAD', scelte }, { onConflict: 'id' }] },
    ])
  })

  it('il nome si salva senza spazi ai bordi', async () => {
    await salvaExportSalvato('E', { id: 'x1', nome: '  Solo SPAD \t', scelte })

    const [salvato] = mock.di('export_salvati')[0].args as [{ nome: string }]
    expect(salvato.nome).toBe('Solo SPAD')
  })

  it('lancia l\'errore di Supabase così com\'è, riconoscibile come nome già usato (23505)', async () => {
    mock.risponde('export_salvati', { error: doppio })

    const e = await salvaExportSalvato('E', { id: 'x1', nome: 'A', scelte }).catch(x => x)

    expect(e).toBe(doppio)
    expect(eNomeExportGiaUsato(e)).toBe(true)
    expect(messaggioErrore(e)).toBe('Hai già un export salvato con questo nome: scegline un altro o sostituisci quello.')
  })

  it('un altro errore non è "nome già usato"', async () => {
    const altro = { code: '23505', message: 'duplicate key value violates unique constraint "export_salvati_pkey"' }
    mock.risponde('export_salvati', { error: altro })

    const e = await salvaExportSalvato('E', { id: 'x1', nome: 'A', scelte }).catch(x => x)
    expect(eNomeExportGiaUsato(e)).toBe(false)
  })

  it('scelte non valide per il database (23514) hanno un messaggio chiaro', async () => {
    const e = { code: '23514', message: 'new row for relation "export_salvati" violates check constraint "export_salvati_scelte_valide"' }
    expect(messaggioErrore(e)).toBe('Le scelte di questo export non sono valide: controlla strumenti, piante, periodo e fogli, poi riprova.')
  })
})

describe('eliminaExportSalvato', () => {
  it('elimina per id dentro l\'esperimento e chiede le righe toccate', async () => {
    mock.risponde('export_salvati', { data: [{ id: 'x1' }] })

    await eliminaExportSalvato('E', 'x1')

    expect(mock.di('export_salvati').map(c => [c.metodo, ...c.args])).toEqual([
      ['delete'], ['eq', 'id', 'x1'], ['eq', 'esperimento_id', 'E'], ['select', 'id'],
    ])
  })

  it('senza righe toccate l\'export non c\'è più: ELEMENTO_NON_TROVATO', async () => {
    mock.risponde('export_salvati', { data: [] })
    await expect(eliminaExportSalvato('E', 'x1')).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('lancia l\'errore di Supabase', async () => {
    const errore = { code: '42501', message: 'x' }
    mock.risponde('export_salvati', { error: errore })
    await expect(eliminaExportSalvato('E', 'x1')).rejects.toBe(errore)
  })
})
