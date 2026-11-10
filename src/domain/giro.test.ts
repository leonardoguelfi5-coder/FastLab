import { describe, it, expect } from 'vitest'
import { statoPianta, statiPiante, prossimaDaMisurare, riepilogoGiro, progressoOggi, righeStrumenti, celleGriglia, valoriDiOggi, ordinaPiante, completamentoDiretto, type StatoPianta, type OrdineGiro } from './giro'
import type { ConfigEsperimento, Misura, Parametro, Pianta, Strumento, ValoriMisura } from './tipi'
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

describe('righeStrumenti', () => {
  const ps = creaPiante(['1', '2', '3'])
  const archiviato = strumento('Vecchio', [[A, false]], { archiviato: true })
  const config = {
    strumenti: [{ ...spad, ordine: 2 }, archiviato, { ...ciras, ordine: 1 }],
    parametri: tutti,
    piante: ps,
  } as unknown as ConfigEsperimento

  it('senza misure arrivate: gli strumenti non archiviati in ordine, senza giro, con la prima pianta', () => {
    const righe = righeStrumenti(config, undefined)
    expect(righe.map(r => r.strumento.nome)).toEqual(['Ciras', 'SPAD'])
    expect(righe.map(r => r.giro)).toEqual([null, null])
    expect(righe.map(r => r.prossima?.etichetta)).toEqual(['1', '1'])
  })

  it('con le misure: fatte su totale, giro cominciato e prossima pianta', () => {
    const completa = { [A.id]: [1], [gs.id]: [1], [E.id]: [1], [Ci.id]: [1] }
    const righe = righeStrumenti(config, [mis(ps[0].id, ciras, completa), mis(ps[1].id, ciras, { [A.id]: [1] })])
    expect(righe[0].giro).toEqual({ fatte: 1, totale: 3, cominciato: true })
    expect(righe[0].prossima?.etichetta).toBe('2')
    expect(righe[1].giro).toEqual({ fatte: 0, totale: 3, cominciato: false })
    expect(righe[1].prossima?.etichetta).toBe('1')
  })

  it('giro finito: nessuna prossima pianta', () => {
    const righe = righeStrumenti(config, ps.map(p => mis(p.id, spad, { [stadio.id]: [2] })))
    expect(righe[1].giro).toEqual({ fatte: 3, totale: 3, cominciato: true })
    expect(righe[1].prossima).toBeNull()
  })
})

describe('celleGriglia', () => {
  const ps = creaPiante(['1', '2', '10'])
  // L'ordine del giro è quello di `ordine`, non quello dell'array.
  const rimescolate = [ps[2], ps[0], ps[1]]

  it('una cella per pianta nell\'ordine del giro, con lo stato (da fare se manca) e la pianta attuale', () => {
    const stati = new Map<string, StatoPianta>([[ps[0].id, 'fatta'], [ps[1].id, 'incompleta']])
    const celle = celleGriglia(rimescolate, stati, ps[1].id)
    expect(celle.map(c => c.pianta.etichetta)).toEqual(['1', '2', '10'])
    expect(celle.map(c => c.stato)).toEqual(['fatta', 'incompleta', 'da_fare'])
    expect(celle.map(c => c.attuale)).toEqual([false, true, false])
  })

  it('senza pianta attuale nessuna cella lo è', () => {
    expect(celleGriglia(ps, new Map(), null).some(c => c.attuale)).toBe(false)
  })
})

describe('valoriDiOggi', () => {
  const trattW1 = { id: 't1', etichetta: 'W1', ordine: 0, livello_ids: [] }
  const trattW2 = { id: 't2', etichetta: 'W2', ordine: 1, livello_ids: [] }
  const ps = [
    ...creaPiante(['1', '2', '3'], 't1'),
    ...creaPiante(['4', '5'], 't2'),
  ]
  const spadN = parametro('SPAD')
  const lista = parametro('Palchi', { tipo: 'lista' })
  const spadStr = strumento('SPAD', [[spadN, false], [lista, false], [vecchio, false]])
  const config = {
    strumenti: [spadStr], parametri: [spadN, lista, vecchio], piante: ps, trattamenti: [trattW1, trattW2],
  } as unknown as ConfigEsperimento

  it('media, ES e n per trattamento, solo per i parametri numerici attivi dello strumento', () => {
    const misure = [
      mis(ps[0].id, spadStr, { [spadN.id]: [40] }),
      mis(ps[1].id, spadStr, { [spadN.id]: [42] }),
      mis(ps[2].id, spadStr, { [spadN.id]: [44] }),
      mis(ps[3].id, spadStr, { [spadN.id]: [30] }),
    ]
    const r = valoriDiOggi(config, spadStr, misure, D)
    expect(r).toHaveLength(1)
    expect(r[0].parametro.nome).toBe('SPAD')
    expect(r[0].righe.map(x => x.trattamento.etichetta)).toEqual(['W1', 'W2'])
    expect(r[0].righe[0]).toMatchObject({ media: 42, n: 3 })
    expect(r[0].righe[0].es).toBeCloseTo(2 / Math.sqrt(3), 10)
    expect(r[0].righe[1]).toMatchObject({ media: 30, es: null, n: 1 })
  })

  it('conta solo la data, lo strumento e i trattamenti con almeno un valore', () => {
    const altro = strumento('Altro', [[spadN, false]])
    const misure = [
      mis(ps[0].id, spadStr, { [spadN.id]: [40] }),
      mis(ps[1].id, spadStr, { [spadN.id]: [90] }, { data_rilievo: '2026-10-28' }),
      mis(ps[2].id, altro, { [spadN.id]: [99] }),
    ]
    const r = valoriDiOggi(config, spadStr, misure, D)
    expect(r[0].righe.map(x => [x.trattamento.etichetta, x.media, x.n])).toEqual([['W1', 40, 1]])
  })

  it('senza misure: nessuna riga per il parametro', () => {
    expect(valoriDiOggi(config, spadStr, [], D)).toEqual([{ parametro: spadN, righe: [] }])
  })
})

describe('ordinaPiante', () => {
  const con = (etichetta: string, ordine: number, blocco: string | null = null): Pianta => ({
    id: `P${etichetta}`, trattamento_id: 't1', etichetta, blocco, ordine,
  })
  const lista = [con('10', 0, 'B2'), con('2', 1, 'B1'), con('1', 2, 'B2'), con('W3', 3, 'B1')]

  it('come nelle impostazioni: per ordine, con l\'etichetta come spareggio', () => {
    expect(etichette(ordinaPiante(lista, { criterio: 'impostazioni', inverso: false }))).toEqual(['10', '2', '1', 'W3'])
  })
  it('per etichetta: ordine naturale, 2 prima di 10', () => {
    expect(etichette(ordinaPiante(lista, { criterio: 'etichetta', inverso: false }))).toEqual(['1', '2', '10', 'W3'])
  })
  it('per blocco: il blocco, poi l\'ordine', () => {
    expect(etichette(ordinaPiante(lista, { criterio: 'blocco', inverso: false }))).toEqual(['2', 'W3', '10', '1'])
  })
  it('le piante senza blocco vengono dopo quelle con un blocco', () => {
    const l = [con('1', 0, null), con('2', 1, 'A')]
    expect(etichette(ordinaPiante(l, { criterio: 'blocco', inverso: false }))).toEqual(['2', '1'])
  })
  it('al contrario rovescia l\'ordine scelto', () => {
    expect(etichette(ordinaPiante(lista, { criterio: 'etichetta', inverso: true }))).toEqual(['W3', '10', '2', '1'])
    expect(etichette(ordinaPiante(lista, { criterio: 'impostazioni', inverso: true }))).toEqual(['W3', '1', '2', '10'])
  })
  it('non modifica la lista ricevuta', () => {
    const copia = [...lista]
    ordinaPiante(lista, { criterio: 'etichetta', inverso: true })
    expect(lista).toEqual(copia)
  })
})

describe('il giro con l\'ordine scelto', () => {
  const ps: Pianta[] = ['1', '2', '10'].map((e, i) => ({ id: `P${e}`, trattamento_id: 't1', etichetta: e, blocco: null, ordine: 2 - i }))
  const ordine: OrdineGiro = { criterio: 'etichetta', inverso: false }
  const stati = new Map<string, StatoPianta>([['P1', 'fatta']])

  it('prossimaDaMisurare segue l\'ordine e salta le fatte', () => {
    expect(prossimaDaMisurare(ps, stati, null, ordine)?.etichetta).toBe('2')
    expect(prossimaDaMisurare(ps, stati, 'P2', ordine)?.etichetta).toBe('10')
    expect(prossimaDaMisurare(ps, stati, 'P10', ordine)).toBeNull()
  })
  it('al contrario si parte dall\'ultima', () => {
    expect(prossimaDaMisurare(ps, new Map(), null, { criterio: 'etichetta', inverso: true })?.etichetta).toBe('10')
    expect(prossimaDaMisurare(ps, new Map(), 'P10', { criterio: 'etichetta', inverso: true })?.etichetta).toBe('2')
  })
  it('senza ordine vale quello delle impostazioni (come prima)', () => {
    expect(prossimaDaMisurare(ps, new Map(), null)?.etichetta).toBe('10')
  })
  it('riepilogoGiro elenca le mancanti nell\'ordine scelto', () => {
    expect(etichette(riepilogoGiro(ps, stati, ordine).mancanti)).toEqual(['2', '10'])
  })
  it('celleGriglia segue l\'ordine scelto', () => {
    expect(celleGriglia(ps, stati, 'P2', ordine).map(c => c.pianta.etichetta)).toEqual(['1', '2', '10'])
  })
  it('righeStrumenti sceglie la prima pianta secondo l\'ordine', () => {
    const config = { piante: ps, strumenti: [spad], parametri: tutti, trattamenti: [] } as unknown as ConfigEsperimento
    expect(righeStrumenti(config, [], ordine)[0].prossima?.etichetta).toBe('1')
    expect(righeStrumenti(config, [])[0].prossima?.etichetta).toBe('10')
  })
})

describe('completamentoDiretto', () => {
  const p = creaPiante(['7'])[0]
  it('incompleta con una sola misura nel giorno: quella misura', () => {
    const m = mis(p.id, ciras, { [A.id]: [1, 2, 3], [gs.id]: [0.1] })
    expect(completamentoDiretto(ciras, tutti, [m], p.id)).toBe(m)
  })
  it('con due misure: nessuna (si chiede)', () => {
    const m1 = mis(p.id, ciras, { [A.id]: [1, 2, 3] })
    const m2 = mis(p.id, ciras, { [gs.id]: [0.1] }, { ora: '10:00' })
    expect(completamentoDiretto(ciras, tutti, [m1, m2], p.id)).toBeNull()
  })
  it('fatta con una sola misura: nessuna (si chiede)', () => {
    const m = mis(p.id, spad, { [stadio.id]: [4] })
    expect(completamentoDiretto(spad, tutti, [m], p.id)).toBeNull()
  })
  it('senza misure: nessuna', () => {
    expect(completamentoDiretto(ciras, tutti, [], p.id)).toBeNull()
  })
  it('due misure che insieme la completano: fatta, quindi nessuna', () => {
    const m1 = mis(p.id, ciras, { [A.id]: [1, 2, 3], [gs.id]: [1] })
    const m2 = mis(p.id, ciras, { [E.id]: [1], [Ci.id]: [1] }, { ora: '10:00' })
    expect(completamentoDiretto(ciras, tutti, [m1, m2], p.id)).toBeNull()
  })
})
