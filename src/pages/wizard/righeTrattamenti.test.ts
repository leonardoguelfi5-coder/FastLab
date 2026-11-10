import { describe, expect, it } from 'vitest'
import { bozzaVuota, clonaConfig } from '@/domain/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import { generaPiante } from '@/domain/piante'
import { configDiEsempio, fattore } from '@/domain/test-helpers'
import type { BozzaEsperimento } from '@/domain/tipi'
import {
  MOTIVO_FATTORI_CAMBIATI, MOTIVO_PIANTE_DA_RIGENERARE, motivoBlocco, pianteAggiornate, righeAggiornate,
  righeDaBozza, rigeneraRighe, trattamentiInclusi, type RigaTrattamento,
} from './righeTrattamenti'

function conFattori(...fattori: ReturnType<typeof fattore>[]): BozzaEsperimento {
  const b = bozzaVuota()
  b.fattori = fattori.map((f, i) => ({ ...f, ordine: i }))
  return b
}

/** Piante generate dalla tabella, come fa il pulsante "Genera piante". */
function pianteDa(righe: RigaTrattamento[]) {
  return generaPiante(righe.filter(r => r.incluso).map(r => ({ trattamento_id: r.trattamento.id, n: Number(r.n) })))
}

describe('righeDaBozza', () => {
  it('Hydrochar: 8 righe incluse con N uguale alle piante di ogni trattamento, e nessun blocco', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    const righe = righeDaBozza(b)
    expect(righe).toHaveLength(8)
    expect(righe.every(r => r.incluso)).toBe(true)
    expect(righe.map(r => r.n)).toEqual(['14', '6', '6', '6', '6', '6', '6', '6'])
    expect(righe.map(r => r.trattamento)).toEqual(b.trattamenti)
    expect(motivoBlocco(b, righe)).toBeNull()
  })

  it('le combinazioni senza trattamento compaiono escluse, con l\'etichetta generata', () => {
    const b = clonaConfig(configDiEsempio())
    const escluso = b.trattamenti[1]
    b.trattamenti = b.trattamenti.filter(t => t !== escluso)
    b.piante = b.piante.filter(p => p.trattamento_id !== escluso.id)

    const righe = righeDaBozza(b)
    expect(righe).toHaveLength(4)
    expect(righe.map(r => r.incluso)).toEqual([true, false, true, true])
    expect(righe[1].trattamento.etichetta).toBe(escluso.etichetta)
    expect(righe[1].trattamento.livello_ids).toEqual(escluso.livello_ids)
    expect(motivoBlocco(b, righe)).toBeNull()
  })

  it('una bozza vuota non ha righe', () => expect(righeDaBozza(bozzaVuota())).toEqual([]))
  it('con i fattori ma senza trattamenti la tabella è ancora da generare', () =>
    expect(righeDaBozza(conFattori(fattore('Stress', ['Controllo', 'S1'])))).toEqual([]))
})

describe('rigeneraRighe', () => {
  it('la prima volta crea tutte le combinazioni, incluse, con 1 pianta', () => {
    const righe = rigeneraRighe([], [fattore('Concime', ['0', '50', '100'])])
    expect(righe.map(r => [r.trattamento.etichetta, r.incluso, r.n])).toEqual([
      ['0', true, '1'], ['50', true, '1'], ['100', true, '1'],
    ])
  })

  it('le righe già presenti restano come sono; le nuove combinazioni si aggiungono, quelle sparite si tolgono', () => {
    const concime = fattore('Concime', ['0', '50'])
    const prima = rigeneraRighe([], [concime]).map((r, i) => i === 0
      ? { ...r, incluso: false, n: '4', trattamento: { ...r.trattamento, etichetta: 'Testimone' } }
      : r)

    const cento = { id: crypto.randomUUID(), nome: '100', ordine: 2 }
    const dopo = rigeneraRighe(prima, [{ ...concime, livelli: [concime.livelli[0], cento] }])

    expect(dopo).toHaveLength(2)
    expect(dopo[0]).toBe(prima[0])
    expect(dopo[1]).toMatchObject({ incluso: true, n: '1', trattamento: { etichetta: '100', livello_ids: [cento.id] } })
  })
})

describe('righeAggiornate', () => {
  const stress = fattore('Stress', ['Controllo', 'S1'])
  const righe = rigeneraRighe([], [stress])

  it('vero se le righe sono esattamente le combinazioni dei fattori', () =>
    expect(righeAggiornate(righe, [stress])).toBe(true))
  it('falso dopo aver aggiunto o tolto un livello', () => {
    const conW1 = { ...stress, livelli: [...stress.livelli, { id: crypto.randomUUID(), nome: 'W1', ordine: 2 }] }
    expect(righeAggiornate(righe, [conW1])).toBe(false)
    expect(righeAggiornate(righe, [{ ...stress, livelli: stress.livelli.slice(1) }])).toBe(false)
  })
  it('falso dopo aver aggiunto un fattore', () =>
    expect(righeAggiornate(righe, [stress, fattore('HC', ['No', 'Sì'])])).toBe(false))
})

describe('pianteAggiornate', () => {
  const righe = rigeneraRighe([], [fattore('Stress', ['Controllo', 'S1'])]).map(r => ({ ...r, n: '2' }))
  const piante = pianteDa(righe)

  it('vero subito dopo averle generate', () => expect(pianteAggiornate(righe, piante)).toBe(true))
  it('falso se cambia il numero di piante di un trattamento', () =>
    expect(pianteAggiornate(righe.map((r, i) => i === 0 ? { ...r, n: '3' } : r), piante)).toBe(false))
  it('falso se il numero non è valido', () =>
    expect(pianteAggiornate(righe.map((r, i) => i === 0 ? { ...r, n: '2,5' } : r), piante)).toBe(false))
  it('falso se si esclude un trattamento che ha piante', () =>
    expect(pianteAggiornate(righe.map((r, i) => i === 0 ? { ...r, incluso: false } : r), piante)).toBe(false))
})

describe('motivoBlocco', () => {
  it('nessun blocco finché non ci sono né trattamenti né piante', () => {
    expect(motivoBlocco(conFattori(fattore('Stress', ['S1'])), [])).toBeNull()
  })

  it('fattori cambiati dopo aver generato i trattamenti', () => {
    const stress = fattore('Stress', ['Controllo', 'S1'])
    const b = conFattori(stress)
    const righe = rigeneraRighe([], [stress])
    b.fattori = [{ ...stress, livelli: stress.livelli.slice(0, 1) }]
    expect(motivoBlocco(b, righe)).toBe(MOTIVO_FATTORI_CAMBIATI)
  })

  it('tabella cambiata dopo aver generato le piante', () => {
    const stress = fattore('Stress', ['Controllo', 'S1'])
    const b = conFattori(stress)
    const righe = rigeneraRighe([], [stress])
    b.trattamenti = trattamentiInclusi(righe)
    b.piante = pianteDa(righe)
    expect(motivoBlocco(b, righe)).toBeNull()
    expect(motivoBlocco(b, righe.map((r, i) => i === 1 ? { ...r, n: '5' } : r))).toBe(MOTIVO_PIANTE_DA_RIGENERARE)
  })
})

describe('trattamentiInclusi', () => {
  it('solo le righe incluse, con l\'ordine rinumerato', () => {
    const righe = rigeneraRighe([], [fattore('Stress', ['Controllo', 'S1', 'W1'])])
    const inclusi = trattamentiInclusi(righe.map((r, i) => i === 0 ? { ...r, incluso: false } : r))
    expect(inclusi.map(t => [t.etichetta, t.ordine])).toEqual([['S1', 0], ['W1', 1]])
  })
})
