import { describe, it, expect } from 'vitest'
import { bozzaHydrochar } from './hydrochar'
import { SEMI_CATALOGO } from './semi'
import { validaBozza } from '../bozza'
import type { BozzaEsperimento } from '../tipi'

const nomiParametri = (b: BozzaEsperimento, nomeStrumento: string) => b.strumenti.find(s => s.nome === nomeStrumento)!.parametri
  .map(pp => b.parametri.find(p => p.id === pp.parametro_id)!.nome)

describe('bozzaHydrochar', () => {
  it('modello Hydrochar', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    expect(validaBozza(b)).toEqual([])
    expect(b.piante).toHaveLength(56)
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(
      ['Controllo', 'Controllo + HC', 'S1', 'S1 + HC', 'W1', 'W1 + HC', 'S1W1', 'S1W1 + HC'])
    const tratt = (et: string) => b.trattamenti.find(t => t.id === b.piante.find(p => p.etichetta === et)!.trattamento_id)!.etichetta
    expect([tratt('14'), tratt('15'), tratt('21'), tratt('56')]).toEqual(['Controllo', 'Controllo + HC', 'S1', 'S1W1 + HC'])
    expect(b.strumenti.map(p => p.nome)).toEqual(['Termometro', 'SPAD', 'Metro', 'Tabella fenologica'])
    const par = (n: string) => b.parametri.find(p => p.nome === n)!
    expect(par('Palchi').progressivo && par('Infiorescenze').progressivo && par('N palchi totali').progressivo).toBe(true)
  })

  it('mappa piante → trattamenti come nella v2 (1–56)', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
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
    const b = bozzaHydrochar(SEMI_CATALOGO)
    expect(b.fattori.map(f => [f.nome, f.livelli.map(l => l.nome)])).toEqual([
      ['Stress', ['Controllo', 'S1', 'W1', 'S1W1']], ['Hydrochar', ['No', 'Sì']]])
    const livelloNome = new Map(b.fattori.flatMap(f => f.livelli.map(l => [l.id, l.nome] as const)))
    const hc = b.trattamenti.find(t => t.etichetta === 'S1 + HC')!
    expect(hc.livello_ids.map(id => livelloNome.get(id))).toEqual(['S1', 'Sì'])
  })

  it('strumenti: tre dal catalogo e la tabella fenologica', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    expect(b.strumenti).toHaveLength(4)
    expect(b.strumenti.map(s => [s.nome, s.icona, s.ordine, s.tipo])).toEqual([
      ['Termometro', '🌡', 0, 'strumento'], ['SPAD', '💚', 1, 'strumento'],
      ['Metro', '📏', 2, 'strumento'], ['Tabella fenologica', '🌱', 3, 'fenologico']])
    expect(b.strumenti.filter(s => s.tipo === 'fenologico')).toHaveLength(1)
    expect(b.strumenti.every(s => !s.archiviato)).toBe(true)
    expect(b.strumenti.flatMap(s => s.parametri).some(pp => pp.obbligatorio)).toBe(false)
    // Collegati alla voce del catalogo; la tabella fenologica no (non è una voce).
    expect(b.strumenti.map(s => s.catalogo_id)).toEqual([
      'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000004', null])
  })

  it('i valori del Termometro vengono dal catalogo, con la loro chiave', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    const termometro = b.strumenti.find(s => s.nome === 'Termometro')!
    const parametri = termometro.parametri.map(pp => b.parametri.find(p => p.id === pp.parametro_id)!)
    expect(parametri.map(p => [p.nome, p.unita, p.tipo, p.catalogo_chiave])).toEqual([
      ['Temp aria', '°C', 'numero', 'temp_aria'], ['Temp pianta', '°C', 'numero', 'temp_pianta']])
    expect(nomiParametri(b, 'SPAD')).toEqual(['SPAD'])
    expect(nomiParametri(b, 'Metro')).toEqual(['Altezza'])
  })

  it('la tabella fenologica: sette voci facoltative, senza Altezza', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    expect(nomiParametri(b, 'Tabella fenologica')).toEqual(
      ['N palchi totali', 'N fiori fioriti', 'N frutti', 'N frutti invaiati', 'Palchi', 'Infiorescenze', 'Note'])
    expect(nomiParametri(b, 'Tabella fenologica')).not.toContain('Altezza')
    const par = (n: string) => b.parametri.find(p => p.nome === n)!
    expect(par('Palchi')).toMatchObject({ tipo: 'lista', progressivo: true, catalogo_chiave: null })
    expect(par('Palchi').sotto_campi.map(s => s.nome)).toEqual(['N foglie'])
    expect(par('Infiorescenze')).toMatchObject({ tipo: 'lista', progressivo: true })
    expect(par('Infiorescenze').sotto_campi.map(s => s.nome)).toEqual(['N fiori'])
    expect(par('N palchi totali').progressivo).toBe(true)
    expect(par('N fiori fioriti').progressivo).toBe(false)
    expect(par('Note').tipo).toBe('testo')
    expect(b.parametri.filter(p => p.nome === 'Altezza')).toHaveLength(1)
  })

  it('l\'ordine dei parametri è unico nell\'esperimento e segue gli strumenti', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    expect(b.parametri.map(p => p.ordine)).toEqual(b.parametri.map((_, i) => i))
    expect(b.parametri.map(p => p.nome)).toEqual([
      'Temp aria', 'Temp pianta', 'SPAD', 'Altezza',
      'N palchi totali', 'N fiori fioriti', 'N frutti', 'N frutti invaiati', 'Palchi', 'Infiorescenze', 'Note'])
    // Ogni strumento elenca i propri parametri nello stesso ordine del parametro.
    for (const s of b.strumenti) expect(s.parametri.map(pp => pp.ordine)).toEqual(s.parametri.map((_, i) => i))
  })

  it('una voce che manca dal catalogo si costruisce dai semi, senza collegamento', () => {
    const senzaTermometro = SEMI_CATALOGO.filter(v => v.nome !== 'Termometro')
    const b = bozzaHydrochar(senzaTermometro)
    expect(validaBozza(b)).toEqual([])
    const termometro = b.strumenti.find(s => s.nome === 'Termometro')!
    expect(termometro).toMatchObject({ icona: '🌡', ordine: 0, tipo: 'strumento', catalogo_id: null })
    expect(nomiParametri(b, 'Termometro')).toEqual(['Temp aria', 'Temp pianta'])
    // Le altre voci, presenti, restano collegate.
    expect(b.strumenti.find(s => s.nome === 'SPAD')!.catalogo_id).toBe('c0000000-0000-0000-0000-000000000001')
  })

  it('con il catalogo vuoto tutti e tre gli strumenti vengono dai semi', () => {
    const b = bozzaHydrochar([])
    expect(validaBozza(b)).toEqual([])
    expect(b.strumenti.map(s => [s.nome, s.catalogo_id])).toEqual([
      ['Termometro', null], ['SPAD', null], ['Metro', null], ['Tabella fenologica', null]])
  })

  it('la voce si trova per nome senza badare a maiuscole e spazi, tra quelle non archiviate', () => {
    const catalogo = [
      { ...SEMI_CATALOGO[1], id: 'vecchio', archiviato: true },
      { ...SEMI_CATALOGO[1], id: 'mio-termometro', nome: '  TERMOMETRO ', icona: '🔥' },
    ]
    const b = bozzaHydrochar(catalogo)
    const termometro = b.strumenti.find(s => s.catalogo_id === 'mio-termometro')!
    expect(termometro).toMatchObject({ nome: '  TERMOMETRO ', icona: '🔥', ordine: 0 })
    // Solo una voce archiviata non basta: si ricade sui semi.
    expect(bozzaHydrochar([catalogo[0]]).strumenti[0].catalogo_id).toBeNull()
  })

  it('un esperimento con la sola tabella fenologica è valido', () => {
    const b = bozzaHydrochar(SEMI_CATALOGO)
    const feno = b.strumenti.filter(s => s.tipo === 'fenologico')
    const tenuti = new Set(feno.flatMap(s => s.parametri.map(pp => pp.parametro_id)))
    b.strumenti = feno
    b.parametri = b.parametri.filter(p => tenuti.has(p.id))
    expect(validaBozza(b)).toEqual([])
  })

  it('nessun parametro sta in due strumenti', () => {
    const ids = bozzaHydrochar(SEMI_CATALOGO).strumenti.flatMap(p => p.parametri.map(pp => pp.parametro_id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ogni chiamata genera id nuovi', () => {
    expect(bozzaHydrochar(SEMI_CATALOGO).esperimento.id).not.toBe(bozzaHydrochar(SEMI_CATALOGO).esperimento.id)
  })
})
