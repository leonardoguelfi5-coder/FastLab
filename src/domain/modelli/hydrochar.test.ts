import { describe, it, expect } from 'vitest'
import { bozzaHydrochar } from './hydrochar'
import { validaBozza } from '../bozza'

describe('bozzaHydrochar', () => {
  it('modello Hydrochar', () => {
    const b = bozzaHydrochar()
    expect(validaBozza(b)).toEqual([])
    expect(b.piante).toHaveLength(56)
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(
      ['Controllo', 'Controllo + HC', 'S1', 'S1 + HC', 'W1', 'W1 + HC', 'S1W1', 'S1W1 + HC'])
    const tratt = (et: string) => b.trattamenti.find(t => t.id === b.piante.find(p => p.etichetta === et)!.trattamento_id)!.etichetta
    expect([tratt('14'), tratt('15'), tratt('21'), tratt('56')]).toEqual(['Controllo', 'Controllo + HC', 'S1', 'S1W1 + HC'])
    expect(b.strumenti.map(p => p.nome)).toEqual(['Termometro', 'SPAD', 'Altezza', 'Fenologici'])
    const par = (n: string) => b.parametri.find(p => p.nome === n)!
    expect(par('Palchi').progressivo && par('Infiorescenze').progressivo && par('N palchi totali').progressivo).toBe(true)
  })

  it('mappa piante → trattamenti come nella v2 (1–56)', () => {
    const b = bozzaHydrochar()
    const et = (id: string) => b.trattamenti.find(t => t.id === id)!.etichetta
    // [prima pianta, ultima pianta, trattamento]
    const intervalli: [number, number, string][] = [
      [1, 14, 'Controllo'], [15, 20, 'Controllo + HC'],
      [21, 26, 'S1'], [27, 32, 'S1 + HC'],
      [33, 38, 'W1'], [39, 44, 'W1 + HC'],
      [45, 50, 'S1W1'], [51, 56, 'S1W1 + HC'],
    ]
    const attese = intervalli.flatMap(([da, a, trattamento]) =>
      Array.from({ length: a - da + 1 }, (_, k) => [String(da + k), trattamento]))
    expect(attese).toHaveLength(56)
    expect(b.piante.map(p => [p.etichetta, et(p.trattamento_id)])).toEqual(attese)
    expect(b.piante.map(p => p.ordine)).toEqual(b.piante.map((_, i) => i))
  })

  it('fattori Stress × Hydrochar e livelli dei trattamenti coerenti', () => {
    const b = bozzaHydrochar()
    expect(b.fattori.map(f => [f.nome, f.livelli.map(l => l.nome)])).toEqual([
      ['Stress', ['Controllo', 'S1', 'W1', 'S1W1']], ['Hydrochar', ['No', 'Sì']]])
    const livelloNome = new Map(b.fattori.flatMap(f => f.livelli.map(l => [l.id, l.nome] as const)))
    const hc = b.trattamenti.find(t => t.etichetta === 'S1 + HC')!
    expect(hc.livello_ids.map(id => livelloNome.get(id))).toEqual(['S1', 'Sì'])
  })

  it('parametri e strumenti', () => {
    const b = bozzaHydrochar()
    expect(b.parametri.map(p => [p.nome, p.unita, p.tipo])).toEqual([
      ['Temp aria', '°C', 'numero'], ['Temp pianta', '°C', 'numero'], ['SPAD', null, 'numero'], ['Altezza', 'cm', 'numero'],
      ['N palchi totali', null, 'numero'], ['N fiori fioriti', null, 'numero'], ['N frutti', null, 'numero'],
      ['N frutti invaiati', null, 'numero'], ['Palchi', null, 'lista'], ['Infiorescenze', null, 'lista'], ['Note', null, 'testo']])
    const par = (n: string) => b.parametri.find(p => p.nome === n)!
    expect(par('Palchi').sotto_campi.map(s => s.nome)).toEqual(['N foglie'])
    expect(par('Infiorescenze').sotto_campi.map(s => s.nome)).toEqual(['N fiori'])
    expect(par('N fiori fioriti').progressivo).toBe(false)
    const nomiParametri = (nome: string) => b.strumenti.find(p => p.nome === nome)!.parametri
      .map(pp => b.parametri.find(p => p.id === pp.parametro_id)!.nome)
    expect(nomiParametri('Termometro')).toEqual(['Temp aria', 'Temp pianta'])
    expect(nomiParametri('SPAD')).toEqual(['SPAD'])
    expect(nomiParametri('Altezza')).toEqual(['Altezza'])
    // Altezza la misura solo il suo strumento: un parametro sta in un solo strumento (indice unico nel database).
    expect(nomiParametri('Fenologici')).toEqual(
      ['N palchi totali', 'N fiori fioriti', 'N frutti', 'N frutti invaiati', 'Palchi', 'Infiorescenze', 'Note'])
    expect(b.strumenti.map(p => p.icona)).toEqual(['🌡', '💚', '📏', '🌱'])
    expect(b.strumenti.flatMap(p => p.parametri).some(pp => pp.obbligatorio)).toBe(false)
    expect(b.strumenti.every(p => p.tipo === 'strumento' && !p.archiviato)).toBe(true)
  })

  it('nessun parametro sta in due strumenti', () => {
    const ids = bozzaHydrochar().strumenti.flatMap(p => p.parametri.map(pp => pp.parametro_id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ogni chiamata genera id nuovi', () => {
    expect(bozzaHydrochar().esperimento.id).not.toBe(bozzaHydrochar().esperimento.id)
  })
})
