import { describe, it, expect } from 'vitest'
import {
  avvisiMancanti, confrontoTrattamento, daSistemare, fuoriDalGruppo, mediaPerTrattamento, ultimiValoriPianta,
  valoreNumerico, valoriGiornalieri,
} from './statistiche'
import type { ConfigEsperimento, Misura, Parametro, Pianta, Strumento, Trattamento, ValoriMisura } from './tipi'
import { configDiEsempio, parametro } from './test-helpers'

const spad = parametro('SPAD', { id: 'par-spad', n_letture: 1, ordine: 0 })
const ciras = parametro('A', { id: 'par-a', n_letture: 3, ordine: 1 })
const palchi = parametro('Palchi', { id: 'par-palchi', tipo: 'lista', ordine: 2, sotto_campi: [{ chiave: 'f', nome: 'Foglie', unita: null }] })
const note = parametro('Note', { id: 'par-note', tipo: 'testo', ordine: 3 })
const vigore = parametro('Vigoroso', { id: 'par-vigore', tipo: 'sino', ordine: 4 })
const vecchio = parametro('Vecchio', { id: 'par-vecchio', archiviato: true, ordine: 5 })

function strumento(id: string, nome: string, ordine: number, ps: Parametro[], extra: Partial<Strumento> = {}): Strumento {
  return {
    id, nome, icona: null, ordine, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: ps.map((p, i) => ({ parametro_id: p.id, obbligatorio: false, ordine: i })), ...extra,
  }
}
const sSpad = strumento('s-spad', 'SPAD', 0, [spad, vecchio])
const sCiras = strumento('s-ciras', 'Ciras', 1, [ciras])
const sFeno = strumento('s-feno', 'Fenologia', 2, [palchi, note, vigore])

const T1: Trattamento = { id: 't1', etichetta: 'Controllo', ordine: 0, livello_ids: [] }
const T2: Trattamento = { id: 't2', etichetta: 'Hydrochar', ordine: 1, livello_ids: [] }
/** Sei piante nel trattamento 1 (p1..p6), due nel 2 (p7, p8) e una senza dati (p9). */
const piante: Pianta[] = [
  ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i): Pianta => ({ id, trattamento_id: 't1', etichetta: String(i + 1), blocco: null, ordine: i })),
  { id: 'p7', trattamento_id: 't2', etichetta: '7', blocco: null, ordine: 6 },
  { id: 'p8', trattamento_id: 't2', etichetta: '8', blocco: null, ordine: 7 },
  { id: 'p9', trattamento_id: 't2', etichetta: '9', blocco: null, ordine: 8 },
]
const config: ConfigEsperimento = {
  ...configDiEsempio(),
  trattamenti: [T1, T2],
  piante,
  parametri: [spad, ciras, palchi, note, vigore, vecchio],
  strumenti: [sSpad, sCiras, sFeno],
}

let n = 0
function mis(pianta: string, s: Strumento, data: string, valori: ValoriMisura, ora = '09:00'): Misura {
  n += 1
  return { id: `m${n}`, pianta_id: pianta, strumento_id: s.id, data_rilievo: data, ora, valori }
}
const spadMis = (pianta: string, data: string, v: number | null, ora?: string) => mis(pianta, sSpad, data, { [spad.id]: [v] }, ora)

describe('valoreNumerico', () => {
  it('numero: media delle letture non nulle', () => {
    expect(valoreNumerico(ciras, [10, 20, 30])).toBe(20)
    expect(valoreNumerico(ciras, [10, null, 20])).toBe(15)
    expect(valoreNumerico(ciras, [null, 7.5, null])).toBe(7.5)
  })
  it('numero: tutte le letture nulle o valore assente: null', () => {
    expect(valoreNumerico(ciras, [null, null, null])).toBeNull()
    expect(valoreNumerico(ciras, undefined)).toBeNull()
    expect(valoreNumerico(ciras, [])).toBeNull()
  })
  it('numero: un valore 0 è un valore, non un vuoto', () => {
    expect(valoreNumerico(ciras, [0, null, 0])).toBe(0)
  })
  it('lista: il numero di elementi; la lista vuota è un vuoto', () => {
    expect(valoreNumerico(palchi, [{ n: 1, valori: { f: 3 } }, { n: 2, valori: { f: null } }, { n: 3, valori: {} }])).toBe(3)
    expect(valoreNumerico(palchi, [])).toBeNull()
  })
  it('testo e sì/no non hanno un valore numerico', () => {
    expect(valoreNumerico(note, 'tutto bene')).toBeNull()
    expect(valoreNumerico(vigore, true)).toBeNull()
    expect(valoreNumerico(vigore, false)).toBeNull()
  })
})

describe('valoriGiornalieri', () => {
  it('una pianta e una data, una sola misura: il suo valore', () => {
    const r = valoriGiornalieri(spad, [spadMis('p1', '2026-10-28', 40)])
    expect(r.get('p1')?.get('2026-10-28')).toBe(40)
  })
  it('più misure della stessa pianta nello stesso giorno: media giornaliera', () => {
    const r = valoriGiornalieri(spad, [spadMis('p1', '2026-10-28', 40, '09:00'), spadMis('p1', '2026-10-28', 44, '15:00')])
    expect(r.get('p1')?.get('2026-10-28')).toBe(42)
  })
  it('letture ripetute: prima la media di ogni misura, poi quella del giorno', () => {
    // misura 1: (10+20)/2 = 15; misura 2: 30 (una lettura sola); media giornaliera (15+30)/2 = 22,5, non (10+20+30)/3
    const r = valoriGiornalieri(ciras, [
      mis('p1', sCiras, '2026-10-28', { [ciras.id]: [10, 20, null] }),
      mis('p1', sCiras, '2026-10-28', { [ciras.id]: [30, null, null] }, '10:00'),
    ])
    expect(r.get('p1')?.get('2026-10-28')).toBe(22.5)
  })
  it('date e piante diverse restano separate', () => {
    const r = valoriGiornalieri(spad, [spadMis('p1', '2026-10-21', 38), spadMis('p1', '2026-10-28', 40), spadMis('p2', '2026-10-28', 50)])
    expect([...(r.get('p1') ?? [])]).toEqual([['2026-10-21', 38], ['2026-10-28', 40]])
    expect(r.get('p2')?.get('2026-10-28')).toBe(50)
  })
  it('le misure senza il parametro, vuote o di testo non entrano: né una pianta né un giorno', () => {
    const r = valoriGiornalieri(spad, [
      spadMis('p1', '2026-10-28', null),
      mis('p2', sCiras, '2026-10-28', { [ciras.id]: [5, null, null] }),
      spadMis('p3', '2026-10-28', 40, '09:00'),
      spadMis('p3', '2026-10-28', null, '10:00'),
    ])
    expect(r.has('p1')).toBe(false)
    expect(r.has('p2')).toBe(false)
    expect(r.get('p3')?.get('2026-10-28')).toBe(40)   // la misura vuota non abbassa la media del giorno
    expect(valoriGiornalieri(note, [mis('p1', sFeno, '2026-10-28', { [note.id]: 'ok' })]).size).toBe(0)
  })
  it('una lista conta gli elementi', () => {
    const r = valoriGiornalieri(palchi, [mis('p1', sFeno, '2026-10-28', { [palchi.id]: [{ n: 1, valori: {} }, { n: 2, valori: {} }] })])
    expect(r.get('p1')?.get('2026-10-28')).toBe(2)
  })
})

describe('fuoriDalGruppo', () => {
  it('meno di 3 altre piante: null', () => {
    expect(fuoriDalGruppo(100, [])).toBeNull()
    expect(fuoriDalGruppo(100, [10, 12])).toBeNull()
  })
  it('media e deviazione standard (n-1) delle altre piante, senza la pianta stessa', () => {
    // altri 10, 10, 12, 12: media 11, varianza 4/3, ds = 1,1547; soglia 3 ds = 3,4641
    const r = fuoriDalGruppo(11, [10, 10, 12, 12])
    expect(r?.media).toBe(11)
    expect(r?.ds).toBeCloseTo(1.1547, 4)
    expect(r?.fuori).toBe(false)
  })
  it('la soglia è 3 deviazioni standard: appena sotto non è fuori, appena sopra sì (da entrambi i lati)', () => {
    expect(fuoriDalGruppo(14.4, [10, 10, 12, 12])?.fuori).toBe(false)   // scarto 3,4 < 3,4641
    expect(fuoriDalGruppo(14.5, [10, 10, 12, 12])?.fuori).toBe(true)    // scarto 3,5 > 3,4641
    expect(fuoriDalGruppo(7.6, [10, 10, 12, 12])?.fuori).toBe(false)    // scarto 3,4
    expect(fuoriDalGruppo(7.5, [10, 10, 12, 12])?.fuori).toBe(true)     // scarto 3,5
  })
  it('esattamente 3 altre piante bastano', () => {
    // altri 10, 12, 14: media 12, ds 2, soglia 6
    expect(fuoriDalGruppo(18.1, [10, 12, 14])?.fuori).toBe(true)
    expect(fuoriDalGruppo(17.9, [10, 12, 14])?.fuori).toBe(false)
  })
  it('deviazione standard 0: mai fuori, ma media e ds ci sono', () => {
    const r = fuoriDalGruppo(100, [5, 5, 5])
    expect(r).toEqual({ media: 5, ds: 0, fuori: false })
  })
  it('valori uguali a meno degli arrotondamenti delle medie: ds 0, nessun falso allarme', () => {
    // 0,15 letto una volta e 0,15 come media delle letture 0,1 e 0,2 (0,15000000000000002)
    const r = fuoriDalGruppo(0.16, [0.15, 0.15, (0.1 + 0.2) / 2])
    expect(r?.ds).toBe(0)
    expect(r?.fuori).toBe(false)
  })
  it('con 6 piante scatta (senza leave-one-out la soglia non scatterebbe mai: massimo 2,04 ds)', () => {
    // le altre cinque: 10, 10, 10, 10, 11 (media 10,2, ds 0,4472); la sesta vale 12: scarto 1,8 > 3 ds = 1,3416
    const r = fuoriDalGruppo(12, [10, 10, 10, 10, 11])
    expect(r?.fuori).toBe(true)
    // lo stesso gruppo di sei con la pianta dentro: media 10,5, ds 0,8367, scarto 1,5 = 1,79 ds, sotto 3
    const tutti = [10, 10, 10, 10, 11, 12]
    const m = tutti.reduce((a, b) => a + b) / tutti.length
    const ds = Math.sqrt(tutti.reduce((a, x) => a + (x - m) ** 2, 0) / (tutti.length - 1))
    expect(Math.abs(12 - m) / ds).toBeLessThan(2.04)
  })
})

describe('confrontoTrattamento', () => {
  const D = '2026-10-28'
  const giorno = [
    spadMis('p1', D, 40), spadMis('p2', D, 42), spadMis('p3', D, 38), spadMis('p4', D, 41), spadMis('p5', D, 39),
    spadMis('p6', D, 80),
    spadMis('p7', D, 30), spadMis('p8', D, 34),
    spadMis('p2', '2026-10-27', 1000),   // altra data: non conta
  ]
  it('il valore della pianta, la media delle altre del suo trattamento e quante sono', () => {
    const r = confrontoTrattamento(config, spad, giorno, 'p1', D)
    // le altre cinque: 42, 38, 41, 39 e 80 (media 48, ds 17,96): lo scarto di 8 non è fuori
    expect(r).toEqual({ valore: 40, media: 48, n: 5, fuori: false })
  })
  it('fuori dal gruppo: la sesta pianta contro le altre cinque', () => {
    const r = confrontoTrattamento(config, spad, giorno, 'p6', D)
    expect(r?.valore).toBe(80)
    expect(r?.media).toBe(40)
    expect(r?.n).toBe(5)
    expect(r?.fuori).toBe(true)
  })
  it('poche altre piante: la media c\'è, ma non si giudica (mai fuori)', () => {
    const r = confrontoTrattamento(config, spad, giorno, 'p7', D)
    expect(r).toEqual({ valore: 30, media: 34, n: 1, fuori: false })
  })
  it('nessun\'altra pianta con un valore: media null', () => {
    const r = confrontoTrattamento(config, spad, [spadMis('p7', D, 30)], 'p7', D)
    expect(r).toEqual({ valore: 30, media: null, n: 0, fuori: false })
  })
  it('la pianta senza valore quel giorno o sconosciuta: null', () => {
    expect(confrontoTrattamento(config, spad, giorno, 'p9', D)).toBeNull()
    expect(confrontoTrattamento(config, spad, giorno, 'xx', D)).toBeNull()
  })
  it('le altre piante usano la loro media giornaliera', () => {
    const doppie = [spadMis('p2', D, 40, '09:00'), spadMis('p2', D, 44, '15:00'), spadMis('p1', D, 10)]
    expect(confrontoTrattamento(config, spad, doppie, 'p1', D)?.media).toBe(42)
  })
})

describe('ultimiValoriPianta', () => {
  it('per ogni strumento e parametro numerico o lista attivo: ultimo, precedente e tendenza', () => {
    const misure = [
      spadMis('p1', '2026-10-14', 38), spadMis('p1', '2026-10-21', 41.2), spadMis('p1', '2026-10-28', 39.6),
      mis('p1', sFeno, '2026-10-28', { [palchi.id]: [{ n: 1, valori: {} }, { n: 2, valori: {} }] }),
      mis('p1', sFeno, '2026-10-28', { [note.id]: 'ok', [vigore.id]: true }),
    ]
    const r = ultimiValoriPianta(config, misure)
    expect(r.map(x => [x.strumento.nome, x.parametro.nome, x.ultimo, x.precedente, x.tendenza])).toEqual([
      ['SPAD', 'SPAD', { data: '2026-10-28', valore: 39.6 }, { data: '2026-10-21', valore: 41.2 }, 'giu'],
      ['Fenologia', 'Palchi', { data: '2026-10-28', valore: 2 }, null, null],
    ])
  })
  it('tendenza su e uguale; la data precedente è l\'ultima con un valore, non per forza il giorno prima', () => {
    const su = ultimiValoriPianta(config, [spadMis('p1', '2026-10-01', 30), spadMis('p1', '2026-10-28', 31)])
    expect(su[0]).toMatchObject({ precedente: { data: '2026-10-01', valore: 30 }, tendenza: 'su' })
    const uguale = ultimiValoriPianta(config, [spadMis('p1', '2026-10-21', 40), spadMis('p1', '2026-10-28', 40)])
    expect(uguale[0].tendenza).toBe('uguale')
  })
  it('più misure nello stesso giorno: media giornaliera', () => {
    const r = ultimiValoriPianta(config, [spadMis('p1', '2026-10-28', 40, '09:00'), spadMis('p1', '2026-10-28', 42, '15:00')])
    expect(r[0].ultimo).toEqual({ data: '2026-10-28', valore: 41 })
  })
  it('i valori vuoti non contano come data; un parametro mai misurato non compare', () => {
    const r = ultimiValoriPianta(config, [spadMis('p1', '2026-10-21', 40), spadMis('p1', '2026-10-28', null)])
    expect(r).toHaveLength(1)
    expect(r[0].ultimo).toEqual({ data: '2026-10-21', valore: 40 })
    expect(ultimiValoriPianta(config, [])).toEqual([])
  })
  it('esclude gli strumenti e i parametri archiviati e i valori di un altro strumento', () => {
    const archiviato = { ...config, strumenti: [{ ...sSpad, archiviato: true }, sCiras, sFeno] }
    expect(ultimiValoriPianta(archiviato, [spadMis('p1', '2026-10-28', 40)])).toEqual([])
    const vecchioMis = mis('p1', sSpad, '2026-10-28', { [vecchio.id]: [9] })
    expect(ultimiValoriPianta(config, [vecchioMis])).toEqual([])
    // lo stesso parametro con una misura registrata con un altro strumento non è dello strumento SPAD
    expect(ultimiValoriPianta(config, [mis('p1', sCiras, '2026-10-28', { [spad.id]: [40] })])).toEqual([])
  })
  it('gli strumenti seguono l\'ordine della configurazione', () => {
    const invertiti = { ...config, strumenti: [{ ...sSpad, ordine: 5 }, { ...sCiras, ordine: 1 }] }
    const r = ultimiValoriPianta(invertiti, [
      spadMis('p1', '2026-10-28', 40), mis('p1', sCiras, '2026-10-28', { [ciras.id]: [7, null, null] }),
    ])
    expect(r.map(x => x.strumento.nome)).toEqual(['Ciras', 'SPAD'])
  })
})

describe('avvisiMancanti', () => {
  const oggi = '2026-10-31'
  const ultime = new Map([['s-spad', '2026-10-28'], ['s-ciras', '2026-10-21']])
  it('non misurato da N giorni, contati dall\'ultima misura della pianta a oggi', () => {
    const r = avvisiMancanti(config, [spadMis('p1', '2026-10-21', 40), mis('p1', sCiras, '2026-10-21', { [ciras.id]: [1, 2, 3] })], ultime, oggi)
    expect(r).toEqual(['SPAD non misurato da 10 giorni'])
  })
  it('plurale: da 1 giorno', () => {
    const r = avvisiMancanti(config, [spadMis('p1', '2026-10-30', 40)], new Map([['s-spad', '2026-10-31']]), oggi)
    expect(r).toEqual(['SPAD non misurato da 1 giorno'])
  })
  it('mai misurato: la pianta non ha misure dello strumento ma l\'esperimento sì', () => {
    expect(avvisiMancanti(config, [], ultime, oggi)).toEqual(['SPAD mai misurato', 'Ciras mai misurato'])
  })
  it('nessuna pianta ha misure dello strumento: nessun avviso', () => {
    expect(avvisiMancanti(config, [], new Map(), oggi)).toEqual([])
  })
  it('la pianta è allineata con le altre: nessun avviso', () => {
    expect(avvisiMancanti(config, [spadMis('p1', '2026-10-28', 40)], new Map([['s-spad', '2026-10-28']]), oggi)).toEqual([])
  })
  it('la pianta è più recente dell\'ultima data nota: nessun avviso', () => {
    expect(avvisiMancanti(config, [spadMis('p1', '2026-10-30', 40)], new Map([['s-spad', '2026-10-28']]), oggi)).toEqual([])
  })
  it('gli strumenti archiviati non danno avvisi e l\'ordine segue quello degli strumenti', () => {
    const arch = { ...config, strumenti: [{ ...sSpad, archiviato: true }, sCiras] }
    expect(avvisiMancanti(arch, [], ultime, oggi)).toEqual(['Ciras mai misurato'])
  })
  it('conta i giorni di calendario anche a cavallo del cambio dell\'ora', () => {
    const r = avvisiMancanti(config, [spadMis('p1', '2026-10-24', 40)], new Map([['s-spad', '2026-10-28']]), '2026-10-26')
    expect(r).toEqual(['SPAD non misurato da 2 giorni'])
  })
})

describe('mediaPerTrattamento', () => {
  it('media degli ultimi valori delle piante, una per pianta, con il numero di piante con un valore', () => {
    const ultime = [
      spadMis('p1', '2026-10-28', 40), spadMis('p2', '2026-10-21', 44), spadMis('p3', '2026-10-28', 36),
      spadMis('p7', '2026-10-28', 30),
    ]
    const r = mediaPerTrattamento(config, spad, ultime)
    expect(r.get('t1')).toEqual({ media: 40, n: 3 })
    expect(r.get('t2')).toEqual({ media: 30, n: 1 })
  })
  it('ogni pianta con la sua ultima data (media giornaliera); più misure del giorno si mediano', () => {
    const ultime = [spadMis('p1', '2026-10-21', 100), spadMis('p1', '2026-10-28', 40, '09:00'), spadMis('p1', '2026-10-28', 44, '15:00'), spadMis('p2', '2026-10-14', 38)]
    expect(mediaPerTrattamento(config, spad, ultime).get('t1')).toEqual({ media: 40, n: 2 })
  })
  it('un trattamento senza valori: media null e n 0; i trattamenti ci sono tutti', () => {
    const r = mediaPerTrattamento(config, spad, [spadMis('p1', '2026-10-28', 40)])
    expect(r.get('t2')).toEqual({ media: null, n: 0 })
    expect([...r.keys()]).toEqual(['t1', 't2'])
  })
  it('una lista conta gli elementi; il testo non entra', () => {
    const palchiMis = mis('p1', sFeno, '2026-10-28', { [palchi.id]: [{ n: 1, valori: {} }, { n: 2, valori: {} }, { n: 3, valori: {} }] })
    expect(mediaPerTrattamento(config, palchi, [palchiMis]).get('t1')).toEqual({ media: 3, n: 1 })
    expect(mediaPerTrattamento(config, note, [mis('p1', sFeno, '2026-10-28', { [note.id]: 'ok' })]).get('t1')).toEqual({ media: null, n: 0 })
  })
  it('una pianta che non è nella configurazione non conta', () => {
    expect(mediaPerTrattamento(config, spad, [spadMis('zz', '2026-10-28', 99)]).get('t1')).toEqual({ media: null, n: 0 })
  })
})

describe('daSistemare', () => {
  const D = '2026-10-28'
  const base = [spadMis('p1', D, 40), spadMis('p2', D, 42), spadMis('p3', D, 38), spadMis('p4', D, 41), spadMis('p5', D, 39)]
  it('le piante fuori dal gruppo, con la misura, il valore e la media delle altre', () => {
    const outlier = spadMis('p6', D, 80)
    const r = daSistemare(config, [...base, outlier], D)
    expect(r).toEqual([{ misuraId: outlier.id, piantaId: 'p6', parametroId: spad.id, valore: 80, media: 40 }])
  })
  it('nessuno fuori: lista vuota; il gruppo piccolo non si giudica', () => {
    expect(daSistemare(config, [...base, spadMis('p6', D, 41)], D)).toEqual([])
    expect(daSistemare(config, [spadMis('p7', D, 1), spadMis('p8', D, 100)], D)).toEqual([])
  })
  it('ogni pianta è confrontata solo con le altre del suo trattamento', () => {
    // p7 vale 80 ma è nel trattamento 2, dove non c'è un gruppo: non è fuori per colpa del trattamento 1
    expect(daSistemare(config, [...base, spadMis('p7', D, 80)], D)).toEqual([])
  })
  it('con più misure quel giorno si tocca l\'ultima per ora che porta il valore', () => {
    const prima = spadMis('p6', D, 70, '09:00')
    const dopo = spadMis('p6', D, 90, '15:00')
    const senzaValore = spadMis('p6', D, null, '18:00')
    const r = daSistemare(config, [...base, dopo, prima, senzaValore], D)
    // media giornaliera 80: fuori; la misura da correggere è quella delle 15:00 (quella delle 18:00 è vuota)
    expect(r).toEqual([{ misuraId: dopo.id, piantaId: 'p6', parametroId: spad.id, valore: 80, media: 40 }])
  })
  it('conta solo la data richiesta, i parametri numerici attivi, non testo, sì/no, liste o archiviati', () => {
    const altraData = spadMis('p6', '2026-10-27', 80)
    expect(daSistemare(config, [...base, altraData], D)).toEqual([])
    const arch = { ...config, parametri: [{ ...spad, archiviato: true }, ciras, palchi, note, vigore, vecchio] }
    expect(daSistemare(arch, [...base, spadMis('p6', D, 80)], D)).toEqual([])
    const lista = (p: string, k: number) => mis(p, sFeno, D, { [palchi.id]: Array.from({ length: k }, (_, i) => ({ n: i + 1, valori: {} })) })
    expect(daSistemare(config, [lista('p1', 3), lista('p2', 3), lista('p3', 4), lista('p4', 3), lista('p5', 3), lista('p6', 50)], D)).toEqual([])
  })
  it('più parametri: l\'ordine è quello dei parametri e poi delle piante', () => {
    const a = (p: string, x: number) => mis(p, sCiras, D, { [ciras.id]: [x, null, null] })
    const misure = [
      ...base, spadMis('p6', D, 80),
      a('p1', 10), a('p2', 11), a('p3', 12), a('p4', 11), a('p5', 10), a('p6', 100),
    ]
    const r = daSistemare(config, misure, D)
    expect(r.map(x => [x.parametroId, x.piantaId])).toEqual([[spad.id, 'p6'], [ciras.id, 'p6']])
  })
})
