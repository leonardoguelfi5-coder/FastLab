import { beforeEach, describe, expect, it, vi } from 'vitest'

// nuovoId vero, ma osservabile: gli id devono venire da lì (mai crypto.randomUUID diretto).
vi.mock('@/lib/id', async importOriginal => {
  const vero = await importOriginal<typeof import('@/lib/id')>()
  return { nuovoId: vi.fn(vero.nuovoId) }
})

import { nuovoId } from '@/lib/id'
import { pianoAggiornamento, strumentoDaCatalogo, type CopiaStrumento } from './catalogo'
import type { Parametro, VoceCatalogo } from './tipi'

const ciras: VoceCatalogo = {
  id: 'c0000000-0000-0000-0000-000000000003',
  nome: 'Ciras',
  icona: '🍃',
  descrizione: 'Scambi gassosi della foglia.',
  archiviato: false,
  parametri: [
    { chiave: 'a', nome: 'A', unita: 'µmol m⁻² s⁻¹', n_letture: 1, valore_min: null, valore_max: null },
    { chiave: 'gs', nome: 'gs', unita: 'mol m⁻² s⁻¹', n_letture: 3, valore_min: 0, valore_max: 2 },
    { chiave: 'spad', nome: 'SPAD', unita: null, n_letture: 1, valore_min: null, valore_max: null },
  ],
}

beforeEach(() => { vi.mocked(nuovoId).mockClear() })

describe('strumentoDaCatalogo', () => {
  it('copia la voce in uno strumento collegato al catalogo, con nome, icona e ordine', () => {
    const { strumento } = strumentoDaCatalogo(ciras, 2)

    expect(strumento).toMatchObject({
      nome: 'Ciras', icona: '🍃', ordine: 2, tipo: 'strumento', archiviato: false, catalogo_id: ciras.id,
    })
    expect(strumento.id).not.toBe(ciras.id)
  })

  it('crea un parametro numerico per ogni valore della voce, con chiave, unità, letture e limiti', () => {
    const { parametri } = strumentoDaCatalogo(ciras, 0)

    expect(parametri).toEqual([
      {
        id: expect.any(String), nome: 'A', unita: 'µmol m⁻² s⁻¹', tipo: 'numero', ordine: 0, archiviato: false, progressivo: false,
        n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [], catalogo_chiave: 'a',
      },
      {
        id: expect.any(String), nome: 'gs', unita: 'mol m⁻² s⁻¹', tipo: 'numero', ordine: 1, archiviato: false, progressivo: false,
        n_letture: 3, valore_min: 0, valore_max: 2, sotto_campi: [], catalogo_chiave: 'gs',
      },
      {
        id: expect.any(String), nome: 'SPAD', unita: null, tipo: 'numero', ordine: 2, archiviato: false, progressivo: false,
        n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [], catalogo_chiave: 'spad',
      },
    ])
  })

  it('collega allo strumento ogni parametro creato, nell\'ordine della voce e facoltativo', () => {
    const { strumento, parametri } = strumentoDaCatalogo(ciras, 0)

    expect(strumento.parametri).toEqual(parametri.map((p, ordine) => ({ parametro_id: p.id, obbligatorio: false, ordine })))
  })

  it('genera id nuovi con nuovoId a ogni copia: due copie della stessa voce non si sovrappongono', () => {
    const prima = strumentoDaCatalogo(ciras, 0)
    const seconda = strumentoDaCatalogo(ciras, 1)

    expect(nuovoId).toHaveBeenCalledTimes(2 * (1 + ciras.parametri.length))
    const ids = [prima, seconda].flatMap(c => [c.strumento.id, ...c.parametri.map(p => p.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('una voce senza valori dà uno strumento senza parametri', () => {
    const { strumento, parametri } = strumentoDaCatalogo({ ...ciras, parametri: [] }, 0)
    expect(parametri).toEqual([])
    expect(strumento.parametri).toEqual([])
  })

  it('non modifica la voce del catalogo', () => {
    const prima = JSON.stringify(ciras)
    const { parametri } = strumentoDaCatalogo(ciras, 0)
    parametri[0].nome = 'cambiato'
    expect(JSON.stringify(ciras)).toBe(prima)
  })
})

describe('pianoAggiornamento', () => {
  // La voce prima e dopo la modifica nel catalogo; ogni test cambia solo quello che gli serve.
  const vecchia: VoceCatalogo = {
    id: 'cat-ciras', nome: 'Ciras', icona: '🍃', descrizione: '', archiviato: false,
    parametri: [
      { chiave: 'a', nome: 'A', unita: 'µmol m⁻² s⁻¹', n_letture: 1, valore_min: null, valore_max: null },
      { chiave: 'gs', nome: 'gs', unita: 'mol m⁻² s⁻¹', n_letture: 1, valore_min: 0, valore_max: 2 },
    ],
  }
  const conValore = (v: VoceCatalogo, chiave: string, campi: Partial<VoceCatalogo['parametri'][number]>): VoceCatalogo => ({
    ...v, parametri: v.parametri.map(pc => (pc.chiave === chiave ? { ...pc, ...campi } : pc)),
  })

  /** Una copia intatta della vecchia voce nell'esperimento «Pomodoro 2026», con gli id dei parametri fissi. */
  function copia(extra: Partial<CopiaStrumento> = {}): CopiaStrumento {
    const parametri: Parametro[] = vecchia.parametri.map((pc, i) => ({
      id: `par-${pc.chiave}`, nome: pc.nome, unita: pc.unita, tipo: 'numero', ordine: 3 + i, archiviato: false,
      progressivo: false, n_letture: pc.n_letture, valore_min: pc.valore_min, valore_max: pc.valore_max, sotto_campi: [],
      catalogo_chiave: pc.chiave,
    }))
    return {
      espId: 'E1',
      esperimentoNome: 'Pomodoro 2026',
      strumento: {
        id: 'S1', nome: 'Ciras', icona: '🍃', ordine: 1, tipo: 'strumento', archiviato: false, catalogo_id: 'cat-ciras',
        parametri: parametri.map((p, i) => ({ parametro_id: p.id, obbligatorio: true, ordine: i })),
      },
      parametri,
      conDati: new Set(),
      ordineMassimo: 7,
      ...extra,
    }
  }
  /** La copia con i campi indicati ritoccati nel parametro della chiave data. */
  const ritoccata = (c: CopiaStrumento, chiave: string, campi: Partial<Parametro>): CopiaStrumento => ({
    ...c, parametri: c.parametri.map(p => (p.catalogo_chiave === chiave ? { ...p, ...campi } : p)),
  })
  const parametroDi = (c: CopiaStrumento, chiave: string) => c.parametri.find(p => p.catalogo_chiave === chiave) as Parametro

  it('unità cambiata nel catalogo e copia intatta: è una modifica', () => {
    const c = copia()
    const piano = pianoAggiornamento(vecchia, conValore(vecchia, 'gs', { unita: 'mmol m⁻² s⁻¹' }), [c])

    expect(piano).toEqual({
      aggiunte: [],
      modifiche: [{ espId: 'E1', parametro: { ...parametroDi(c, 'gs'), unita: 'mmol m⁻² s⁻¹' } }],
      saltati: [],
    })
  })

  it('unità cambiata ma ritoccata a mano nella copia: è un saltato, con il nome attuale del parametro', () => {
    const c = ritoccata(copia(), 'gs', { nome: 'Conduttanza', unita: 'mol/m²s' })
    const nuova = conValore(vecchia, 'gs', { unita: 'mmol m⁻² s⁻¹' })

    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({
      aggiunte: [],
      modifiche: [],
      saltati: ['Pomodoro 2026 · Ciras · Conduttanza: unità modificato a mano'],
    })
  })

  it('confronta nome e unità senza spazi ai lati, e un\'unità vuota vale come nessuna unità', () => {
    const v = conValore(vecchia, 'a', { unita: null })
    const c = ritoccata(copia(), 'a', { nome: ' A ', unita: '' })
    const nuova = conValore(v, 'a', { nome: 'Assimilazione', unita: 'µmol m⁻² s⁻¹' })

    const piano = pianoAggiornamento(v, nuova, [c])

    expect(piano.saltati).toEqual([])
    expect(piano.modifiche).toEqual([
      { espId: 'E1', parametro: { ...parametroDi(c, 'a'), nome: 'Assimilazione', unita: 'µmol m⁻² s⁻¹' } },
    ])
  })

  it('min e max si confrontano esattamente: un minimo ritoccato resta, il massimo intatto si aggiorna', () => {
    const c = ritoccata(copia(), 'gs', { valore_min: 0.1 })
    const nuova = conValore(vecchia, 'gs', { valore_min: -1, valore_max: 3 })

    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({
      aggiunte: [],
      modifiche: [{ espId: 'E1', parametro: { ...parametroDi(c, 'gs'), valore_max: 3 } }],
      saltati: ['Pomodoro 2026 · Ciras · gs: minimo modificato a mano'],
    })
  })

  it('un campo intatto e uno ritoccato nello stesso parametro: si aggiorna quello intatto, l\'altro è un saltato', () => {
    const c = ritoccata(copia(), 'gs', { unita: 'mol/m²s' })
    const nuova = conValore(vecchia, 'gs', { nome: 'gs (conduttanza)', unita: 'mmol m⁻² s⁻¹' })

    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({
      aggiunte: [],
      modifiche: [{ espId: 'E1', parametro: { ...parametroDi(c, 'gs'), nome: 'gs (conduttanza)' } }],
      saltati: ['Pomodoro 2026 · Ciras · gs: unità modificato a mano'],
    })
  })

  it('un campo già uguale al nuovo valore del catalogo non è né una modifica né un saltato', () => {
    const c = ritoccata(copia(), 'gs', { unita: 'mmol m⁻² s⁻¹' })
    const nuova = conValore(vecchia, 'gs', { unita: 'mmol m⁻² s⁻¹' })

    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({ aggiunte: [], modifiche: [], saltati: [] })
  })

  it('senza cambiamenti nel catalogo non c\'è nulla da fare, anche con una copia ritoccata', () => {
    const c = ritoccata(copia(), 'a', { nome: 'Fotosintesi', n_letture: 3 })
    expect(pianoAggiornamento(vecchia, vecchia, [c])).toEqual({ aggiunte: [], modifiche: [], saltati: [] })
  })

  it('chiave nuova nella voce: è un\'aggiunta numerica, in coda all\'esperimento e allo strumento, facoltativa', () => {
    const nuova: VoceCatalogo = {
      ...vecchia,
      parametri: [...vecchia.parametri, { chiave: 'e', nome: 'E', unita: 'mmol m⁻² s⁻¹', n_letture: 2, valore_min: 0, valore_max: 20 }],
    }
    vi.mocked(nuovoId).mockClear()

    const piano = pianoAggiornamento(vecchia, nuova, [copia()])

    expect(nuovoId).toHaveBeenCalledTimes(1)
    const id = vi.mocked(nuovoId).mock.results[0].value as string
    expect(piano).toEqual({
      aggiunte: [{
        espId: 'E1',
        strumentoId: 'S1',
        parametro: {
          id, nome: 'E', unita: 'mmol m⁻² s⁻¹', tipo: 'numero', ordine: 8, archiviato: false, progressivo: false,
          n_letture: 2, valore_min: 0, valore_max: 20, sotto_campi: [], catalogo_chiave: 'e',
        },
        collegamento: { parametro_id: id, obbligatorio: false, ordine: 2 },
      }],
      modifiche: [],
      saltati: [],
    })
  })

  it('più chiavi nuove in due copie dello stesso esperimento: ordini crescenti, senza sovrapposizioni', () => {
    const nuova: VoceCatalogo = {
      ...vecchia,
      parametri: [
        ...vecchia.parametri,
        { chiave: 'e', nome: 'E', unita: null, n_letture: 1, valore_min: null, valore_max: null },
        { chiave: 'ci', nome: 'Ci', unita: null, n_letture: 1, valore_min: null, valore_max: null },
      ],
    }
    const prima = copia()
    const seconda: CopiaStrumento = {
      ...copia(), strumento: { ...copia().strumento, id: 'S2', parametri: [] }, parametri: [],
    }

    const piano = pianoAggiornamento(vecchia, nuova, [prima, seconda])

    expect(piano.aggiunte.map(a => [a.strumentoId, a.parametro.catalogo_chiave, a.parametro.ordine, a.collegamento.ordine]))
      .toEqual([['S1', 'e', 8, 2], ['S1', 'ci', 9, 3], ['S2', 'e', 10, 0], ['S2', 'ci', 11, 1]])
    expect(new Set(piano.aggiunte.map(a => a.parametro.id)).size).toBe(4)
  })

  it('una chiave nuova già presente nella copia (anche archiviata) non si aggiunge di nuovo', () => {
    const nuova: VoceCatalogo = {
      ...vecchia,
      parametri: [...vecchia.parametri, { chiave: 'e', nome: 'E', unita: null, n_letture: 1, valore_min: null, valore_max: null }],
    }
    const c = copia()
    const conE: CopiaStrumento = {
      ...c,
      parametri: [...c.parametri, { ...c.parametri[0], id: 'par-e', nome: 'E', catalogo_chiave: 'e', archiviato: true }],
    }

    expect(pianoAggiornamento(vecchia, nuova, [conE]).aggiunte).toEqual([])
  })

  it('una chiave che c\'era già e che l\'utente ha tolto dalla copia non torna', () => {
    const c = copia()
    const senzaGs: CopiaStrumento = { ...c, parametri: c.parametri.filter(p => p.catalogo_chiave !== 'gs') }

    const piano = pianoAggiornamento(vecchia, conValore(vecchia, 'gs', { nome: 'Gs' }), [senzaGs])

    expect(piano).toEqual({ aggiunte: [], modifiche: [], saltati: [] })
  })

  it('chiave rimossa dal catalogo: non si elimina né si modifica nulla', () => {
    const nuova: VoceCatalogo = { ...vecchia, parametri: vecchia.parametri.filter(pc => pc.chiave !== 'gs') }
    expect(pianoAggiornamento(vecchia, nuova, [copia()])).toEqual({ aggiunte: [], modifiche: [], saltati: [] })
  })

  it('letture cambiate con dati: è un saltato; senza dati è una modifica', () => {
    const nuova = conValore(vecchia, 'a', { n_letture: 3 })
    const conDati = copia({ conDati: new Set(['par-a']) })

    expect(pianoAggiornamento(vecchia, nuova, [conDati])).toEqual({
      aggiunte: [],
      modifiche: [],
      saltati: ['Pomodoro 2026 · Ciras · A: letture non aggiornato, ci sono già misure'],
    })
    expect(pianoAggiornamento(vecchia, nuova, [copia()]).modifiche).toEqual([
      { espId: 'E1', parametro: { ...parametroDi(copia(), 'a'), n_letture: 3 } },
    ])
  })

  it('con dati l\'unità non si aggiorna (reinterpreterebbe i numeri), il nome, il minimo e il massimo sì', () => {
    const c = copia({ conDati: new Set(['par-gs']) })
    const nuova = conValore(vecchia, 'gs', { nome: 'Gs', unita: 'mmol m⁻² s⁻¹', valore_min: -1, valore_max: 5 })

    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({
      aggiunte: [],
      modifiche: [{ espId: 'E1', parametro: { ...parametroDi(c, 'gs'), nome: 'Gs', valore_min: -1, valore_max: 5 } }],
      saltati: ['Pomodoro 2026 · Ciras · gs: unità non aggiornato, ci sono già misure'],
    })
  })

  it('il tipo non si tocca mai: un parametro diventato testo resta testo', () => {
    const c = ritoccata(copia(), 'a', { tipo: 'testo' })
    const piano = pianoAggiornamento(vecchia, conValore(vecchia, 'a', { nome: 'Assimilazione' }), [c])
    expect(piano.modifiche.map(m => m.parametro.tipo)).toEqual(['testo'])
  })

  it('i parametri archiviati della copia non si modificano e non finiscono tra i saltati', () => {
    const c = ritoccata(copia(), 'gs', { archiviato: true })
    const nuova = conValore(vecchia, 'gs', { nome: 'Gs', unita: 'mmol m⁻² s⁻¹' })
    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({ aggiunte: [], modifiche: [], saltati: [] })
  })

  it('i parametri aggiunti a mano alla copia (senza chiave) non si toccano', () => {
    const c = copia()
    const manuale: Parametro = { ...c.parametri[0], id: 'par-man', nome: 'A', catalogo_chiave: null, ordine: 9 }
    const conManuale: CopiaStrumento = { ...c, parametri: [...c.parametri, manuale] }

    const piano = pianoAggiornamento(vecchia, conValore(vecchia, 'a', { nome: 'Assimilazione' }), [conManuale])

    expect(piano.modifiche.map(m => m.parametro.id)).toEqual(['par-a'])
  })

  it('non cambia nome e icona dello strumento della copia e non tocca copie di altre voci', () => {
    const nuova: VoceCatalogo = { ...conValore(vecchia, 'a', { nome: 'Assimilazione' }), nome: 'Ciras 3', icona: '🌿' }
    const altra = copia({ espId: 'E2', strumento: { ...copia().strumento, catalogo_id: 'cat-altro' } })

    const piano = pianoAggiornamento(vecchia, nuova, [altra, copia()])

    expect(piano.modifiche.map(m => m.espId)).toEqual(['E1'])
    expect(Object.keys(piano)).toEqual(['aggiunte', 'modifiche', 'saltati'])
  })

  it('un minimo che supererebbe il massimo ritoccato a mano non si aggiorna: è un saltato', () => {
    const c = ritoccata(copia(), 'gs', { valore_max: 1 })
    const nuova = conValore(vecchia, 'gs', { valore_min: 1.5, valore_max: 3 })

    expect(pianoAggiornamento(vecchia, nuova, [c])).toEqual({
      aggiunte: [],
      modifiche: [],
      saltati: [
        'Pomodoro 2026 · Ciras · gs: massimo modificato a mano',
        'Pomodoro 2026 · Ciras · gs: minimo non aggiornato, supererebbe il massimo',
      ],
    })
  })

  it('segue le copie nell\'ordine ricevuto e i parametri per ordine', () => {
    const nuova: VoceCatalogo = { ...vecchia, parametri: vecchia.parametri.map(pc => ({ ...pc, unita: 'x' })) }
    const a = copia({ espId: 'E1', esperimentoNome: 'Uno' })
    // Nella seconda copia gs viene prima di A.
    const b = ritoccata(ritoccata(copia({ espId: 'E2', esperimentoNome: 'Due' }), 'gs', { ordine: 0, unita: 'y' }), 'a', { unita: 'z' })

    const piano = pianoAggiornamento(vecchia, nuova, [b, a])

    expect(piano.saltati).toEqual(['Due · Ciras · gs: unità modificato a mano', 'Due · Ciras · A: unità modificato a mano'])
    expect(piano.modifiche.map(m => [m.espId, m.parametro.catalogo_chiave])).toEqual([['E1', 'a'], ['E1', 'gs']])
  })

  it('non modifica la voce né le copie ricevute', () => {
    const c = copia()
    const prima = JSON.stringify(c.parametri)
    pianoAggiornamento(vecchia, conValore(vecchia, 'a', { nome: 'Assimilazione' }), [c])
    expect(JSON.stringify(c.parametri)).toBe(prima)
  })
})
