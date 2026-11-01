import { describe, expect, it } from 'vitest'
import { creaCsvFoto, nomeFileZip, nomeSicuro, nomiFileZip, riassuntoNota } from './archivioFoto'
import type { Foto, Nota, Pianta, Trattamento } from './tipi'

const foto = (id: string, extra: Partial<Foto> = {}): Foto => ({
  id, data: '2026-10-28', percorso: `E/${id}.jpg`, larghezza: 1600, altezza: 1200, byte: 1000,
  pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null, ...extra,
})
const pianta = (id: string, etichetta: string, trattamento_id = 't1'): Pianta => ({ id, trattamento_id, etichetta, blocco: null, ordine: 0 })
const nota = (id: string, testo: string): Nota => ({ id, data: '2026-10-28', testo, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [] })
const trattamenti: Trattamento[] = [{ id: 't1', etichetta: 'Controllo', ordine: 0, livello_ids: [] }]

describe('nomeSicuro', () => {
  it('lascia lettere e cifre, toglie gli accenti e sostituisce il resto con un trattino', () => {
    expect(nomeSicuro('Prova città: 3/4 "A"')).toBe('Prova-citta-3-4-A')
  })

  it('niente trattini ai bordi né ripetuti, niente caratteri che un file system rifiuta', () => {
    expect(nomeSicuro('  ../..\\x<>:|?*  ')).toBe('x')
  })

  it('accorcia i nomi lunghi', () => {
    expect(nomeSicuro('a'.repeat(100))).toHaveLength(40)
  })

  it('un testo senza caratteri sicuri dà una stringa vuota (chi chiama sceglie il ripiego)', () => {
    expect(nomeSicuro('???')).toBe('')
  })
})

describe('nomeFileZip', () => {
  it('è FastLab_<nome sicuro>_foto_<data>.zip', () => {
    expect(nomeFileZip('Hydrochar / lotto 2', '2026-11-01')).toBe('FastLab_Hydrochar-lotto-2_foto_2026-11-01.zip')
  })

  it('con un nome senza caratteri sicuri ripiega su "esperimento"', () => {
    expect(nomeFileZip('???', '2026-11-01')).toBe('FastLab_esperimento_foto_2026-11-01.zip')
  })
})

describe('nomiFileZip', () => {
  const ID1 = 'aaaaaaaa-0000-4000-8000-000000000001'
  const ID2 = 'bbbbbbbb-0000-4000-8000-000000000002'

  it('è <data>_<pianta, nota o esperimento>_<primi 8 caratteri dell\'id>.jpg', () => {
    const nomi = nomiFileZip(
      [foto(ID1, { pianta_id: 'p35' }), foto(ID2, { nota_id: 'n1' }), foto('cccccccc-0000-4000-8000-000000000003')],
      [pianta('p35', '35')],
    )
    expect(nomi.get(ID1)).toBe('2026-10-28_pianta-35_aaaaaaaa.jpg')
    expect(nomi.get(ID2)).toBe('2026-10-28_nota_bbbbbbbb.jpg')
    expect(nomi.get('cccccccc-0000-4000-8000-000000000003')).toBe('2026-10-28_esperimento_cccccccc.jpg')
  })

  it('l\'etichetta della pianta passa dal filtro dei caratteri sicuri', () => {
    const nomi = nomiFileZip([foto(ID1, { pianta_id: 'p' })], [pianta('p', 'A/12 "bis"')])
    expect(nomi.get(ID1)).toBe('2026-10-28_pianta-A-12-bis_aaaaaaaa.jpg')
  })

  it('i nomi sono tutti diversi anche con gli stessi primi 8 caratteri dell\'id, o che differiscono solo per le maiuscole', () => {
    const elenco = [
      foto('aaaaaaaa-0000-4000-8000-000000000001'), foto('aaaaaaaa-1111-4000-8000-000000000002'),
      foto('AAAAAAAA-2222-4000-8000-000000000003'), foto('aaaaaaaa-3333-4000-8000-000000000004'),
    ]
    const nomi = [...nomiFileZip(elenco, []).values()]
    expect(nomi).toHaveLength(4)
    expect(new Set(nomi.map(n => n.toLowerCase())).size).toBe(4)
    for (const n of nomi) expect(n).toMatch(/^[A-Za-z0-9_.-]+\.jpg$/)
  })

  it('una pianta eliminata o sconosciuta ripiega sulla nota o sull\'esperimento', () => {
    expect(nomiFileZip([foto(ID1, { pianta_id: 'sparita' })], []).get(ID1)).toBe('2026-10-28_esperimento_aaaaaaaa.jpg')
  })
})

describe('riassuntoNota', () => {
  it('toglie gli a capo e accorcia con i puntini', () => {
    expect(riassuntoNota('Foglie\ngialle  sul lato nord')).toBe('Foglie gialle sul lato nord')
    const lunga = riassuntoNota('x'.repeat(200))
    expect(lunga).toHaveLength(80)
    expect(lunga.endsWith('…')).toBe(true)
  })
})

describe('creaCsvFoto', () => {
  const BOM = '﻿'
  const contesto = { piante: [pianta('p1', '35')], trattamenti, note: [nota('n1', 'Foglie "gialle"; da rivedere\ne basta')] }

  it('comincia con il BOM UTF-8, separa con il punto e virgola e chiude le righe con CRLF', () => {
    const csv = creaCsvFoto([foto('a', { pianta_id: 'p1' })], new Map([['a', 'x.jpg']]), contesto)
    expect(csv.startsWith(BOM)).toBe(true)
    const righe = csv.slice(1).split('\r\n')
    expect(righe[0]).toBe('data;pianta;trattamento;nota;nome del file;archiviata')
    expect(righe[1]).toBe('2026-10-28;35;Controllo;;x.jpg;')
  })

  it('i campi con virgolette, punto e virgola o a capo stanno tra virgolette, con le virgolette raddoppiate', () => {
    const csv = creaCsvFoto([foto('a', { nota_id: 'n1' })], new Map([['a', 'x.jpg']]), contesto)
    // L'a capo della nota diventa uno spazio (riassunto): restano virgolette e punto e virgola.
    expect(csv).toContain('"Foglie ""gialle""; da rivedere e basta"')
    // Il CSV si rilegge senza spezzarsi: 6 campi nella riga della foto.
    expect(csv.slice(1).split('\r\n')[1]).toBe('2026-10-28;;;"Foglie ""gialle""; da rivedere e basta";x.jpg;')
  })

  it('un campo che comincia con = + - @ non diventa una formula in Excel', () => {
    const csv = creaCsvFoto([foto('a', { nota_id: 'n2' })], new Map([['a', 'x.jpg']]), { ...contesto, note: [nota('n2', '=SOMMA(A1:A2)')] })
    expect(csv).toContain(";'=SOMMA(A1:A2);x.jpg;")
  })

  it('una foto archiviata compare nel CSV, segnata, senza nome del file', () => {
    const csv = creaCsvFoto(
      [foto('a'), foto('b', { archiviata: true, archiviata_il: '2026-11-03T12:00:00Z' })],
      new Map([['a', 'x.jpg']]), contesto,
    )
    const righe = csv.slice(1).split('\r\n')
    expect(righe[1]).toBe('2026-10-28;;;;x.jpg;')
    expect(righe[2]).toBe('2026-10-28;;;;;sì')
  })

  it('una foto non archiviata il cui file non c\'è più è segnata «file assente», senza nome del file', () => {
    const csv = creaCsvFoto([foto('a'), foto('b')], new Map([['a', 'x.jpg']]), contesto)
    const righe = csv.slice(1).split('\r\n')
    expect(righe[1]).toBe('2026-10-28;;;;x.jpg;')
    expect(righe[2]).toBe('2026-10-28;;;;;file assente')
  })

  it('nel CSV ci sono tutte le foto date, nell\'ordine in cui arrivano', () => {
    const csv = creaCsvFoto([foto('a', { data: '2026-10-01' }), foto('b', { data: '2026-10-05' })], new Map(), contesto)
    expect(csv.slice(1).split('\r\n').slice(1).map(r => r.slice(0, 10))).toEqual(['2026-10-01', '2026-10-05'])
  })
})
