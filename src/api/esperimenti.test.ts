import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { simulaSupabase } from '@/test/supabase-mock'
import { ELEMENTO_NON_TROVATO, ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { configDiEsempio } from '@/domain/test-helpers'
import { clonaConfig } from '@/domain/bozza'
import type { RigheConfig } from './mappers'
import {
  aggiornaEsperimento, caricaConfig, creaEsperimento, listaEsperimenti, type RiepilogoEsperimento,
} from './esperimenti'

const errore = { code: '42501', message: 'permission denied', details: '', hint: '' }

let mock: ReturnType<typeof simulaSupabase>
beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.rpc).mockReset()
  mock = simulaSupabase(supabase)
})

describe('listaEsperimenti', () => {
  const riepilogo: RiepilogoEsperimento = {
    id: 'e1', nome: 'Prova', stato: 'in_corso', data_inizio: '2026-10-28', n_piante: 4, n_trattamenti: 4,
    ultima_data: '2026-10-28', piante_ultima_data: 2,
  }

  it('chiama la RPC riepilogo_esperimenti e restituisce le righe', async () => {
    mock.risponde('rpc:riepilogo_esperimenti', { data: [riepilogo] })

    expect(await listaEsperimenti()).toEqual([riepilogo])
    expect(supabase.rpc).toHaveBeenCalledWith('riepilogo_esperimenti')
  })

  it('senza dati restituisce un array vuoto', async () => {
    mock.risponde('rpc:riepilogo_esperimenti', { data: null })
    expect(await listaEsperimenti()).toEqual([])
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('rpc:riepilogo_esperimenti', { error: errore })
    await expect(listaEsperimenti()).rejects.toBe(errore)
  })
})

describe('creaEsperimento', () => {
  it('usa solo la RPC crea_esperimento e restituisce l\'id', async () => {
    const bozza = configDiEsempio()
    mock.risponde('rpc:crea_esperimento', { data: bozza.esperimento.id })

    expect(await creaEsperimento(bozza)).toBe(bozza.esperimento.id)
    expect(supabase.rpc).toHaveBeenCalledWith('crea_esperimento', { bozza })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('rpc:crea_esperimento', { error: errore })
    await expect(creaEsperimento(configDiEsempio())).rejects.toBe(errore)
  })
})

describe('aggiornaEsperimento', () => {
  it('aggiorna solo i campi modificabili dell\'esperimento indicato', async () => {
    mock.risponde('esperimenti', { data: [{ id: 'E' }] })
    await aggiornaEsperimento('E', { nome: 'Nuovo', stato: 'concluso' })

    expect(mock.di('esperimenti').map(c => [c.metodo, ...c.args])).toEqual([
      ['update', { nome: 'Nuovo', stato: 'concluso' }],
      ['eq', 'id', 'E'],
      ['select', 'id'],
    ])
  })

  it('se nessuna riga è stata aggiornata (esperimento rimosso o non accessibile) lo dice', async () => {
    mock.risponde('esperimenti', { data: [] })
    await expect(aggiornaEsperimento('E', { nome: 'Nuovo' })).rejects.toThrow(ELEMENTO_NON_TROVATO)
  })

  it('non manda campi estranei, né creato_da né id', async () => {
    mock.risponde('esperimenti', { data: [{ id: 'E' }] })
    await aggiornaEsperimento('E', { note: 'x', creato_da: 'u1', id: 'altro' } as never)

    expect(mock.di('esperimenti')[0].args).toEqual([{ note: 'x' }])
  })

  it('con una modifica vuota non chiama il database', async () => {
    await aggiornaEsperimento('E', {})
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('lancia l\'errore di Supabase', async () => {
    mock.risponde('esperimenti', { error: errore })
    await expect(aggiornaEsperimento('E', { nome: 'x' })).rejects.toBe(errore)
  })
})

describe('caricaConfig', () => {
  const E = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
  const righe: RigheConfig = {
    esperimento: {
      id: E, nome: 'Prova', data_inizio: null, note: '', stato: 'in_corso', creato_da: 'u1', creato_il: 'x',
    },
    fattori: [{ id: 'f1', esperimento_id: E, nome: 'Stress', ordine: 0 }],
    livelli: [{ id: 'l1', esperimento_id: E, fattore_id: 'f1', nome: 'Controllo', ordine: 0 }],
    trattamenti: [{ id: 't1', esperimento_id: E, etichetta: 'Controllo', ordine: 0 }],
    trattamento_livelli: [{ esperimento_id: E, trattamento_id: 't1', livello_id: 'l1' }],
    piante: [{ id: 'p1', esperimento_id: E, trattamento_id: 't1', etichetta: '1', blocco: null, ordine: 0 }],
    parametri: [{
      id: 'par1', esperimento_id: E, nome: 'Altezza', unita: 'cm', tipo: 'numero', ordine: 0, archiviato: false,
      progressivo: false, n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [],
    }],
    strumenti: [{ id: 'pa1', esperimento_id: E, nome: 'Altezza', icona: null, ordine: 0, tipo: 'strumento', archiviato: false }],
    strumento_parametri: [{ esperimento_id: E, strumento_id: 'pa1', parametro_id: 'par1', obbligatorio: false, ordine: 0 }],
  }

  function rispondeConRighe() {
    mock.risponde('esperimenti', { data: righe.esperimento })
    for (const t of [
      'fattori', 'livelli', 'trattamenti', 'trattamento_livelli', 'piante', 'parametri', 'strumenti', 'strumento_parametri',
    ] as const) mock.risponde(t, { data: righe[t] })
  }

  it('legge tutte le tabelle dell\'esperimento e compone la configurazione', async () => {
    rispondeConRighe()

    const c = await caricaConfig(E)

    expect(c.esperimento.nome).toBe('Prova')
    expect(c.fattori[0].livelli.map(l => l.nome)).toEqual(['Controllo'])
    expect(c.trattamenti[0].livello_ids).toEqual(['l1'])
    expect(c.piante.map(p => p.etichetta)).toEqual(['1'])
    expect(c.strumenti[0].parametri).toEqual([{ parametro_id: 'par1', obbligatorio: false, ordine: 0 }])
    expect(JSON.stringify(c)).not.toContain('esperimento_id')
    expect(JSON.stringify(c)).not.toContain('creato_da')
    // la configurazione letta si può clonare senza portarsi dietro colonne del database
    expect(JSON.stringify(clonaConfig(c))).not.toContain('esperimento_id')
  })

  it('filtra ogni tabella figlia per esperimento_id', async () => {
    rispondeConRighe()
    await caricaConfig(E)

    for (const t of [
      'fattori', 'livelli', 'trattamenti', 'trattamento_livelli', 'piante', 'parametri', 'strumenti', 'strumento_parametri',
    ]) {
      expect(mock.di(t).filter(c => c.metodo === 'eq').map(c => c.args)).toEqual([['esperimento_id', E]])
    }
    expect(mock.di('esperimenti').filter(c => c.metodo === 'eq').map(c => c.args)).toEqual([['id', E]])
  })

  it('lancia l\'errore di Supabase se una lettura fallisce', async () => {
    rispondeConRighe()
    mock.risponde('piante', { error: errore })
    await expect(caricaConfig(E)).rejects.toBe(errore)
  })

  it('se l\'esperimento non esiste o non è accessibile lo dice con un messaggio suo', async () => {
    rispondeConRighe()
    mock.risponde('esperimenti', { data: null })
    await expect(caricaConfig(E)).rejects.toThrow(ESPERIMENTO_NON_TROVATO)
  })

  it('con un id che non è un uuid (un link sbagliato) non interroga il database: esperimento non trovato', async () => {
    await expect(caricaConfig('non-un-id')).rejects.toThrow(ESPERIMENTO_NON_TROVATO)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
