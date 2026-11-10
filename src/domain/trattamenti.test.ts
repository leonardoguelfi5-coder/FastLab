import { describe, it, expect } from 'vitest'
import { generaTrattamenti } from './trattamenti'
import { fattore } from './test-helpers'

describe('generaTrattamenti', () => {
  const stress = fattore('Stress', ['Controllo', 'S1'])
  const hc = fattore('Hydrochar', ['No', 'Sì'])

  it('prodotto cartesiano, primo fattore più lento', () => {
    expect(generaTrattamenti([stress, hc]).map(t => t.etichetta))
      .toEqual(['Controllo + No', 'Controllo + Sì', 'S1 + No', 'S1 + Sì'])
    expect(generaTrattamenti([stress, hc])[1].livello_ids).toEqual([stress.livelli[0].id, hc.livelli[1].id])
  })
  it('ordine parte da 0 e id sono unici', () => {
    const t = generaTrattamenti([stress, hc])
    expect(t.map(x => x.ordine)).toEqual([0, 1, 2, 3])
    expect(new Set(t.map(x => x.id)).size).toBe(4)
  })
  it('un solo fattore', () => expect(generaTrattamenti([stress])).toHaveLength(2))
  it('nessun fattore', () => expect(generaTrattamenti([])).toEqual([]))
  it('un fattore senza livelli non produce trattamenti', () =>
    expect(generaTrattamenti([stress, fattore('Vuoto', [])])).toEqual([]))
})
