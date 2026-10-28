import { describe, it, expect } from 'vitest'
import { bozzaVuota, clonaConfig, nuovaPassata, nuovoParametro, validaBozza } from './bozza'
import { conPiante, configDiEsempio, fattore, parametro } from './test-helpers'

describe('bozza', () => {
  it('bozzaVuota ha un esperimento in corso e nessun elemento', () => {
    const b = bozzaVuota()
    expect(b.esperimento).toMatchObject({ nome: '', data_inizio: null, note: '', stato: 'in_corso' })
    expect(b.esperimento.id).toBeTruthy()
    expect([b.fattori, b.trattamenti, b.piante, b.parametri, b.passate].every(a => a.length === 0)).toBe(true)
  })

  it('validaBozza segnala gli errori', () => {
    const b = bozzaVuota()
    expect(validaBozza(b)).toEqual(expect.arrayContaining([
      'Dai un nome all\'esperimento.', 'Crea almeno un trattamento.', 'Aggiungi almeno una pianta.',
      'Aggiungi almeno un parametro.', 'Crea almeno una passata.']))
  })
  it('una bozza completa è valida', () => expect(validaBozza(conPiante(['1', '2']))).toEqual([]))
  it('il nome di soli spazi non vale', () => {
    const b = conPiante(['1'])
    b.esperimento.nome = '   '
    expect(validaBozza(b)).toContain('Dai un nome all\'esperimento.')
  })
  it('etichette pianta duplicate (anche con spazi o maiuscole)', () =>
    expect(validaBozza(conPiante(['A1', ' a1']))).toContain('Etichetta pianta duplicata: "a1".'))
  it('un\'etichetta duplicata più volte è segnalata una volta sola', () =>
    expect(validaBozza(conPiante(['A1', 'a1', 'A1'])).filter(e => e.startsWith('Etichetta pianta'))).toHaveLength(1))
  it('etichette trattamento duplicate', () => {
    const b = conPiante(['1'])
    b.trattamenti.push({ id: crypto.randomUUID(), etichetta: ' CONTROLLO ', ordine: 1, livello_ids: [] })
    expect(validaBozza(b)).toContain('Etichetta trattamento duplicata: "controllo".')
  })
  it('etichetta pianta vuota', () => {
    const b = conPiante(['1', '  '])
    expect(validaBozza(b)).toContain('Una pianta non ha etichetta.')
  })
  it('etichetta trattamento vuota', () => {
    const b = conPiante(['1'])
    b.trattamenti[0].etichetta = ' '
    expect(validaBozza(b)).toContain('Un trattamento non ha etichetta.')
  })

  it('lista senza sotto-campi, min > max, passata vuota', () => {
    const b = conPiante(['1'])
    const palchi = parametro('Palchi', { tipo: 'lista', sotto_campi: [] })
    const altezza = parametro('Altezza', { valore_min: 10, valore_max: 5 })
    b.parametri.push(palchi, altezza)
    b.passate[0].parametri.push(
      { parametro_id: palchi.id, obbligatorio: false, ordine: 1 },
      { parametro_id: altezza.id, obbligatorio: false, ordine: 2 })
    b.passate.push({ id: crypto.randomUUID(), nome: 'SPAD', icona: null, ordine: 1, parametri: [] })
    expect(validaBozza(b)).toEqual([
      'Il parametro "Palchi" deve avere almeno un sotto-campo.',
      'Il parametro "Altezza" ha il minimo maggiore del massimo.',
      'La passata "SPAD" non ha parametri.',
    ])
  })
  it('parametro senza nome', () => {
    const b = conPiante(['1'])
    b.parametri[0].nome = '  '
    expect(validaBozza(b)).toContain('Un parametro non ha nome.')
  })
  it('n_letture fuori da 1–20', () => {
    const b = conPiante(['1'])
    b.parametri[0].n_letture = 0
    expect(validaBozza(b)).toContain('Il parametro "Altezza" deve avere almeno una lettura.')
    b.parametri[0].n_letture = 21
    expect(validaBozza(b)).toContain('Il parametro "Altezza" può avere al massimo 20 letture.')
    b.parametri[0].n_letture = 20
    expect(validaBozza(b)).toEqual([])
  })
  it('passata senza nome', () => {
    const b = conPiante(['1'])
    b.passate[0].nome = ''
    expect(validaBozza(b)).toContain('Una passata non ha nome.')
  })
  it('i parametri archiviati non contano', () => {
    const b = conPiante(['1'])
    b.parametri[0].archiviato = true
    expect(validaBozza(b)).toContain('Aggiungi almeno un parametro.')
    b.parametri.push(parametro('Vecchio', { archiviato: true, n_letture: 0 }))
    expect(validaBozza(b)).not.toContain('Il parametro "Vecchio" deve avere almeno una lettura.')
  })

  it('n_letture non intero', () => {
    const b = conPiante(['1'])
    b.parametri[0].n_letture = 2.5
    expect(validaBozza(b)).toEqual(['Il parametro "Altezza" deve avere un numero intero di letture.'])
  })
  it('sotto-campi senza nome o con lo stesso nome (anche con spazi o maiuscole)', () => {
    const b = conPiante(['1'])
    const palchi = parametro('Palchi', {
      tipo: 'lista',
      sotto_campi: [
        { chiave: 'a', nome: 'N foglie', unita: null },
        { chiave: 'b', nome: ' n FOGLIE ', unita: null },
        { chiave: 'c', nome: '  ', unita: null },
      ],
    })
    b.parametri.push(palchi)
    b.passate[0].parametri.push({ parametro_id: palchi.id, obbligatorio: false, ordine: 1 })
    expect(validaBozza(b)).toEqual([
      'Il parametro "Palchi" ha un sotto-campo senza nome.',
      'Il parametro "Palchi" ha due sotto-campi con lo stesso nome: "n foglie".',
    ])
  })
  it('fattore senza nome o senza livelli', () => {
    const b = conPiante(['1'])
    b.fattori = [fattore(' ', ['A']), fattore('Stress', [])]
    expect(validaBozza(b)).toEqual(['Un fattore non ha nome.', 'Il fattore "Stress" non ha livelli.'])
  })

  it('nuovoParametro: numerico, vuoto, con id nuovo e con l\'ordine dato', () => {
    const p = nuovoParametro(3)
    expect(p).toEqual({
      id: expect.any(String), nome: '', unita: null, tipo: 'numero', ordine: 3, archiviato: false, progressivo: false,
      ricorda_tra_piante: false, n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [],
    })
    expect(nuovoParametro(0).id).not.toBe(p.id)
  })
  it('nuovaPassata: senza nome, icona e parametri', () =>
    expect(nuovaPassata(1)).toEqual({ id: expect.any(String), nome: '', icona: null, ordine: 1, parametri: [] }))

  it('clonaConfig genera id nuovi e rimappa i riferimenti', () => {
    const c = configDiEsempio(); const b = clonaConfig(c)
    expect(b.esperimento.nome).toBe(`Copia di ${c.esperimento.nome}`)
    expect(b.esperimento.id).not.toBe(c.esperimento.id)
    const ids = new Set(b.trattamenti.map(t => t.id)); expect(b.piante.every(p => ids.has(p.trattamento_id))).toBe(true)
    const par = new Set(b.parametri.map(p => p.id)); expect(b.passate.flatMap(p => p.parametri).every(pp => par.has(pp.parametro_id))).toBe(true)
    expect(b.parametri.some(p => p.archiviato)).toBe(false)   // gli archiviati non si copiano
    expect(validaBozza(b)).toEqual([])
  })
  it('clonaConfig non riusa nessun id e rimappa i livelli dei trattamenti', () => {
    const c = configDiEsempio(); const b = clonaConfig(c)
    const tutti = (x: typeof c) => [
      x.esperimento.id, ...x.fattori.map(f => f.id), ...x.fattori.flatMap(f => f.livelli.map(l => l.id)),
      ...x.trattamenti.map(t => t.id), ...x.piante.map(p => p.id), ...x.parametri.map(p => p.id), ...x.passate.map(p => p.id)]
    const vecchi = new Set(tutti(c))
    expect(tutti(b).some(id => vecchi.has(id))).toBe(false)
    const livelli = new Set(b.fattori.flatMap(f => f.livelli.map(l => l.id)))
    expect(b.trattamenti.flatMap(t => t.livello_ids).every(id => livelli.has(id))).toBe(true)
    // stessa struttura: etichette, ordine, nomi
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(c.trattamenti.map(t => t.etichetta))
    expect(b.piante.map(p => p.etichetta)).toEqual(c.piante.map(p => p.etichetta))
    expect(b.passate.map(p => p.nome)).toEqual(c.passate.map(p => p.nome))
    // il riferimento al parametro archiviato sparisce dalla passata
    expect(b.passate[0].parametri).toHaveLength(1)
  })
  it('clonaConfig non modifica l\'originale', () => {
    const c = configDiEsempio(); const copia = structuredClone(c)
    clonaConfig(c)
    expect(c).toEqual(copia)
  })
})
