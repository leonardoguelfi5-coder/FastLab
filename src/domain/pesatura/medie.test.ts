import { describe, expect, it } from 'vitest'
import type { Pianta } from '../tipi'
import { mediePerTrattamento } from './medie'
import type { CampionePesatura, Peso, SessionePesatura, TipoAnalisi, TipoPeso } from './tipi'

const sessione = (tipo: TipoAnalisi, repliche = 1): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', titolo: 'T', tipo, unita: 'g',
  impostazioni: { repliche, rapportoTampone: null, sensore: null }, data: '2026-11-12', nota: null, conclusa: false,
})
const piante = new Map<string, Pianta>([
  ['p1', { id: 'p1', trattamento_id: 'tB', etichetta: '1', blocco: null, ordine: 1 } as Pianta],
  ['p2', { id: 'p2', trattamento_id: 'tB', etichetta: '2', blocco: null, ordine: 2 } as Pianta],
  ['p3', { id: 'p3', trattamento_id: 'tA', etichetta: '3', blocco: null, ordine: 3 } as Pianta],
])
const campione = (id: string, ordine: number, pianta_id: string | null): CampionePesatura =>
  ({ id, sessione_id: 'S', pianta_id, nome: pianta_id ? null : id, substrato: null, ordine })
let n = 0
const peso = (campione_id: string, tipo: TipoPeso, valore: number, replica = 1): Peso =>
  ({ id: `w${n++}`, campione_id, replica, tipo, valore, lettura: null, misurato_il: '2026-11-12T08:00:00Z' })
/** I tre pesi di un RWC che vale `(f − s) / (t − s)`. */
const rwc = (c: string, f: number, t: number, s: number, replica = 1) =>
  [peso(c, 'fresco', f, replica), peso(c, 'turgido', t, replica), peso(c, 'secco', s, replica)]

describe('mediePerTrattamento', () => {
  it('RWC: media delle piante di ogni trattamento, nell\'ordine dei campioni', () => {
    const cs = [campione('c1', 1, 'p1'), campione('c2', 2, 'p2'), campione('c3', 3, 'p3')]
    // p1: 80 %, p2: 60 %, p3: 50 %
    const pesi = [...rwc('c1', 0.9, 1.1, 0.1), ...rwc('c2', 0.7, 1.1, 0.1), ...rwc('c3', 0.6, 1.1, 0.1)]
    const medie = mediePerTrattamento(sessione('rwc'), cs, pesi, piante)
    expect(medie.map(m => m.trattamentoId)).toEqual(['tB', 'tA'])
    expect(medie[0].media).toBeCloseTo(70)
    expect(medie[0].n).toBe(2)
    expect(medie[1]).toMatchObject({ trattamentoId: 'tA', n: 1 })
    expect(medie[1].media).toBeCloseTo(50)
  })

  it('ogni pianta conta una volta: prima la media delle sue repliche', () => {
    const cs = [campione('c1', 1, 'p1'), campione('c2', 2, 'p2')]
    // p1: repliche 80 % e 40 % (media 60 %), p2: 90 %. Il trattamento: (60 + 90) / 2 = 75, non (80 + 40 + 90) / 3.
    const pesi = [...rwc('c1', 0.9, 1.1, 0.1, 1), ...rwc('c1', 0.5, 1.1, 0.1, 2), ...rwc('c2', 1.0, 1.1, 0.1)]
    const [m] = mediePerTrattamento(sessione('rwc', 2), cs, pesi, piante)
    expect(m.media).toBeCloseTo(75)
    expect(m.n).toBe(2)
  })

  it('le piante senza tutti i pesi, le righe libere e i trattamenti senza valori restano fuori', () => {
    const cs = [campione('c1', 1, 'p1'), campione('c3', 2, 'p3'), campione('Bianco', 3, null)]
    const pesi = [...rwc('c1', 0.9, 1.1, 0.1), peso('c3', 'fresco', 1), ...rwc('Bianco', 0.5, 1.1, 0.1)]
    expect(mediePerTrattamento(sessione('rwc'), cs, pesi, piante)).toEqual([{ trattamentoId: 'tB', media: expect.closeTo(80), n: 1 }])
  })

  it('% di sostanza secca', () => {
    const cs = [campione('c1', 1, 'p1'), campione('c2', 2, 'p2')]
    const pesi = [peso('c1', 'fresco', 2), peso('c1', 'secco', 0.5), peso('c2', 'fresco', 1), peso('c2', 'secco', 0.35)]
    const [m] = mediePerTrattamento(sessione('sostanza_secca'), cs, pesi, piante)
    expect(m.media).toBeCloseTo(30)
  })

  it('aliquote e vasi non hanno medie', () => {
    const cs = [campione('c1', 1, 'p1')]
    expect(mediePerTrattamento(sessione('aliquota'), cs, [peso('c1', 'aliquota', 1)], piante)).toEqual([])
    expect(mediePerTrattamento(sessione('vasi'), cs, [], piante)).toEqual([])
  })
})
