import { beforeEach, describe, expect, it, vi } from 'vitest'

// nuovoId vero, ma osservabile: gli id devono venire da lì (mai crypto.randomUUID diretto).
vi.mock('@/lib/id', async importOriginal => {
  const vero = await importOriginal<typeof import('@/lib/id')>()
  return { nuovoId: vi.fn(vero.nuovoId) }
})

import { nuovoId } from '@/lib/id'
import { strumentoDaCatalogo } from './catalogo'
import type { VoceCatalogo } from './tipi'

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
