import { describe, expect, it } from 'vitest'
import { oggiLocale } from '@/lib/date'
import type { Nota, Pianta, Trattamento } from './tipi'
import {
  descriviCollegamento, ePromemoriaAlSalvataggio, noteDellaPianta, promemoriaDelGiorno, reinserisciNota, senzaNota,
} from './note'

/** Solo ciò che serve a `descriviCollegamento`: i trattamenti e le piante. */
const config = (trattamenti: Trattamento[], piante: Pianta[]) => ({ trattamenti, piante })

const nota = (id: string, extra: Partial<Nota> = {}): Nota => ({
  id, data: '2026-11-01', testo: `nota ${id}`, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...extra,
})

describe('ePromemoriaAlSalvataggio', () => {
  it('è un promemoria solo con una data dopo oggi', () => {
    expect(ePromemoriaAlSalvataggio('2026-11-02', '2026-11-01')).toBe(true)
    expect(ePromemoriaAlSalvataggio('2027-01-01', '2026-11-01')).toBe(true)
    expect(ePromemoriaAlSalvataggio('2026-11-01', '2026-11-01')).toBe(false)
    expect(ePromemoriaAlSalvataggio('2026-10-31', '2026-11-01')).toBe(false)
  })

  it('confronta le date locali: a mezzanotte il giorno cambia', () => {
    const data = '2026-11-02'
    expect(ePromemoriaAlSalvataggio(data, oggiLocale(new Date(2026, 10, 1, 23, 59, 59)))).toBe(true)
    expect(ePromemoriaAlSalvataggio(data, oggiLocale(new Date(2026, 10, 2, 0, 0, 0)))).toBe(false)
  })

  it('confronta anche a cavallo di mese e di anno', () => {
    expect(ePromemoriaAlSalvataggio('2027-01-01', '2026-12-31')).toBe(true)
    expect(ePromemoriaAlSalvataggio('2026-12-01', '2026-11-30')).toBe(true)
    expect(ePromemoriaAlSalvataggio('2026-11-30', '2026-12-01')).toBe(false)
  })
})

describe('promemoriaDelGiorno', () => {
  const note = [
    nota('a', { promemoria: true, data: '2026-11-01' }),
    nota('b', { promemoria: true, data: '2026-10-20' }),
    nota('c', { promemoria: true, data: '2026-11-02' }),
    nota('d', { promemoria: true, data: '2026-11-01', fatto_il: '2026-11-01T09:00:00Z' }),
    nota('e', { promemoria: false, data: '2026-11-01' }),
  ]

  it('prende i promemoria con data di oggi o passata, non ancora fatti', () => {
    expect(promemoriaDelGiorno(note, '2026-11-01').map(n => n.id)).toEqual(['b', 'a'])
  })

  it('un promemoria arrivato a scadenza compare, uno futuro no', () => {
    expect(promemoriaDelGiorno(note, '2026-10-31').map(n => n.id)).toEqual(['b'])
    expect(promemoriaDelGiorno(note, '2026-11-02').map(n => n.id)).toEqual(['b', 'a', 'c'])
  })

  it('a mezzanotte il promemoria del giorno dopo compare', () => {
    const domani = [nota('x', { promemoria: true, data: '2026-11-02' })]
    expect(promemoriaDelGiorno(domani, oggiLocale(new Date(2026, 10, 1, 23, 59)))).toEqual([])
    expect(promemoriaDelGiorno(domani, oggiLocale(new Date(2026, 10, 2, 0, 0)))).toHaveLength(1)
  })

  it('i più vecchi per primi, a parità di data resta l\'ordine di ingresso, e non tocca l\'elenco dato', () => {
    const lista = [
      nota('p', { promemoria: true, data: '2026-11-01' }),
      nota('q', { promemoria: true, data: '2026-11-01' }),
      nota('r', { promemoria: true, data: '2026-10-01' }),
    ]
    expect(promemoriaDelGiorno(lista, '2026-11-01').map(n => n.id)).toEqual(['r', 'p', 'q'])
    expect(lista.map(n => n.id)).toEqual(['p', 'q', 'r'])
  })

  it('un fatto_il vuoto non conta come fatto', () => {
    expect(promemoriaDelGiorno([nota('v', { promemoria: true, fatto_il: '' })], '2026-11-01')).toHaveLength(1)
  })

  it('un promemoria fatto e poi tolto dai promemoria non compare', () => {
    expect(promemoriaDelGiorno([nota('z', { promemoria: false, fatto_il: '2026-11-01T09:00:00Z' })], '2026-11-01')).toEqual([])
  })
})

describe('noteDellaPianta', () => {
  const cfg = config([
    { id: 't1', etichetta: 'S1 + HC', ordine: 0, livello_ids: [] },
    { id: 't2', etichetta: 'W1', ordine: 1, livello_ids: [] },
  ], [
    { id: 'p1', trattamento_id: 't1', etichetta: '1', blocco: null, ordine: 0 },
    { id: 'p2', trattamento_id: 't1', etichetta: '2', blocco: null, ordine: 1 },
    { id: 'p3', trattamento_id: 't2', etichetta: '3', blocco: null, ordine: 2 },
  ])
  const [p1, p2, p3] = cfg.piante

  const note = [
    nota('tutto'),
    nota('p1', { pianta_ids: ['p1'] }),
    nota('p1p3', { pianta_ids: ['p1', 'p3'] }),
    nota('t1', { trattamento_ids: ['t1'] }),
    nota('t2', { trattamento_ids: ['t2'] }),
  ]

  it('prende le note a tutto l\'esperimento, alla pianta e al suo trattamento', () => {
    expect(noteDellaPianta(note, p1).map(n => n.id)).toEqual(['tutto', 'p1', 'p1p3', 't1'])
    expect(noteDellaPianta(note, p2).map(n => n.id)).toEqual(['tutto', 't1'])
    expect(noteDellaPianta(note, p3).map(n => n.id)).toEqual(['tutto', 'p1p3', 't2'])
  })

  it('mantiene l\'ordine dell\'elenco', () => {
    expect(noteDellaPianta([...note].reverse(), p1).map(n => n.id)).toEqual(['t1', 'p1p3', 'p1', 'tutto'])
  })
})

describe('descriviCollegamento', () => {
  const cfg = config([
    { id: 't1', etichetta: 'S1 + HC', ordine: 0, livello_ids: [] },
    { id: 't2', etichetta: 'W1', ordine: 1, livello_ids: [] },
  ], [
    { id: 'p3', trattamento_id: 't1', etichetta: '3', blocco: null, ordine: 2 },
    { id: 'p12', trattamento_id: 't2', etichetta: '12', blocco: null, ordine: 11 },
    { id: 'p5', trattamento_id: 't2', etichetta: '5', blocco: null, ordine: 4 },
  ])

  it('senza collegamenti riguarda tutto l\'esperimento', () => {
    expect(descriviCollegamento(nota('a'), cfg)).toBe('Tutto l\'esperimento')
  })

  it('elenca i trattamenti con le loro etichette, nell\'ordine della configurazione', () => {
    expect(descriviCollegamento(nota('a', { trattamento_ids: ['t2', 't1'] }), cfg)).toBe('S1 + HC, W1')
    expect(descriviCollegamento(nota('a', { trattamento_ids: ['t2'] }), cfg)).toBe('W1')
  })

  it('elenca le piante con "Pianta" o "Piante", nell\'ordine della configurazione', () => {
    expect(descriviCollegamento(nota('a', { pianta_ids: ['p12', 'p3'] }), cfg)).toBe('Piante 3, 12')
    expect(descriviCollegamento(nota('a', { pianta_ids: ['p5'] }), cfg)).toBe('Pianta 5')
  })

  it('se i collegamenti non si trovano nella configurazione, li conta', () => {
    expect(descriviCollegamento(nota('a', { pianta_ids: ['x', 'y'] }), cfg)).toBe('2 piante')
    expect(descriviCollegamento(nota('a', { pianta_ids: ['x'] }), cfg)).toBe('1 pianta')
    expect(descriviCollegamento(nota('a', { trattamento_ids: ['x'] }), cfg)).toBe('1 trattamento')
    expect(descriviCollegamento(nota('a', { trattamento_ids: ['x', 'y', 'z'] }), cfg)).toBe('3 trattamenti')
  })

  it('ignora i collegamenti sconosciuti se ce ne sono di noti', () => {
    expect(descriviCollegamento(nota('a', { pianta_ids: ['p3', 'x'] }), cfg)).toBe('Pianta 3')
  })

  it('se ci fossero entrambi (non dovrebbe) li mostra tutti e due', () => {
    expect(descriviCollegamento(nota('a', { trattamento_ids: ['t1'], pianta_ids: ['p3'] }), cfg)).toBe('S1 + HC · Pianta 3')
  })
})

describe('senzaNota e reinserisciNota', () => {
  const elenco = [nota('a'), nota('b'), nota('c')]

  it('senzaNota toglie solo quella nota e lascia l\'ordine delle altre', () => {
    expect(senzaNota(elenco, 'b').map(n => n.id)).toEqual(['a', 'c'])
    expect(senzaNota(elenco, 'x').map(n => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('reinserisciNota rimette la nota dov\'era', () => {
    const b = elenco[1]
    expect(reinserisciNota(senzaNota(elenco, 'b'), b, 1).map(n => n.id)).toEqual(['a', 'b', 'c'])
    expect(reinserisciNota(senzaNota(elenco, 'a'), elenco[0], 0).map(n => n.id)).toEqual(['a', 'b', 'c'])
    expect(reinserisciNota(senzaNota(elenco, 'c'), elenco[2], 2).map(n => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('se nel frattempo l\'elenco è cambiato, l\'indice si contiene nei limiti', () => {
    expect(reinserisciNota([nota('a')], nota('z'), 5).map(n => n.id)).toEqual(['a', 'z'])
    expect(reinserisciNota([], nota('z'), 0).map(n => n.id)).toEqual(['z'])
  })

  it('senza indice (la nota non c\'era nella copia) va in cima; mai due volte la stessa nota', () => {
    expect(reinserisciNota(elenco, nota('z'), -1).map(n => n.id)).toEqual(['z', 'a', 'b', 'c'])
    expect(reinserisciNota(elenco, elenco[1], 1).map(n => n.id)).toEqual(['a', 'b', 'c'])
  })
})
