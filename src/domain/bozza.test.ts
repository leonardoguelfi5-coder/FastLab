import { describe, it, expect } from 'vitest'
import {
  bozzaVuota, clonaConfig, nuovoStrumento, nuovoParametro, problemiParametro, problemiStrumento, pulisciBozza,
  pulisciParametro, validaBozza,
} from './bozza'
import { conPiante, configDiEsempio, fattore, parametro } from './test-helpers'

describe('bozza', () => {
  it('bozzaVuota ha un esperimento in corso e nessun elemento', () => {
    const b = bozzaVuota()
    expect(b.esperimento).toMatchObject({ nome: '', data_inizio: null, note: '', stato: 'in_corso' })
    expect(b.esperimento.id).toBeTruthy()
    expect([b.fattori, b.trattamenti, b.piante, b.parametri, b.strumenti].every(a => a.length === 0)).toBe(true)
  })

  it('validaBozza segnala gli errori', () => {
    const b = bozzaVuota()
    expect(validaBozza(b)).toEqual(expect.arrayContaining([
      'Dai un nome all\'esperimento.', 'Crea almeno un trattamento.', 'Aggiungi almeno una pianta.',
      'Aggiungi almeno un parametro.', 'Crea almeno uno strumento.']))
  })
  it('una bozza completa è valida', () => expect(validaBozza(conPiante(['1', '2']))).toEqual([]))
  it('il nome di soli spazi non vale', () => {
    const b = conPiante(['1'])
    b.esperimento.nome = '   '
    expect(validaBozza(b)).toContain('Dai un nome all\'esperimento.')
  })
  it('etichette pianta duplicate (anche con spazi o maiuscole): il messaggio riporta la prima com\'è scritta', () => {
    expect(validaBozza(conPiante(['A1', ' a1']))).toContain('Etichetta pianta duplicata: "A1".')
    expect(validaBozza(conPiante([' B3-12 ', 'b3-12']))).toContain('Etichetta pianta duplicata: "B3-12".')
  })
  it('un\'etichetta duplicata più volte è segnalata una volta sola', () =>
    expect(validaBozza(conPiante(['A1', 'a1', 'A1'])).filter(e => e.startsWith('Etichetta pianta'))).toHaveLength(1))
  it('etichette trattamento duplicate', () => {
    const b = conPiante(['1'])
    b.trattamenti.push({ id: crypto.randomUUID(), etichetta: ' CONTROLLO ', ordine: 1, livello_ids: [] })
    expect(validaBozza(b)).toContain('Etichetta trattamento duplicata: "Controllo".')
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

  it('lista senza sotto-campi, min > max, strumento vuoto', () => {
    const b = conPiante(['1'])
    const palchi = parametro('Palchi', { tipo: 'lista', sotto_campi: [] })
    const diametro = parametro('Diametro', { valore_min: 10, valore_max: 5 })
    b.parametri.push(palchi, diametro)
    b.strumenti[0].parametri.push(
      { parametro_id: palchi.id, obbligatorio: false, ordine: 1 },
      { parametro_id: diametro.id, obbligatorio: false, ordine: 2 })
    b.strumenti.push({ id: crypto.randomUUID(), nome: 'SPAD', icona: null, ordine: 1, tipo: 'strumento', archiviato: false, parametri: [] })
    expect(validaBozza(b)).toEqual([
      'Il parametro "Palchi" deve avere almeno un sotto-campo.',
      'Il parametro "Diametro" ha il minimo maggiore del massimo.',
      'Lo strumento "SPAD" non ha parametri.',
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
  it('strumento senza nome', () => {
    const b = conPiante(['1'])
    b.strumenti[0].nome = ''
    expect(validaBozza(b)).toContain('Uno strumento non ha nome.')
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
    b.strumenti[0].parametri.push({ parametro_id: palchi.id, obbligatorio: false, ordine: 1 })
    expect(validaBozza(b)).toEqual([
      'Il parametro "Palchi" ha un sotto-campo senza nome.',
      'Il parametro "Palchi" ha due sotto-campi con lo stesso nome: "N foglie".',
    ])
  })
  it('fattore senza nome o senza livelli', () => {
    const b = conPiante(['1'])
    b.fattori = [fattore(' ', ['A']), fattore('Stress', [])]
    expect(validaBozza(b)).toEqual(['Un fattore non ha nome.', 'Il fattore "Stress" non ha livelli.'])
  })

  it('due fattori con lo stesso nome (anche con spazi o maiuscole)', () => {
    const b = conPiante(['1'])
    b.fattori = [fattore('Stress', ['A']), fattore(' STRESS ', ['B'])]
    expect(validaBozza(b)).toEqual(['C\'è già un fattore che si chiama "Stress".'])
  })
  it('due parametri con lo stesso nome (anche con spazi o maiuscole)', () => {
    const b = conPiante(['1'])
    const doppio = parametro(' altezza ')
    b.parametri.push(doppio)
    b.strumenti[0].parametri.push({ parametro_id: doppio.id, obbligatorio: false, ordine: 1 })
    expect(validaBozza(b)).toEqual([
      'C\'è già un parametro che si chiama "altezza".',
      'C\'è già un parametro che si chiama "Altezza".',
    ])
  })
  it('due strumenti con lo stesso nome (anche con spazi o maiuscole)', () => {
    const b = conPiante(['1'])
    b.strumenti.push({ ...b.strumenti[0], id: crypto.randomUUID(), nome: 'ALTEZZA ', ordine: 1 })
    expect(validaBozza(b)).toEqual([
      'C\'è già uno strumento che si chiama "ALTEZZA".',
      'C\'è già uno strumento che si chiama "Altezza".',
    ])
  })

  it('nuovoParametro: numerico, vuoto, con id nuovo e con l\'ordine dato', () => {
    const p = nuovoParametro(3)
    expect(p).toEqual({
      id: expect.any(String), nome: '', unita: null, tipo: 'numero', ordine: 3, archiviato: false, progressivo: false,
      n_letture: 1, valore_min: null, valore_max: null, sotto_campi: [],
    })
    expect(nuovoParametro(0).id).not.toBe(p.id)
  })
  it('nuovoStrumento: senza nome, icona e parametri, di tipo strumento se non si dice altro', () => {
    expect(nuovoStrumento(1)).toEqual({
      id: expect.any(String), nome: '', icona: null, ordine: 1, tipo: 'strumento', archiviato: false, parametri: [],
    })
    expect(nuovoStrumento(0, 'fenologico')).toMatchObject({ ordine: 0, tipo: 'fenologico', archiviato: false })
  })

  it('clonaConfig genera id nuovi e rimappa i riferimenti', () => {
    const c = configDiEsempio(); const b = clonaConfig(c)
    expect(b.esperimento.nome).toBe(`Copia di ${c.esperimento.nome}`)
    expect(b.esperimento.id).not.toBe(c.esperimento.id)
    const ids = new Set(b.trattamenti.map(t => t.id)); expect(b.piante.every(p => ids.has(p.trattamento_id))).toBe(true)
    const par = new Set(b.parametri.map(p => p.id)); expect(b.strumenti.flatMap(p => p.parametri).every(pp => par.has(pp.parametro_id))).toBe(true)
    expect(b.parametri.some(p => p.archiviato)).toBe(false)   // gli archiviati non si copiano
    expect(validaBozza(b)).toEqual([])
  })
  it('clonaConfig non riusa nessun id e rimappa i livelli dei trattamenti', () => {
    const c = configDiEsempio(); const b = clonaConfig(c)
    const tutti = (x: typeof c) => [
      x.esperimento.id, ...x.fattori.map(f => f.id), ...x.fattori.flatMap(f => f.livelli.map(l => l.id)),
      ...x.trattamenti.map(t => t.id), ...x.piante.map(p => p.id), ...x.parametri.map(p => p.id), ...x.strumenti.map(p => p.id)]
    const vecchi = new Set(tutti(c))
    expect(tutti(b).some(id => vecchi.has(id))).toBe(false)
    const livelli = new Set(b.fattori.flatMap(f => f.livelli.map(l => l.id)))
    expect(b.trattamenti.flatMap(t => t.livello_ids).every(id => livelli.has(id))).toBe(true)
    // stessa struttura: etichette, ordine, nomi
    expect(b.trattamenti.map(t => t.etichetta)).toEqual(c.trattamenti.map(t => t.etichetta))
    expect(b.piante.map(p => p.etichetta)).toEqual(c.piante.map(p => p.etichetta))
    expect(b.strumenti.map(p => p.nome)).toEqual(c.strumenti.map(p => p.nome))
    // il riferimento al parametro archiviato sparisce dallo strumento
    expect(b.strumenti[0].parametri).toHaveLength(1)
  })
  it('clonaConfig non copia gli strumenti archiviati, come i parametri archiviati', () => {
    const c = configDiEsempio()
    c.strumenti = [...c.strumenti, { ...c.strumenti[0], id: 'vecchio', nome: 'Dismesso', ordine: 9, archiviato: true }]
    expect(clonaConfig(c).strumenti.map(p => p.nome)).toEqual(configDiEsempio().strumenti.map(p => p.nome))
  })
  it('pulisciParametro: nome e unità senza spazi ai bordi, unità vuota = nessuna, anche nei sotto-campi', () => {
    const p = parametro(' Palchi ', {
      tipo: 'lista', unita: '  ', sotto_campi: [{ chiave: 'a', nome: ' N foglie ', unita: ' cm ' }, { chiave: 'b', nome: 'X', unita: ' ' }],
    })
    expect(pulisciParametro(p)).toEqual({
      ...p, nome: 'Palchi', unita: null,
      sotto_campi: [{ chiave: 'a', nome: 'N foglie', unita: 'cm' }, { chiave: 'b', nome: 'X', unita: null }],
    })
  })
  it('pulisciBozza: nomi ed etichette senza spazi ai bordi, blocco e icona vuoti = nessuno', () => {
    const b = conPiante([' 1 ', '2'])
    b.esperimento.nome = ' Prova '
    b.esperimento.note = ' note '
    b.fattori = [fattore(' Stress ', [' Controllo ', 'S1'])]
    b.trattamenti[0].etichetta = ' Controllo '
    b.piante[0].blocco = '  '
    b.piante[1].blocco = ' B1 '
    b.parametri[0].nome = ' Altezza '
    b.parametri[0].unita = ' cm '
    b.strumenti[0].nome = ' Altezza '
    b.strumenti[0].icona = ' '
    const originale = structuredClone(b)

    const pulita = pulisciBozza(b)

    expect(pulita.esperimento).toEqual({ ...b.esperimento, nome: 'Prova', note: ' note ' })
    expect(pulita.fattori[0].nome).toBe('Stress')
    expect(pulita.fattori[0].livelli.map(l => l.nome)).toEqual(['Controllo', 'S1'])
    expect(pulita.trattamenti[0].etichetta).toBe('Controllo')
    expect(pulita.piante.map(p => [p.etichetta, p.blocco])).toEqual([['1', null], ['2', 'B1']])
    expect(pulita.parametri[0]).toMatchObject({ nome: 'Altezza', unita: 'cm' })
    expect(pulita.strumenti[0]).toMatchObject({ nome: 'Altezza', icona: null })
    // Gli id restano: un nuovo tentativo di creazione usa lo stesso esperimento.
    expect(pulita.esperimento.id).toBe(b.esperimento.id)
    expect(b).toEqual(originale)
  })
  it('pulisciBozza tiene un\'icona scritta', () => {
    const b = conPiante(['1'])
    b.strumenti[0].icona = ' 🌡 '
    expect(pulisciBozza(b).strumenti[0].icona).toBe('🌡')
  })

  it('clonaConfig non modifica l\'originale', () => {
    const c = configDiEsempio(); const copia = structuredClone(c)
    clonaConfig(c)
    expect(c).toEqual(copia)
  })
})

describe('problemiParametro', () => {
  it('un parametro valido non ha problemi', () => expect(problemiParametro(parametro('Altezza'), [])).toEqual([]))

  it('gli stessi controlli di validaBozza, per un parametro solo', () => {
    expect(problemiParametro(parametro('  '), [])).toEqual(['Un parametro non ha nome.'])
    expect(problemiParametro(parametro('Altezza', { n_letture: 0 }), []))
      .toEqual(['Il parametro "Altezza" deve avere almeno una lettura.'])
    expect(problemiParametro(parametro('Palchi', { tipo: 'lista' }), []))
      .toEqual(['Il parametro "Palchi" deve avere almeno un sotto-campo.'])
    expect(problemiParametro(parametro('T', { valore_min: 5, valore_max: 1 }), []))
      .toEqual(['Il parametro "T" ha il minimo maggiore del massimo.'])
  })

  it('il nome è unico tra gli altri parametri, senza badare a spazi e maiuscole', () => {
    const altezza = parametro('Altezza')
    expect(problemiParametro(parametro(' ALTEZZA '), [altezza]))
      .toEqual(['C\'è già un parametro che si chiama "Altezza".'])
  })

  it('un parametro archiviato con lo stesso nome si può ripristinare', () => {
    const vecchio = parametro('SPAD', { archiviato: true })
    expect(problemiParametro(parametro('spad'), [vecchio]))
      .toEqual(['C\'è già un parametro archiviato che si chiama "SPAD": ripristinalo invece di crearne uno nuovo.'])
  })

  it('il parametro stesso (stesso id) tra gli altri non conta', () => {
    const altezza = parametro('Altezza')
    expect(problemiParametro({ ...altezza, unita: 'cm' }, [altezza])).toEqual([])
  })
})

describe('problemiStrumento', () => {
  const strumento = (nome: string, parametri = 1) => ({
    ...nuovoStrumento(0), nome,
    parametri: Array.from({ length: parametri }, (_, i) => ({ parametro_id: `p${i}`, obbligatorio: false, ordine: i })),
  })

  it('uno strumento valido non ha problemi', () => expect(problemiStrumento(strumento('SPAD'), [])).toEqual([]))
  it('senza nome o senza parametri', () => {
    expect(problemiStrumento(strumento(' '), [])).toEqual(['Uno strumento non ha nome.'])
    expect(problemiStrumento(strumento('SPAD', 0), [])).toEqual(['Lo strumento "SPAD" non ha parametri.'])
  })
  it('il nome è unico tra gli altri strumenti', () => {
    const altra = strumento('Termometro')
    expect(problemiStrumento(strumento('termometro '), [altra])).toEqual(['C\'è già uno strumento che si chiama "Termometro".'])
    expect(problemiStrumento({ ...altra, icona: '🌡' }, [altra])).toEqual([])
  })
  it('con l\'elenco dei parametri attivi contano solo quelli', () => {
    expect(problemiStrumento(strumento('SPAD', 1), [], new Set())).toEqual(['Lo strumento "SPAD" non ha parametri.'])
    expect(problemiStrumento(strumento('SPAD', 1), [], new Set(['p0']))).toEqual([])
  })
})
