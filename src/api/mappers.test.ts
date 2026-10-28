import { describe, expect, it } from 'vitest'
import { clonaConfig } from '@/domain/bozza'
import type { Misura, Parametro, Passata, Pianta } from '@/domain/tipi'
import {
  aRigaMisura, aRigaParametro, aRigaPassata, aRigaPassataParametro, aRigaPianta,
  daRigaMisura, daRigheConfig,
  type RigaMisura, type RigheConfig,
} from './mappers'

const E = 'e1'
const DB = { esperimento_id: E }

/** Righe come le restituisce PostgREST con select('*'), volutamente in disordine. */
function righe(): RigheConfig {
  return {
    esperimento: {
      id: E, nome: 'Prova', data_inizio: '2026-10-28', note: 'una nota', stato: 'in_corso',
      creato_da: 'u1', creato_il: '2026-10-28T10:00:00+00:00',
    },
    fattori: [
      { id: 'f2', ...DB, nome: 'Hydrochar', ordine: 1 },
      { id: 'f1', ...DB, nome: 'Stress', ordine: 0 },
    ],
    livelli: [
      { id: 's1', ...DB, fattore_id: 'f1', nome: 'S1', ordine: 1 },
      { id: 'h1', ...DB, fattore_id: 'f2', nome: 'Sì', ordine: 1 },
      { id: 's0', ...DB, fattore_id: 'f1', nome: 'Controllo', ordine: 0 },
      { id: 'h0', ...DB, fattore_id: 'f2', nome: 'No', ordine: 0 },
    ],
    trattamenti: [
      { id: 't2', ...DB, etichetta: 'S1 + No', ordine: 1 },
      { id: 't1', ...DB, etichetta: 'Controllo + No', ordine: 0 },
    ],
    trattamento_livelli: [
      { ...DB, trattamento_id: 't2', livello_id: 'h0' },
      { ...DB, trattamento_id: 't1', livello_id: 'h0' },
      { ...DB, trattamento_id: 't2', livello_id: 's1' },
      { ...DB, trattamento_id: 't1', livello_id: 's0' },
    ],
    piante: [
      { id: 'p2', ...DB, trattamento_id: 't2', etichetta: '2', blocco: null, ordine: 1 },
      { id: 'p1', ...DB, trattamento_id: 't1', etichetta: '1', blocco: 'A', ordine: 0 },
    ],
    parametri: [
      {
        id: 'par2', ...DB, nome: 'Palchi', unita: null, tipo: 'lista', ordine: 1, archiviato: false,
        progressivo: true, ricorda_tra_piante: false, n_letture: 1, valore_min: null, valore_max: null,
        sotto_campi: [{ chiave: 'n_foglie', nome: 'N foglie', unita: null }],
      },
      {
        id: 'par1', ...DB, nome: 'Altezza', unita: 'cm', tipo: 'numero', ordine: 0, archiviato: false,
        progressivo: false, ricorda_tra_piante: true, n_letture: 3, valore_min: 0, valore_max: 300,
        sotto_campi: [],
      },
    ],
    passate: [
      { id: 'pa2', ...DB, nome: 'Fenologici', icona: null, ordine: 1 },
      { id: 'pa1', ...DB, nome: 'Altezza', icona: '📏', ordine: 0 },
    ],
    passata_parametri: [
      { ...DB, passata_id: 'pa1', parametro_id: 'par2', obbligatorio: false, ordine: 1 },
      { ...DB, passata_id: 'pa2', parametro_id: 'par2', obbligatorio: false, ordine: 0 },
      { ...DB, passata_id: 'pa1', parametro_id: 'par1', obbligatorio: true, ordine: 0 },
    ],
  }
}

describe('daRigheConfig', () => {
  it('compone la configurazione e ordina tutto per ordine', () => {
    const c = daRigheConfig(righe())

    expect(c.esperimento).toEqual({ id: E, nome: 'Prova', data_inizio: '2026-10-28', note: 'una nota', stato: 'in_corso' })
    expect(c.fattori.map(f => f.nome)).toEqual(['Stress', 'Hydrochar'])
    expect(c.fattori[0].livelli).toEqual([
      { id: 's0', nome: 'Controllo', ordine: 0 },
      { id: 's1', nome: 'S1', ordine: 1 },
    ])
    expect(c.fattori[1].livelli.map(l => l.id)).toEqual(['h0', 'h1'])
    expect(c.trattamenti).toEqual([
      { id: 't1', etichetta: 'Controllo + No', ordine: 0, livello_ids: ['s0', 'h0'] },
      { id: 't2', etichetta: 'S1 + No', ordine: 1, livello_ids: ['s1', 'h0'] },
    ])
    expect(c.piante).toEqual([
      { id: 'p1', trattamento_id: 't1', etichetta: '1', blocco: 'A', ordine: 0 },
      { id: 'p2', trattamento_id: 't2', etichetta: '2', blocco: null, ordine: 1 },
    ])
    expect(c.parametri.map(p => p.id)).toEqual(['par1', 'par2'])
    expect(c.parametri[1].sotto_campi).toEqual([{ chiave: 'n_foglie', nome: 'N foglie', unita: null }])
    expect(c.passate.map(p => p.id)).toEqual(['pa1', 'pa2'])
    expect(c.passate[0].parametri).toEqual([
      { parametro_id: 'par1', obbligatorio: true, ordine: 0 },
      { parametro_id: 'par2', obbligatorio: false, ordine: 1 },
    ])
    expect(c.passate[1].parametri).toEqual([{ parametro_id: 'par2', obbligatorio: false, ordine: 0 }])
  })

  it('toglie esperimento_id e le altre colonne solo del database da ogni oggetto', () => {
    const json = JSON.stringify(daRigheConfig(righe()))
    expect(json).not.toContain('esperimento_id')
    expect(json).not.toContain('creato_da')
    expect(json).not.toContain('creato_il')
    expect(json).not.toContain('fattore_id')
    expect(json).not.toContain('passata_id')
  })

  it('clonaConfig sulla configurazione letta non copia colonne del database', () => {
    const bozza = clonaConfig(daRigheConfig(righe()))
    const json = JSON.stringify(bozza)
    expect(json).not.toContain('esperimento_id')
    expect(json).not.toContain('creato_da')
    expect(json).not.toContain('creato_il')
    expect(bozza.esperimento.id).not.toBe(E)
  })

  it('una configurazione senza righe figlie è valida e vuota', () => {
    const r = righe()
    const vuota = daRigheConfig({
      ...r, fattori: [], livelli: [], trattamenti: [], trattamento_livelli: [], piante: [],
      parametri: [], passate: [], passata_parametri: [],
    })
    expect(vuota.fattori).toEqual([])
    expect(vuota.trattamenti).toEqual([])
    expect(vuota.piante).toEqual([])
    expect(vuota.parametri).toEqual([])
    expect(vuota.passate).toEqual([])
  })
})

const misura: Misura = {
  id: 'm1', pianta_id: 'p1', passata_id: 'pa1', data_rilievo: '2026-10-28', ora: '09:12',
  valori: { par1: [24.5, null], note: 'ok' },
}

describe('daRigaMisura', () => {
  const riga: RigaMisura = {
    id: 'm1', esperimento_id: E, pianta_id: 'p1', passata_id: 'pa1', data_rilievo: '2026-10-28', ora: '09:12:00',
    valori: { par1: [24.5, null], note: 'ok' },
    creato_da: 'u1', creato_il: '2026-10-28T09:12:03+00:00', aggiornato_il: '2026-10-28T09:12:03+00:00',
  }

  it('riduce ora da HH:MM:SS a HH:MM', () => {
    expect(daRigaMisura(riga).ora).toBe('09:12')
  })

  it('lascia invariata un\'ora già HH:MM', () => {
    expect(daRigaMisura({ ...riga, ora: '09:12' }).ora).toBe('09:12')
  })

  it('restituisce esattamente una Misura, senza colonne del database', () => {
    expect(daRigaMisura(riga)).toEqual(misura)
    expect(Object.keys(daRigaMisura(riga)).sort()).toEqual(
      ['data_rilievo', 'id', 'ora', 'passata_id', 'pianta_id', 'valori'],
    )
  })
})

describe('aRigaMisura', () => {
  it('aggiunge esperimento_id e mantiene lo stesso id', () => {
    const r = aRigaMisura('E', misura)
    expect(r.esperimento_id).toBe('E')
    expect(r.id).toBe(misura.id)
  })

  it('contiene esattamente le colonne scrivibili e mai creato_da', () => {
    const conExtra = { ...misura, creato_da: 'u1', esperimento_id: 'altro' } as Misura
    const r = aRigaMisura('E', conExtra)
    expect(r).toEqual({
      id: 'm1', esperimento_id: 'E', pianta_id: 'p1', passata_id: 'pa1',
      data_rilievo: '2026-10-28', ora: '09:12', valori: misura.valori,
    })
    expect(Object.keys(r).sort()).toEqual(
      ['data_rilievo', 'esperimento_id', 'id', 'ora', 'passata_id', 'pianta_id', 'valori'],
    )
  })
})

describe('mapper di scrittura della configurazione', () => {
  const parametro: Parametro = {
    id: 'par1', nome: 'Altezza', unita: 'cm', tipo: 'numero', ordine: 0, archiviato: false, progressivo: false,
    ricorda_tra_piante: true, n_letture: 3, valore_min: 0, valore_max: 300, sotto_campi: [],
  }
  const pianta: Pianta = { id: 'p1', trattamento_id: 't1', etichetta: '1', blocco: null, ordine: 0 }
  const passata: Passata = {
    id: 'pa1', nome: 'Altezza', icona: '📏', ordine: 0,
    parametri: [{ parametro_id: 'par1', obbligatorio: true, ordine: 0 }],
  }

  it('aRigaParametro aggiunge esperimento_id e porta solo le colonne di parametri', () => {
    const r = aRigaParametro('E', { ...parametro, creato_da: 'x' } as Parametro)
    expect(r).toEqual({ ...parametro, esperimento_id: 'E' })
  })

  it('aRigaPianta aggiunge esperimento_id', () => {
    expect(aRigaPianta('E', pianta)).toEqual({ ...pianta, esperimento_id: 'E' })
  })

  it('aRigaPassata porta solo le colonne della passata, senza i parametri annidati', () => {
    expect(aRigaPassata('E', passata)).toEqual({ id: 'pa1', esperimento_id: 'E', nome: 'Altezza', icona: '📏', ordine: 0 })
  })

  it('aRigaPassataParametro collega passata e parametro nello stesso esperimento', () => {
    expect(aRigaPassataParametro('E', 'pa1', passata.parametri[0])).toEqual({
      esperimento_id: 'E', passata_id: 'pa1', parametro_id: 'par1', obbligatorio: true, ordine: 0,
    })
  })
})
