import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import type { PianoAggiornamento } from '@/domain/catalogo'
import type { Parametro, VoceCatalogo } from '@/domain/tipi'
import { ELEMENTO_NON_TROVATO, SENZA_SESSIONE } from '@/lib/errori'
import {
  applicaAggiornamento, archiviaVoceCatalogo, copieDiProprieta, listaCatalogo, salvaVoceCatalogo,
} from './catalogo'

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
  vi.mocked(supabase.auth.getSession).mockReset()
  vi.mocked(supabase.auth.getSession).mockResolvedValue(sessione('u1'))
  mock = simulaSupabase(supabase)
})

/** La risposta di getSession con l'utente indicato (null: nessuna sessione). */
function sessione(uid: string | null) {
  return { data: { session: uid === null ? null : { user: { id: uid } } }, error: null } as never
}

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

describe('copieDiProprieta', () => {
  const rigaParametro = (id: string, esp: string, ordine: number, extra: Partial<Parametro> = {}) => ({
    id, esperimento_id: esp, nome: id, unita: null, tipo: 'numero', ordine, archiviato: false, progressivo: false,
    n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [], catalogo_chiave: null, ...extra,
  })
  const rigaStrumento = (id: string, esp: string, ordine: number) => ({
    id, esperimento_id: esp, nome: 'Termometro', icona: '🌡', ordine, tipo: 'strumento', archiviato: false, catalogo_id: 'c2',
  })

  function rispondeTutto() {
    mock.risponde('esperimenti', { data: [{ id: 'E1', nome: 'Pomodoro' }, { id: 'E2', nome: 'Vite' }] })
    mock.risponde('strumenti', { data: [rigaStrumento('S2', 'E2', 0), rigaStrumento('S1b', 'E1', 4), rigaStrumento('S1', 'E1', 1)] })
    mock.risponde('strumento_parametri', {
      data: [
        { esperimento_id: 'E1', strumento_id: 'S1', parametro_id: 'pB', obbligatorio: false, ordine: 1 },
        { esperimento_id: 'E1', strumento_id: 'S1', parametro_id: 'pA', obbligatorio: true, ordine: 0 },
        { esperimento_id: 'E2', strumento_id: 'S2', parametro_id: 'pC', obbligatorio: false, ordine: 0 },
      ],
    })
    mock.risponde('parametri', {
      data: [
        rigaParametro('pB', 'E1', 2, { catalogo_chiave: 'temp_pianta', archiviato: true }),
        rigaParametro('pA', 'E1', 0, { catalogo_chiave: 'temp_aria' }),
        rigaParametro('pAltro', 'E1', 9),
        rigaParametro('pC', 'E2', 0, { catalogo_chiave: 'temp_aria' }),
      ],
    })
    mock.risponde('rpc:parametri_con_dati', { data: ['pA'] })
  }

  it('legge solo gli esperimenti creati dall\'utente della sessione (filtro esplicito, non solo la RLS)', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(sessione('utente-42'))
    rispondeTutto()

    await copieDiProprieta('c2')

    expect(mock.di('esperimenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['select', 'id, nome'], ['eq', 'creato_da', 'utente-42'], ['order', 'nome'],
    ])
  })

  it('cerca gli strumenti con quel catalogo_id solo in quegli esperimenti', async () => {
    rispondeTutto()

    await copieDiProprieta('c2')

    expect(mock.di('strumenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['select', '*'], ['eq', 'catalogo_id', 'c2'], ['in', 'esperimento_id', ['E1', 'E2']],
    ])
    expect(mock.di('strumento_parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['select', '*'], ['in', 'strumento_id', ['S1', 'S1b', 'S2']],
    ])
    expect(mock.di('parametri').map(c => [c.metodo, ...c.args])).toEqual([
      ['select', '*'], ['in', 'esperimento_id', ['E1', 'E2']],
    ])
    expect(mock.di('rpc:parametri_con_dati').map(c => c.args[0])).toEqual([{ p_esperimento: 'E1' }, { p_esperimento: 'E2' }])
  })

  it('compone le copie: esperimenti nell\'ordine letto, strumenti per ordine, i soli parametri collegati', async () => {
    rispondeTutto()

    const copie = await copieDiProprieta('c2')

    expect(copie.map(c => [c.espId, c.esperimentoNome, c.strumento.id, c.parametri.map(p => p.id), c.ordineMassimo]))
      .toEqual([
        ['E1', 'Pomodoro', 'S1', ['pA', 'pB'], 9],
        ['E1', 'Pomodoro', 'S1b', [], 9],
        ['E2', 'Vite', 'S2', ['pC'], 0],
      ])
    expect(copie[0].strumento).toEqual({
      id: 'S1', nome: 'Termometro', icona: '🌡', ordine: 1, tipo: 'strumento', archiviato: false, catalogo_id: 'c2',
      parametri: [{ parametro_id: 'pA', obbligatorio: true, ordine: 0 }, { parametro_id: 'pB', obbligatorio: false, ordine: 1 }],
    })
    expect(copie[0].parametri[1]).toMatchObject({ id: 'pB', archiviato: true, catalogo_chiave: 'temp_pianta' })
    expect(copie[0].conDati).toEqual(new Set(['pA']))
  })

  it('senza sessione non legge nulla e lo dice', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(sessione(null))

    await expect(copieDiProprieta('c2')).rejects.toThrow(SENZA_SESSIONE)
    expect(mock.chiamate).toEqual([])
  })

  it('lancia l\'errore della sessione', async () => {
    const e = new Error('rete')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: e } as never)
    await expect(copieDiProprieta('c2')).rejects.toBe(e)
  })

  it('senza esperimenti propri non cerca strumenti', async () => {
    mock.risponde('esperimenti', { data: [] })

    expect(await copieDiProprieta('c2')).toEqual([])
    expect(mock.di('strumenti')).toEqual([])
  })

  it('senza copie della voce non legge parametri né dati', async () => {
    mock.risponde('esperimenti', { data: [{ id: 'E1', nome: 'Pomodoro' }] })
    mock.risponde('strumenti', { data: [] })

    expect(await copieDiProprieta('c2')).toEqual([])
    expect(mock.chiamate.map(c => c.sorgente)).not.toContain('parametri')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it.each(['esperimenti', 'strumenti', 'strumento_parametri', 'parametri', 'rpc:parametri_con_dati'])(
    'lancia l\'errore di Supabase (%s)', async sorgente => {
      rispondeTutto()
      const e = { code: '42501', message: 'permission denied' }
      mock.risponde(sorgente, { error: e })
      await expect(copieDiProprieta('c2')).rejects.toBe(e)
    },
  )
})

describe('applicaAggiornamento', () => {
  const parametro = (id: string, extra: Partial<Parametro> = {}): Parametro => ({
    id, nome: 'Temp aria', unita: '°C', tipo: 'numero', ordine: 3, archiviato: false, progressivo: true, n_letture: 2,
    valore_min: -5, valore_max: 50, sotto_campi: [], catalogo_chiave: 'temp_aria', ...extra,
  })
  const piano: PianoAggiornamento = {
    modifiche: [{ espId: 'E1', parametro: parametro('pA') }],
    aggiunte: [{
      espId: 'E2', strumentoId: 'S2', parametro: parametro('pNuovo', { progressivo: false }),
      collegamento: { parametro_id: 'pNuovo', obbligatorio: false, ordine: 4 },
    }],
    saltati: ['Vite · Termometro · Temp: unità modificato a mano'],
  }

  it('aggiorna i soli campi del catalogo delle modifiche, poi crea e collega i parametri aggiunti', async () => {
    mock.risponde('parametri', { data: [{ id: 'pA' }] })

    await applicaAggiornamento(piano)

    expect(mock.chiamate.map(c => [c.sorgente, c.metodo, ...c.args])).toEqual([
      ['parametri', 'update', { nome: 'Temp aria', unita: '°C', valore_min: -5, valore_max: 50, n_letture: 2 }],
      ['parametri', 'eq', 'id', 'pA'],
      ['parametri', 'eq', 'esperimento_id', 'E1'],
      ['parametri', 'select', 'id'],
      ['parametri', 'upsert', { ...parametro('pNuovo', { progressivo: false }), esperimento_id: 'E2' }, { onConflict: 'id' }],
      ['strumento_parametri', 'upsert', [
        { esperimento_id: 'E2', strumento_id: 'S2', parametro_id: 'pNuovo', obbligatorio: false, ordine: 4 },
      ], { onConflict: 'strumento_id,parametro_id' }],
    ])
  })

  it('non riscrive mai lo strumento né toglie collegamenti', async () => {
    mock.risponde('parametri', { data: [{ id: 'pA' }] })
    await applicaAggiornamento(piano)
    expect(mock.di('strumenti')).toEqual([])
    expect(mock.chiamate.map(c => c.metodo)).not.toContain('delete')
  })

  it('un parametro da modificare che non c\'è più fa fallire l\'aggiornamento (nessun successo finto)', async () => {
    mock.risponde('parametri', { data: [] })
    await expect(applicaAggiornamento(piano)).rejects.toThrow(ELEMENTO_NON_TROVATO)
    expect(mock.di('strumento_parametri')).toEqual([])
  })

  it('un errore di salvaParametro su un parametro aggiunto fa fallire l\'aggiornamento, senza collegarlo', async () => {
    const e = { code: '42501', message: 'new row violates row-level security policy' }
    mock.risponde('parametri', { error: e })

    await expect(applicaAggiornamento({ ...piano, modifiche: [] })).rejects.toBe(e)
    expect(mock.di('strumento_parametri')).toEqual([])
  })

  it('un errore del collegamento fa fallire l\'aggiornamento', async () => {
    const e = { code: '23503', message: 'foreign key violation' }
    mock.risponde('strumento_parametri', { error: e })
    await expect(applicaAggiornamento({ ...piano, modifiche: [] })).rejects.toBe(e)
  })

  it('un piano vuoto (solo saltati) non scrive nulla', async () => {
    await applicaAggiornamento({ aggiunte: [], modifiche: [], saltati: ['x'] })
    expect(mock.chiamate).toEqual([])
  })
})
