import { describe, it, expect } from 'vitest'
import { statoPianta, statiPiante, prossimaDaMisurare, riepilogoGiro, progressoOggi, type StatoPianta } from './giro'
import type { Misura, Parametro, Pianta, Strumento, ValoriMisura } from './tipi'
import { parametro, piante as creaPiante } from './test-helpers'

const D = '2026-10-29'

const A = parametro('A', { n_letture: 3 })
const gs = parametro('gs')
const E = parametro('E')
const Ci = parametro('Ci')
const vecchio = parametro('Vecchio', { archiviato: true })
const note = parametro('Note', { tipo: 'testo' })
const palchi = parametro('Palchi', { tipo: 'lista' })
const stadio = parametro('Stadio')
const tutti: Parametro[] = [A, gs, E, Ci, vecchio, note, palchi, stadio]

function strumento(nome: string, ps: [Parametro, boolean][], extra: Partial<Strumento> = {}): Strumento {
  return {
    id: `S-${nome}`, nome, icona: null, ordine: 0, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: ps.map(([p, obbligatorio], ordine) => ({ parametro_id: p.id, obbligatorio, ordine })),
    ...extra,
  }
}
const ciras = strumento('Ciras', [[A, false], [gs, false], [E, false], [Ci, false]])
const spad = strumento('SPAD', [[stadio, true]])

let n = 0
function mis(pianta: string, s: Strumento, valori: ValoriMisura, extra: Partial<Misura> = {}): Misura {
  n += 1
  return { id: `m${n}`, pianta_id: pianta, strumento_id: s.id, data_rilievo: D, ora: '09:00', valori, ...extra }
}
const etichette = (ps: Pianta[]) => ps.map(p => p.etichetta)

describe('statoPianta', () => {
  it('nessuna misura: da fare', () => {
    expect(statoPianta(ciras, tutti, [], 'P1')).toBe('da_fare')
  })

  it('Ciras con A e gs ma senza E e Ci: incompleta', () => {
    const m = mis('P1', ciras, { [A.id]: [1, 2, 3], [gs.id]: [0.3] })
    expect(statoPianta(ciras, tutti, [m], 'P1')).toBe('incompleta')
  })

  it('due misure dello stesso giorno che insieme coprono tutto: fatta', () => {
    const m1 = mis('P1', ciras, { [A.id]: [1, 2, 3], [gs.id]: [0.3] }, { ora: '09:00' })
    const m2 = mis('P1', ciras, { [E.id]: [4], [Ci.id]: [5] }, { ora: '09:30' })
    expect(statoPianta(ciras, tutti, [m1, m2], 'P1')).toBe('fatta')
  })

  it('un parametro archiviato non conta', () => {
    const conVecchio = strumento('Ciras', [[A, false], [vecchio, false]])
    const m = mis('P1', conVecchio, { [A.id]: [1, 2, 3] })
    expect(statoPianta(conVecchio, tutti, [m], 'P1')).toBe('fatta')
    // e un valore solo del parametro archiviato non basta per dire che la pianta è stata misurata
    const soloVecchio = mis('P2', conVecchio, { [vecchio.id]: [9] })
    expect(statoPianta(conVecchio, tutti, [soloVecchio], 'P2')).toBe('da_fare')
  })

  it('un parametro collegato che non esiste più tra i parametri non conta', () => {
    const m = mis('P1', ciras, { [A.id]: [1], [gs.id]: [1], [E.id]: [1], [Ci.id]: [1] })
    expect(statoPianta(ciras, [A, gs, E, Ci], [m], 'P1')).toBe('fatta')
    expect(statoPianta(ciras, [A, gs, E], [m], 'P1')).toBe('fatta')
  })

  it('le misure di un altro strumento o di un\'altra pianta non contano', () => {
    const altroStrumento = mis('P1', spad, { [A.id]: [1], [gs.id]: [1], [E.id]: [1], [Ci.id]: [1] })
    const altraPianta = mis('P2', ciras, { [A.id]: [1], [gs.id]: [1], [E.id]: [1], [Ci.id]: [1] })
    expect(statoPianta(ciras, tutti, [altroStrumento, altraPianta], 'P1')).toBe('da_fare')
  })

  it('un valore vuoto (lettura nulla, testo bianco, lista senza elementi) non conta', () => {
    const solo = strumento('Misto', [[A, false], [note, false], [palchi, false]])
    const vuote = mis('P1', solo, { [A.id]: [null, null, null], [note.id]: '', [palchi.id]: [] })
    expect(statoPianta(solo, tutti, [vuote], 'P1')).toBe('da_fare')
    const unaLettura = mis('P1', solo, { [A.id]: [null, 2, null], [note.id]: '  ', [palchi.id]: [] })
    expect(statoPianta(solo, tutti, [unaLettura], 'P1')).toBe('incompleta')
  })

  it('uno strumento senza parametri attivi: fatta con almeno una misura, altrimenti da fare', () => {
    const senza = strumento('Vuoto', [[vecchio, false]])
    expect(statoPianta(senza, tutti, [], 'P1')).toBe('da_fare')
    expect(statoPianta(senza, tutti, [mis('P1', senza, {})], 'P1')).toBe('fatta')
    expect(statoPianta(senza, tutti, [mis('P2', senza, {})], 'P1')).toBe('da_fare')
  })

  describe('tabella fenologica', () => {
    const feno = (ps: [Parametro, boolean][]) => strumento('Fenologici', ps, { tipo: 'fenologico' })

    it('senza obbligatori, con solo le Note scritte: fatta', () => {
      const f = feno([[note, false], [palchi, false]])
      const m = mis('P1', f, { [note.id]: 'tutto ok', [palchi.id]: [] })
      expect(statoPianta(f, tutti, [m], 'P1')).toBe('fatta')
    })

    it('senza obbligatori e senza nessun valore: da fare', () => {
      const f = feno([[note, false], [palchi, false]])
      expect(statoPianta(f, tutti, [], 'P1')).toBe('da_fare')
      expect(statoPianta(f, tutti, [mis('P1', f, { [note.id]: '', [palchi.id]: [] })], 'P1')).toBe('da_fare')
    })

    it('con un obbligatorio vuoto: incompleta, anche se una voce facoltativa è scritta', () => {
      const f = feno([[stadio, true], [note, false]])
      const m = mis('P1', f, { [stadio.id]: [null], [note.id]: 'qualcosa' })
      expect(statoPianta(f, tutti, [m], 'P1')).toBe('incompleta')
    })

    it('con tutti gli obbligatori: fatta, anche se le facoltative sono vuote', () => {
      const f = feno([[stadio, true], [note, false], [palchi, false]])
      const m = mis('P1', f, { [stadio.id]: [3], [note.id]: '', [palchi.id]: [] })
      expect(statoPianta(f, tutti, [m], 'P1')).toBe('fatta')
    })

    it('con gli obbligatori su più misure: fatta', () => {
      const f = feno([[stadio, true], [A, true]])
      const m1 = mis('P1', f, { [stadio.id]: [3] })
      const m2 = mis('P1', f, { [A.id]: [1, 1, 1] })
      expect(statoPianta(f, tutti, [m1, m2], 'P1')).toBe('fatta')
    })

    it('un obbligatorio archiviato non conta', () => {
      const f = feno([[stadio, true], [vecchio, true]])
      const m = mis('P1', f, { [stadio.id]: [3] })
      expect(statoPianta(f, tutti, [m], 'P1')).toBe('fatta')
    })
  })
})

describe('statiPiante', () => {
  it('una voce per pianta, con il suo stato', () => {
    const ps = creaPiante(['1', '2', '3'])
    const completa = { [A.id]: [1], [gs.id]: [1], [E.id]: [1], [Ci.id]: [1] }
    const stati = statiPiante(ciras, tutti, [
      mis(ps[0].id, ciras, completa),
      mis(ps[1].id, ciras, { [A.id]: [1] }),
    ], ps)
    expect(stati.size).toBe(3)
    expect(stati.get(ps[0].id)).toBe('fatta')
    expect(stati.get(ps[1].id)).toBe('incompleta')
    expect(stati.get(ps[2].id)).toBe('da_fare')
  })
})

describe('prossimaDaMisurare', () => {
  const ps = creaPiante(['1', '2', '3', '4'])
  const stati = (s: StatoPianta[]) => new Map(ps.map((p, i) => [p.id, s[i]]))

  it('senza "dopo" parte dall\'inizio e salta le fatte', () => {
    expect(prossimaDaMisurare(ps, stati(['fatta', 'fatta', 'da_fare', 'da_fare']), null)?.etichetta).toBe('3')
  })
  it('include le incomplete', () => {
    expect(prossimaDaMisurare(ps, stati(['fatta', 'incompleta', 'fatta', 'fatta']), null)?.etichetta).toBe('2')
  })
  it('esclude la pianta "dopo" anche se non è fatta', () => {
    expect(prossimaDaMisurare(ps, stati(['da_fare', 'da_fare', 'da_fare', 'da_fare']), ps[0].id)?.etichetta).toBe('2')
  })
  it('salta le fatte dopo "dopo"', () => {
    expect(prossimaDaMisurare(ps, stati(['da_fare', 'fatta', 'fatta', 'da_fare']), ps[0].id)?.etichetta).toBe('4')
  })
  it('dopo l\'ultima pianta: null, senza ricominciare dall\'inizio', () => {
    expect(prossimaDaMisurare(ps, stati(['da_fare', 'da_fare', 'da_fare', 'da_fare']), ps[3].id)).toBeNull()
  })
  it('nessuna pianta da fare: null', () => {
    expect(prossimaDaMisurare(ps, stati(['fatta', 'fatta', 'fatta', 'fatta']), null)).toBeNull()
  })
  it('una pianta assente dagli stati vale da fare', () => {
    expect(prossimaDaMisurare(ps, new Map(), null)?.etichetta).toBe('1')
    expect(prossimaDaMisurare(ps, new Map([[ps[0].id, 'fatta']]), null)?.etichetta).toBe('2')
  })
  it('un "dopo" sconosciuto riparte dall\'inizio', () => {
    expect(prossimaDaMisurare(ps, stati(['da_fare', 'da_fare', 'da_fare', 'da_fare']), 'nessuna')?.etichetta).toBe('1')
  })
  it('ordina per ordine, poi per etichetta, qualunque sia l\'ordine dell\'array', () => {
    const disordinate: Pianta[] = [
      { ...ps[0], id: 'x3', etichetta: '3', ordine: 2 },
      { ...ps[0], id: 'x2b', etichetta: 'b', ordine: 1 },
      { ...ps[0], id: 'x1', etichetta: '1', ordine: 0 },
      { ...ps[0], id: 'x2a', etichetta: 'a', ordine: 1 },
    ]
    expect(prossimaDaMisurare(disordinate, new Map(), null)?.etichetta).toBe('1')
    expect(prossimaDaMisurare(disordinate, new Map(), 'x1')?.etichetta).toBe('a')
    expect(prossimaDaMisurare(disordinate, new Map(), 'x2a')?.etichetta).toBe('b')
    expect(prossimaDaMisurare(disordinate, new Map(), 'x2b')?.etichetta).toBe('3')
  })
  it('non modifica l\'array ricevuto', () => {
    const copia = [...ps].reverse()
    const prima = copia.map(p => p.id)
    prossimaDaMisurare(copia, new Map(), null)
    expect(copia.map(p => p.id)).toEqual(prima)
  })
})

describe('riepilogoGiro', () => {
  it('56 piante, 54 fatte e una incompleta: mancano la 12 e la 33', () => {
    const ps = creaPiante(Array.from({ length: 56 }, (_, i) => String(i + 1)))
    const stati = new Map<string, StatoPianta>(ps.map(p => [p.id, 'fatta']))
    stati.set(ps[11].id, 'da_fare')
    stati.set(ps[32].id, 'incompleta')
    const r = riepilogoGiro(ps, stati)
    expect(r.fatte).toBe(54)
    expect(r.totale).toBe(56)
    expect(etichette(r.mancanti)).toEqual(['12', '33'])
    expect(etichette(r.incomplete)).toEqual(['33'])
  })
  it('una pianta assente dagli stati è da fare', () => {
    const ps = creaPiante(['1', '2'])
    const r = riepilogoGiro(ps, new Map([[ps[0].id, 'fatta']]))
    expect(r).toMatchObject({ fatte: 1, totale: 2 })
    expect(etichette(r.mancanti)).toEqual(['2'])
    expect(r.incomplete).toEqual([])
  })
})

describe('progressoOggi', () => {
  it('per ogni strumento non archiviato: piante fatte su totale, ignorando le incomplete', () => {
    const ps = creaPiante(['1', '2', '3'])
    const archiviato = strumento('Vecchio', [[A, false]], { archiviato: true })
    const completa = { [A.id]: [1], [gs.id]: [1], [E.id]: [1], [Ci.id]: [1] }
    const misure = [
      mis(ps[0].id, ciras, completa),
      mis(ps[1].id, ciras, { [A.id]: [1] }),
      mis(ps[0].id, spad, { [stadio.id]: [2] }),
      mis(ps[1].id, spad, { [stadio.id]: [2] }),
    ]
    const r = progressoOggi([ciras, spad, archiviato], tutti, misure, ps)
    expect([...r.keys()]).toEqual([ciras.id, spad.id])
    expect(r.get(ciras.id)).toEqual({ fatte: 1, totale: 3 })
    expect(r.get(spad.id)).toEqual({ fatte: 2, totale: 3 })
  })
  it('senza misure: zero fatte', () => {
    const ps = creaPiante(['1', '2'])
    expect(progressoOggi([ciras], tutti, [], ps).get(ciras.id)).toEqual({ fatte: 0, totale: 2 })
  })
})
