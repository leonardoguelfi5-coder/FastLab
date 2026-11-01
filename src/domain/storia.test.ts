import { describe, expect, it } from 'vitest'
import { storiaPianta } from './storia'
import type { Foto, Misura, Nota } from './tipi'

const misura = (id: string, data: string, ora = '09:00'): Misura =>
  ({ id, pianta_id: 'p', strumento_id: 's', data_rilievo: data, ora, valori: {} })
const nota = (id: string, data: string, extra: Partial<Nota> = {}): Nota =>
  ({ id, data, testo: id, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra })
const foto = (id: string, data: string): Foto =>
  ({ id, data, percorso: `E/${id}.jpg`, larghezza: null, altezza: null, byte: null, pianta_id: 'p', nota_id: null, archiviata: false })

describe('storiaPianta', () => {
  it('senza nulla non ha giorni', () => {
    expect(storiaPianta([], [], [])).toEqual([])
  })

  it('mette misure, note e foto dello stesso giorno nello stesso gruppo', () => {
    const giorni = storiaPianta([misura('m1', '2026-10-20')], [nota('n1', '2026-10-20')], [foto('f1', '2026-10-20')])
    expect(giorni).toHaveLength(1)
    expect(giorni[0].data).toBe('2026-10-20')
    expect(giorni[0].misure.map(m => m.id)).toEqual(['m1'])
    expect(giorni[0].note.map(n => n.id)).toEqual(['n1'])
    expect(giorni[0].foto.map(f => f.id)).toEqual(['f1'])
  })

  it('ordina i giorni dal più recente, anche se la data viene solo da una nota o da una foto', () => {
    const giorni = storiaPianta(
      [misura('m1', '2026-10-10')], [nota('n1', '2026-10-25')], [foto('f1', '2026-10-15'), foto('f2', '2026-10-05')],
    )
    expect(giorni.map(g => g.data)).toEqual(['2026-10-25', '2026-10-15', '2026-10-10', '2026-10-05'])
    expect(giorni[0].misure).toEqual([])
    expect(giorni[0].foto).toEqual([])
  })

  it('dentro il giorno le misure vanno dall\'ora più antica, note e foto restano nell\'ordine dato', () => {
    const [g] = storiaPianta(
      [misura('tardi', '2026-10-20', '15:00'), misura('presto', '2026-10-20', '08:00')],
      [nota('a', '2026-10-20'), nota('b', '2026-10-20')],
      [foto('x', '2026-10-20'), foto('y', '2026-10-20')],
    )
    expect(g.misure.map(m => m.id)).toEqual(['presto', 'tardi'])
    expect(g.note.map(n => n.id)).toEqual(['a', 'b'])
    expect(g.foto.map(f => f.id)).toEqual(['x', 'y'])
  })

  it('una data futura (promemoria) sta in cima', () => {
    const giorni = storiaPianta([misura('m1', '2026-10-20')], [nota('p', '2026-12-01', { promemoria: true })], [])
    expect(giorni.map(g => g.data)).toEqual(['2026-12-01', '2026-10-20'])
  })
})
