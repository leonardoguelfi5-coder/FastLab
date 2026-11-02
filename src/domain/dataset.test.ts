import { describe, it, expect } from 'vitest'
import {
  cercaPiante, fineDelleSettimane, filtriDaRicerca, intervalloDelPeriodo, nelPeriodo, noteDelGrafico, parametriDelloStrumento,
  haFiltriAttivi, limitaCerca, MASSIMO_CARATTERI_CERCA, MASSIMO_PEZZI_CERCA,
  pianteDelFiltro, ricercaDaFiltri, righeTabella, righeTesto, senzaFiltri, seriePiante, serieTrattamenti,
  type FiltriDataset, type Intervallo, type SerieTrattamento,
} from './dataset'
import { configDiEsempio, parametro } from './test-helpers'
import type { ConfigEsperimento, Misura, Nota, Pianta, Strumento, Trattamento, ValoriMisura } from './tipi'

/*
 * La configurazione dei test: i 4 trattamenti di `configDiEsempio` (Stress Controllo/S1 per Hydrochar No/Sì, in
 * quest'ordine) con sette piante e tre strumenti:
 * - Altezza: Altezza (numero), Ciras (numero a 3 letture), Vecchio (archiviato);
 * - Fenologici: Palchi (lista), Note (testo), Vigoroso (sì/no);
 * - Diario: solo Note (nessun parametro disegnabile).
 */
const base = configDiEsempio()
const [stress, hc] = base.fattori
const [tCN, tCS, tSN, tSS] = base.trattamenti   // Controllo + No, Controllo + Sì, S1 + No, S1 + Sì
const [altezza, palchi, note, vecchio] = base.parametri
const ciras = parametro('Ciras', { n_letture: 3, ordine: 4 })
const vigore = parametro('Vigoroso', { tipo: 'sino', ordine: 5 })

const pianta = (id: string, etichetta: string, t: Trattamento, ordine: number): Pianta =>
  ({ id, trattamento_id: t.id, etichetta, blocco: null, ordine })
const p1 = pianta('pi-1', '1', tCN, 0)
const p2 = pianta('pi-2', '2', tCN, 1)
const p3 = pianta('pi-3', '3', tCN, 2)
const p12 = pianta('pi-12', '12', tCS, 3)
const p13 = pianta('pi-13', '13', tCS, 4)
const pA4 = pianta('pi-a4', 'A4', tSN, 5)
const p35 = pianta('pi-35', '35', tSS, 6)

function strumento(nome: string, ordine: number, ids: string[]): Strumento {
  return {
    id: crypto.randomUUID(), nome, icona: null, ordine, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: ids.map((parametro_id, i) => ({ parametro_id, obbligatorio: false, ordine: i })),
  }
}
// Vecchio (archiviato) sta in mezzo nello strumento: deve finire in fondo.
const sAltezza = strumento('Altezza', 0, [altezza.id, vecchio.id, ciras.id])
const sFeno = strumento('Fenologici', 1, [palchi.id, note.id, vigore.id])
const sDiario = strumento('Diario', 2, [note.id])

const config: ConfigEsperimento = {
  ...base,
  piante: [p1, p2, p3, p12, p13, pA4, p35],
  parametri: [altezza, palchi, note, vecchio, ciras, vigore],
  strumenti: [sAltezza, sFeno, sDiario],
}

let n = 0
function mis(p: Pianta, s: Strumento, data: string, valori: ValoriMisura, ora = '09:00'): Misura {
  n += 1
  return { id: `m${n}`, pianta_id: p.id, strumento_id: s.id, data_rilievo: data, ora, valori }
}
const alt = (p: Pianta, data: string, v: number | null, ora?: string) => mis(p, sAltezza, data, { [altezza.id]: [v] }, ora)
const TUTTO: Intervallo = { da: null, a: null }

const filtri = (extra: Partial<FiltriDataset> = {}): FiltriDataset => ({
  strumentoId: sAltezza.id, parametroId: altezza.id, trattamentoIds: [], livelloIds: [], periodo: { modo: 'tutto' }, cercato: '',
  ...extra,
})

describe('periodo', () => {
  it('Tutto: nessun estremo, comprese le date future', () => {
    expect(intervalloDelPeriodo({ modo: 'tutto' }, '2026-11-02')).toEqual(TUTTO)
    expect(nelPeriodo('2030-01-01', TUTTO)).toBe(true)
    expect(nelPeriodo('2000-01-01', TUTTO)).toBe(true)
  })
  it('ultime 4 settimane: 28 giorni compresi, fino alla fine compresa', () => {
    const i = intervalloDelPeriodo({ modo: 'settimane', n: 4 }, '2026-11-02')
    expect(i).toEqual({ da: '2026-10-06', a: '2026-11-02' })
    expect(nelPeriodo('2026-10-05', i)).toBe(false)
    expect(nelPeriodo('2026-10-06', i)).toBe(true)
    expect(nelPeriodo('2026-11-02', i)).toBe(true)
    expect(nelPeriodo('2026-11-03', i)).toBe(false)   // una data futura non è nelle ultime settimane
  })
  it('a cavallo dell\'ora legale (25/10/2026) i giorni restano giorni', () => {
    expect(intervalloDelPeriodo({ modo: 'settimane', n: 1 }, '2026-10-31')).toEqual({ da: '2026-10-25', a: '2026-10-31' })
    expect(intervalloDelPeriodo({ modo: 'settimane', n: 2 }, '2026-11-01')).toEqual({ da: '2026-10-19', a: '2026-11-01' })
  })
  it('intervallo: estremi compresi', () => {
    const i = intervalloDelPeriodo({ modo: 'intervallo', da: '2026-10-10', a: '2026-10-20' }, '2026-11-02')
    expect(i).toEqual({ da: '2026-10-10', a: '2026-10-20' })
    expect(['2026-10-09', '2026-10-10', '2026-10-20', '2026-10-21'].map(d => nelPeriodo(d, i))).toEqual([false, true, true, false])
  })
  it('le settimane finiscono oggi per un esperimento in corso, all\'ultima data con misure per uno concluso', () => {
    expect(fineDelleSettimane('in_corso', '2026-11-02', '2026-10-20')).toBe('2026-11-02')
    expect(fineDelleSettimane('in_corso', '2026-11-02', null)).toBe('2026-11-02')
    expect(fineDelleSettimane('concluso', '2026-11-02', '2026-06-30')).toBe('2026-06-30')
    // concluso e senza misure: non c'è niente da mostrare, la fine resta oggi
    expect(fineDelleSettimane('concluso', '2026-11-02', null)).toBe('2026-11-02')
  })
})

describe('cercaPiante', () => {
  const tutte = config.piante
  it('corrispondenza esatta per pezzo: 3 non trova 13', () =>
    expect(cercaPiante(tutte, '3')).toEqual({ trovate: [p3], nonTrovate: [] }))
  it('035 trova 35, a4 trova A4, spazi ai bordi ignorati', () =>
    expect(cercaPiante(tutte, ' 035 ,  a4 ')).toEqual({ trovate: [pA4, p35], nonTrovate: [] }))
  it('pezzi vuoti ignorati, doppioni una volta sola, nell\'ordine delle piante', () =>
    expect(cercaPiante(tutte, '12, 3, 3,, 12,')).toEqual({ trovate: [p3, p12], nonTrovate: [] }))
  it('i pezzi senza pianta in nonTrovate, nell\'ordine scritto e senza doppioni', () =>
    expect(cercaPiante(tutte, '99, 3, b7, 99, B7')).toEqual({ trovate: [p3], nonTrovate: ['99', 'b7'] }))
  it('testo vuoto: niente', () => expect(cercaPiante(tutte, ' , ')).toEqual({ trovate: [], nonTrovate: [] }))
})

describe('pianteDelFiltro', () => {
  const [stressC, stressS1] = stress.livelli
  const [hcNo, hcSi] = hc.livelli
  it('senza filtri: tutte le piante', () =>
    expect(pianteDelFiltro(config, filtri())).toEqual({ piante: config.piante, modo: 'trattamenti', nonTrovate: [] }))
  it('trattamenti scelti', () =>
    expect(pianteDelFiltro(config, filtri({ trattamentoIds: [tSS.id, tCS.id] })).piante).toEqual([p12, p13, p35]))
  it('un livello: i trattamenti che lo contengono', () =>
    expect(pianteDelFiltro(config, filtri({ livelloIds: [hcSi.id] })).piante).toEqual([p12, p13, p35]))
  it('due fattori in "e"', () =>
    expect(pianteDelFiltro(config, filtri({ livelloIds: [stressS1.id, hcNo.id] })).piante).toEqual([pA4]))
  it('trattamenti e livelli in "e"', () => {
    expect(pianteDelFiltro(config, filtri({ trattamentoIds: [tCN.id, tCS.id], livelloIds: [hcSi.id] })).piante).toEqual([p12, p13])
    expect(pianteDelFiltro(config, filtri({ trattamentoIds: [tSN.id], livelloIds: [stressC.id] })).piante).toEqual([])
  })
  it('la ricerca vince su trattamenti e livelli', () =>
    expect(pianteDelFiltro(config, filtri({ trattamentoIds: [tCS.id], livelloIds: [hcSi.id], cercato: '3, 99, a4' })))
      .toEqual({ piante: [p3, pA4], modo: 'piante', nonTrovate: ['99'] }))
  it('una ricerca che non trova niente lascia valere i filtri e dice cosa non ha trovato', () =>
    expect(pianteDelFiltro(config, filtri({ trattamentoIds: [tSS.id], cercato: '99' })))
      .toEqual({ piante: [p35], modo: 'trattamenti', nonTrovate: ['99'] }))
})

describe('parametriDelloStrumento', () => {
  it('nell\'ordine dello strumento, archiviati in fondo, con la scala del grafico', () => {
    expect(parametriDelloStrumento(config, sAltezza.id).map(x => [x.parametro.nome, x.disegnabile, x.scala]))
      .toEqual([['Altezza', true, 'valore'], ['Ciras', true, 'valore'], ['Vecchio', true, 'valore']])
    expect(parametriDelloStrumento(config, sAltezza.id).map(x => x.parametro.archiviato)).toEqual([false, false, true])
  })
  it('lista = conteggio, sì/no = percentuale, testo non disegnabile', () =>
    expect(parametriDelloStrumento(config, sFeno.id).map(x => [x.parametro.nome, x.disegnabile, x.scala]))
      .toEqual([['Palchi', true, 'conteggio'], ['Note', false, null], ['Vigoroso', true, 'percentuale']]))
  it('strumento sconosciuto: nessun parametro', () => expect(parametriDelloStrumento(config, 'boh')).toEqual([]))
})

describe('serieTrattamenti: numeri', () => {
  const D = '2026-10-28'
  it('l\'unità è la pianta: due misure dello stesso giorno fanno la media del giorno della pianta', () => {
    // p1: 40 e 44 → 42; p2: 50. Media tra piante (42 + 50) / 2 = 46, non (40 + 44 + 50) / 3 = 44,67
    const s = serieTrattamenti(config, altezza, [alt(p1, D, 40), alt(p1, D, 44, '15:00'), alt(p2, D, 50)], [p1, p2], TUTTO)
    expect(s).toHaveLength(1)
    expect(s[0].punti).toHaveLength(1)
    expect(s[0].punti[0].media).toBe(46)
    expect(s[0].punti[0].n).toBe(2)
    // 42 e 50: ds = radice(32) = 5,657; ES = 5,657 / radice(2) = 4
    expect(s[0].punti[0].es).toBeCloseTo(4, 12)
  })
  it('letture [40, null, 42] → 41; due misure con letture diverse → media delle medie per misura', () => {
    const c = (p: Pianta, v: (number | null)[], ora = '09:00') => mis(p, sAltezza, D, { [ciras.id]: v }, ora)
    const s = serieTrattamenti(config, ciras, [c(p1, [40, null, 42]), c(p2, [10, 20, null]), c(p2, [30, null, null], '10:00')], [p1, p2], TUTTO)
    // p1 = 41; p2 = media(15, 30) = 22,5 (non media(10, 20, 30) = 20); trattamento = (41 + 22,5) / 2 = 31,75
    expect(s[0].punti[0].media).toBe(31.75)
    expect(s[0].punti[0].n).toBe(2)
  })
  it('n conta solo le piante con un valore; con n = 1 l\'ES non c\'è', () => {
    const s = serieTrattamenti(config, altezza, [alt(p1, D, 40), alt(p2, D, null), alt(p3, '2026-10-21', 30)], [p1, p2, p3], TUTTO)
    expect(s[0].punti).toEqual([{ data: '2026-10-21', media: 30, es: null, n: 1 }, { data: D, media: 40, es: null, n: 1 }])
  })
  it('una serie per trattamento con piante tra quelle scelte, in ordine di configurazione; punti in ordine di data', () => {
    const misure = [alt(p35, '2026-10-21', 9), alt(p1, D, 40), alt(p35, D, 10), alt(p12, D, 20)]
    const s = serieTrattamenti(config, altezza, misure, [p35, p12, p1], TUTTO)
    expect(s.map(x => x.trattamento.id)).toEqual([tCN.id, tCS.id, tSS.id])
    expect(s[2].punti.map(p => p.data)).toEqual(['2026-10-21', D])
    expect(s.every(x => x.tipo === 'trattamento' && !x.riferimento)).toBe(true)
  })
  it('un trattamento con piante ma senza valori ha una serie vuota', () => {
    const s = serieTrattamenti(config, altezza, [alt(p1, D, 40)], [p1, pA4], TUTTO)
    expect(s.map(x => [x.trattamento.id, x.punti.length])).toEqual([[tCN.id, 1], [tSN.id, 0]])
  })
  it('le misure di piante non scelte e fuori periodo non contano', () => {
    const misure = [alt(p1, '2026-10-01', 1), alt(p1, D, 40), alt(p2, D, 1000)]
    const s = serieTrattamenti(config, altezza, misure, [p1], { da: '2026-10-10', a: '2026-10-31' })
    expect(s[0].punti).toEqual([{ data: D, media: 40, es: null, n: 1 }])
  })
  it('con "Tutto" una misura con data futura (orologio avanti) entra', () => {
    const s = serieTrattamenti(config, altezza, [alt(p1, '2030-01-01', 7)], [p1], intervalloDelPeriodo({ modo: 'tutto' }, '2026-11-02'))
    expect(s[0].punti).toEqual([{ data: '2030-01-01', media: 7, es: null, n: 1 }])
  })
})

describe('serieTrattamenti: liste, sì/no e testo', () => {
  const D = '2026-10-28'
  const elementi = (k: number) => Array.from({ length: k }, (_, i) => ({ n: i + 1, valori: {} }))
  it('lista: il numero di elementi; la lista vuota non conta', () => {
    const misure = [mis(p1, sFeno, D, { [palchi.id]: elementi(3) }), mis(p2, sFeno, D, { [palchi.id]: elementi(5) }),
      mis(p3, sFeno, D, { [palchi.id]: [] })]
    const s = serieTrattamenti(config, palchi, misure, [p1, p2, p3], TUTTO)
    expect(s[0].punti[0].media).toBe(4)
    expect(s[0].punti[0].n).toBe(2)
  })
  it('sì/no: percentuale di sì tra le piante con un valore, ultima del giorno per ora, senza ES', () => {
    const sino = (p: Pianta, v: boolean | null, ora = '09:00') => mis(p, sFeno, D, { [vigore.id]: v }, ora)
    // p1: no alle 15, sì alle 9 → no; p2: sì; p3: non scelto → esclusa. 1 sì su 2 = 50%
    const misure = [sino(p1, false, '15:00'), sino(p1, true, '09:00'), sino(p2, true), sino(p3, null)]
    expect(serieTrattamenti(config, vigore, misure, [p1, p2, p3], TUTTO)[0].punti).toEqual([{ data: D, media: 50, es: null, n: 2 }])
  })
  it('testo: nessuna serie', () =>
    expect(serieTrattamenti(config, note, [mis(p1, sFeno, D, { [note.id]: 'ok' })], [p1], TUTTO)).toEqual([]))
})

describe('posto del colore', () => {
  it('segue il trattamento nella configurazione, non il filtro', () => {
    const tutti = serieTrattamenti(config, altezza, [], config.piante, TUTTO)
    expect(tutti.map(s => s.posto)).toEqual([0, 1, 2, 3])
    const senzaIlPrimo = serieTrattamenti(config, altezza, [], [p12, pA4], TUTTO)
    expect(senzaIlPrimo.map(s => s.posto)).toEqual([1, 2])
  })
  it('segue l\'ordine dei trattamenti, non quello dell\'elenco', () => {
    const rovesciata = { ...config, trattamenti: [...config.trattamenti].reverse() }
    expect(serieTrattamenti(rovesciata, altezza, [], [p35], TUTTO)[0].posto).toBe(3)
  })
  it('dal nono trattamento in poi nessun colore', () => {
    const trattamenti: Trattamento[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, etichetta: `T${i}`, ordine: i, livello_ids: [] }))
    const piante = trattamenti.map((t, i) => pianta(`q${i}`, String(i + 1), t, i))
    const grande = { ...config, trattamenti, piante }
    expect(serieTrattamenti(grande, altezza, [], piante, TUTTO).map(s => s.posto)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, null, null])
  })
})

describe('seriePiante', () => {
  const D = '2026-10-28'
  const misure = [alt(p1, D, 40), alt(p1, D, 44, '15:00'), alt(p2, D, 50), alt(p3, D, 60), alt(p12, D, 20), alt(p13, D, 22)]
  it('una serie per pianta con il posto del suo trattamento, poi la media di tutte le piante dei loro trattamenti', () => {
    const r = seriePiante(config, altezza, misure, [p1, p12], TUTTO)
    expect(r.oltre).toBe(0)
    expect(r.serie.map(s => [s.tipo, s.tipo === 'pianta' ? s.pianta.id : s.trattamento.id, s.posto, s.riferimento])).toEqual([
      ['pianta', p1.id, 0, false], ['pianta', p12.id, 1, false],
      ['trattamento', tCN.id, 0, true], ['trattamento', tCS.id, 1, true],
    ])
    expect(r.serie[0].punti).toEqual([{ data: D, media: 42, es: null, n: 1 }])
    // riferimento di Controllo + No: le piante 1, 2 e 3 (42, 50, 60), anche se la ricerca ne ha trovata una sola
    expect(r.serie[2].punti[0].media).toBeCloseTo(152 / 3, 12)
    expect(r.serie[2].punti[0].n).toBe(3)
  })
  it('al più 8 piante: le altre si contano in "oltre"', () => {
    const trattamenti = config.trattamenti
    const molte = Array.from({ length: 11 }, (_, i) => pianta(`r${i}`, `R${i}`, trattamenti[0], i))
    const r = seriePiante({ ...config, piante: molte }, altezza, [], molte, TUTTO)
    expect(r.serie.filter(s => s.tipo === 'pianta').map(s => s.tipo === 'pianta' && s.pianta.id)).toEqual(molte.slice(0, 8).map(p => p.id))
    expect(r.oltre).toBe(3)
  })
  it('sì/no: ogni pianta è 100 o 0, senza errore standard, e il riferimento è la percentuale di sì del trattamento', () => {
    const sino = (p: Pianta, v: boolean | null, ora = '09:00') => mis(p, sFeno, D, { [vigore.id]: v }, ora)
    // p1 sì, p2 no, p3 non scelto (esclusa dal riferimento); p12 no (alle 15, dopo il sì delle 9), p13 non scelto
    const misure = [sino(p1, true), sino(p2, false), sino(p3, null), sino(p12, true, '09:00'), sino(p12, false, '15:00'), sino(p13, null)]
    const r = seriePiante(config, vigore, misure, [p1, p12], TUTTO)
    expect(r.serie.map(s => s.tipo === 'pianta' ? s.pianta.id : s.trattamento.id)).toEqual([p1.id, p12.id, tCN.id, tCS.id])
    expect(r.serie[0].punti).toEqual([{ data: D, media: 100, es: null, n: 1 }])
    expect(r.serie[1].punti).toEqual([{ data: D, media: 0, es: null, n: 1 }])
    // riferimenti in percentuale: Controllo + No = 1 sì su 2 piante con un valore; Controllo + Sì = 0 su 1
    expect(r.serie[2].riferimento && r.serie[2].punti).toEqual([{ data: D, media: 50, es: null, n: 2 }])
    expect(r.serie[3].punti).toEqual([{ data: D, media: 0, es: null, n: 1 }])
  })
  it('testo: nessuna serie', () => expect(seriePiante(config, note, [], [p1], TUTTO)).toEqual({ serie: [], oltre: 0 }))
})

describe('righeTabella', () => {
  it('esattamente i punti delle serie, con gli stessi numeri, dalla data più recente', () => {
    const misure = [alt(p1, '2026-10-21', 30), alt(p1, '2026-10-28', 40), alt(p2, '2026-10-28', 44), alt(p12, '2026-10-21', 20)]
    const serie = serieTrattamenti(config, altezza, misure, config.piante, TUTTO)
    const righe = righeTabella(serie)
    expect(righe.map(r => [r.data, (r.serie as SerieTrattamento).trattamento.id])).toEqual([
      ['2026-10-28', tCN.id], ['2026-10-21', tCN.id], ['2026-10-21', tCS.id],
    ])
    const punti = serie.flatMap(s => s.punti.map(p => ({ ...p, serie: s })))
    expect(righe).toHaveLength(punti.length)
    for (const r of righe) {
      expect(punti).toContainEqual({ data: r.data, media: r.media, es: r.es, n: r.n, serie: r.serie })
    }
  })
  it('vale anche per le serie delle piante e i riferimenti', () => {
    const { serie } = seriePiante(config, altezza, [alt(p1, '2026-10-28', 40), alt(p2, '2026-10-28', 50)], [p1], TUTTO)
    expect(righeTabella(serie).map(r => [r.serie.tipo, r.media, r.n])).toEqual([['pianta', 40, 1], ['trattamento', 45, 2]])
  })
})

describe('righeTesto', () => {
  it('pianta, data e ultimo testo del giorno, dalla data più recente, nell\'ordine delle piante', () => {
    const t = (p: Pianta, data: string, v: string, ora = '09:00') => mis(p, sFeno, data, { [note.id]: v }, ora)
    const misure = [t(p2, '2026-10-21', 'secca'), t(p1, '2026-10-21', 'mattina', '08:00'), t(p1, '2026-10-21', 'sera', '18:00'),
      t(p1, '2026-10-28', 'ok'), t(p3, '2026-10-28', '  '), t(p12, '2026-10-28', 'fuori filtro'), t(p1, '2026-09-01', 'fuori periodo')]
    expect(righeTesto(config, note, misure, [p1, p2, p3], { da: '2026-10-01', a: null }).map(r => [r.pianta.id, r.data, r.testo])).toEqual([
      [p1.id, '2026-10-28', 'ok'], [p1.id, '2026-10-21', 'sera'], [p2.id, '2026-10-21', 'secca'],
    ])
  })
  it('un parametro che non è testo: nessuna riga', () => expect(righeTesto(config, altezza, [alt(p1, '2026-10-28', 4)], [p1], TUTTO)).toEqual([]))
})

describe('noteDelGrafico', () => {
  const nota = (id: string, data: string, collegamenti: Partial<Nota> = {}): Nota =>
    ({ id, data, testo: id, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [], ...collegamenti })
  const tutte = nota('tutte', '2026-10-20')
  const delTrattamento = nota('trattamento', '2026-10-20', { trattamento_ids: [tCN.id] })
  const dellaPianta = nota('pianta', '2026-10-22', { pianta_ids: [p2.id] })
  const altroTrattamento = nota('altro trattamento', '2026-10-22', { trattamento_ids: [tSS.id] })
  const altraPianta = nota('altra pianta', '2026-10-22', { pianta_ids: [p12.id] })
  const fuori = nota('fuori', '2026-09-01')
  const elenco = [dellaPianta, altroTrattamento, fuori, delTrattamento, altraPianta, tutte]
  it('di tutto l\'esperimento, del trattamento o della pianta, nel periodo, una data per segno', () => {
    expect(noteDelGrafico(elenco, [p1, p2], { da: '2026-10-01', a: '2026-10-31' })).toEqual([
      { data: '2026-10-20', note: [delTrattamento, tutte] },
      { data: '2026-10-22', note: [dellaPianta] },
    ])
  })
  it('una nota del trattamento vale anche per le piante cercate di quel trattamento', () =>
    expect(noteDelGrafico([delTrattamento], [p3], TUTTO)).toEqual([{ data: '2026-10-20', note: [delTrattamento] }]))
  it('fuori periodo esclusa; senza piante solo le note di tutto l\'esperimento', () => {
    expect(noteDelGrafico([fuori], [p1], { da: '2026-10-01', a: null })).toEqual([])
    expect(noteDelGrafico(elenco, [], { da: '2026-10-01', a: null })).toEqual([{ data: '2026-10-20', note: [tutte] }])
  })
})

describe('filtri nella URL', () => {
  const [stressC, stressS1] = stress.livelli
  const [, hcSi] = hc.livelli
  const leggi = (q: string) => filtriDaRicerca(new URLSearchParams(q), config)
  it('andata e ritorno identici', () => {
    const f = filtri({
      strumentoId: sFeno.id, parametroId: vigore.id, trattamentoIds: [tSS.id, tCN.id], livelloIds: [hcSi.id, stressC.id],
      periodo: { modo: 'intervallo', da: '2026-10-01', a: '2026-10-31' }, cercato: '3, a4',
    })
    expect(filtriDaRicerca(ricercaDaFiltri(f), config)).toEqual(f)
    for (const periodo of [{ modo: 'tutto' as const }, { modo: 'settimane' as const, n: 2 }, { modo: 'settimane' as const, n: 4 },
      { modo: 'settimane' as const, n: 8 }]) {
      expect(filtriDaRicerca(ricercaDaFiltri(filtri({ periodo })), config)).toEqual(filtri({ periodo }))
    }
    const q = `s=${sAltezza.id}&p=${ciras.id}&t=${tCS.id}&f=${stressS1.id}&per=4s&cerca=12`
    expect(ricercaDaFiltri(leggi(q)).toString()).toBe(new URLSearchParams(q).toString())
  })
  it('i valori di default non si scrivono', () =>
    expect(ricercaDaFiltri(filtri({ strumentoId: null, parametroId: null })).toString()).toBe(''))
  it('URL vuota: niente strumento né parametro (il default lo decide la pagina), tutto il resto vuoto', () =>
    expect(leggi('')).toEqual(filtri({ strumentoId: null, parametroId: null })))
  it('ids sconosciuti o non uuid scartati, doppioni tolti', () => {
    const f = leggi(`s=${crypto.randomUUID()}&t=${tCN.id},nonuuid,${crypto.randomUUID()},${tCN.id}&f=xx,${hcSi.id}`)
    expect(f.strumentoId).toBeNull()
    expect(f.parametroId).toBeNull()
    expect(f.trattamentoIds).toEqual([tCN.id])
    expect(f.livelloIds).toEqual([hcSi.id])
  })
  it('due livelli dello stesso fattore: vale il primo', () =>
    expect(leggi(`f=${stressS1.id},${hcSi.id},${stressC.id}`).livelloIds).toEqual([stressS1.id, hcSi.id]))
  it.each(['boh', '3s', '0s', '4', '2026-10-31_2026-10-01', '2026-02-30_2026-03-01', '2026-10-01', '2026-10-01_'])(
    'per=%s illeggibile vale tutto', per => expect(leggi(`per=${per}`).periodo).toEqual({ modo: 'tutto' }))
  it('un intervallo di un giorno solo è leggibile', () =>
    expect(leggi('per=2026-10-01_2026-10-01').periodo).toEqual({ modo: 'intervallo', da: '2026-10-01', a: '2026-10-01' }))
  it('un parametro che non è dello strumento (o manca) diventa il primo disegnabile', () => {
    expect(leggi(`s=${sAltezza.id}&p=${palchi.id}`).parametroId).toBe(altezza.id)
    expect(leggi(`s=${sFeno.id}`).parametroId).toBe(palchi.id)
    expect(leggi(`s=${sFeno.id}&p=boh`).parametroId).toBe(palchi.id)
  })
  it('il testo si può scegliere apposta; uno strumento senza parametri disegnabili prende il primo', () => {
    expect(leggi(`s=${sFeno.id}&p=${note.id}`).parametroId).toBe(note.id)
    expect(leggi(`s=${sDiario.id}`).parametroId).toBe(note.id)
  })
  it('il testo cercato resta com\'è scritto', () => expect(leggi('cerca=3%2C%20').cercato).toBe('3, '))
  it('una URL con una ricerca enorme viene limitata', () => {
    const enorme = Array.from({ length: 5000 }, (_, i) => String(i)).join(',')
    const letto = leggi(`cerca=${encodeURIComponent(enorme)}`).cercato
    expect(letto.split(',').length).toBe(MASSIMO_PEZZI_CERCA)
    expect(letto).toBe(enorme.split(',').slice(0, MASSIMO_PEZZI_CERCA).join(','))
  })
})

describe('filtri attivi e azzeramento', () => {
  it('strumento e parametro non sono filtri', () => expect(haFiltriAttivi(filtri())).toBe(false))
  it.each<[string, Partial<FiltriDataset>]>([
    ['un trattamento', { trattamentoIds: [tCN.id] }],
    ['un livello', { livelloIds: [stress.livelli[1].id] }],
    ['un periodo', { periodo: { modo: 'settimane', n: 4 } }],
    ['una ricerca', { cercato: '3' }],
  ])('%s è un filtro', (_nome, extra) => expect(haFiltriAttivi(filtri(extra))).toBe(true))
  it('una ricerca di soli spazi non conta', () => expect(haFiltriAttivi(filtri({ cercato: '  ' }))).toBe(false))
  it('senzaFiltri toglie i filtri e tiene strumento e parametro', () => {
    const f = filtri({ trattamentoIds: [tCN.id], livelloIds: [stress.livelli[1].id], periodo: { modo: 'settimane', n: 2 }, cercato: '3' })
    expect(senzaFiltri(f)).toEqual(filtri())
  })
})

describe('limitaCerca', () => {
  it('un testo corto resta com\'è', () => expect(limitaCerca('3, 12,  A4')).toBe('3, 12,  A4'))
  it('al massimo 200 pezzi: i primi', () => {
    const pezzi = Array.from({ length: MASSIMO_PEZZI_CERCA + 5 }, (_, i) => `P${i}`)
    expect(limitaCerca(pezzi.join(','))).toBe(pezzi.slice(0, MASSIMO_PEZZI_CERCA).join(','))
    expect(limitaCerca(pezzi.slice(0, MASSIMO_PEZZI_CERCA).join(','))).toBe(pezzi.slice(0, MASSIMO_PEZZI_CERCA).join(','))
  })
  it('al massimo 2000 caratteri, senza lasciare un pezzo tagliato a metà (cercherebbe un\'altra pianta)', () => {
    const lungo = Array.from({ length: 100 }, () => 'x'.repeat(29)).join(',')
    const limitato = limitaCerca(lungo)
    expect(limitato.length).toBeLessThanOrEqual(MASSIMO_CARATTERI_CERCA)
    expect(limitato.length).toBeGreaterThan(MASSIMO_CARATTERI_CERCA - 31)
    expect(limitato.endsWith(',')).toBe(false)
    expect(limitato.split(',').every(x => x === 'x'.repeat(29))).toBe(true)
  })
  it('un unico pezzo più lungo del limite non cerca niente', () => expect(limitaCerca('9'.repeat(MASSIMO_CARATTERI_CERCA + 1))).toBe(''))
  it('un taglio che cade proprio su una virgola tiene il pezzo intero', () => {
    const testo = `${'a'.repeat(MASSIMO_CARATTERI_CERCA)},b`
    expect(limitaCerca(testo)).toBe('a'.repeat(MASSIMO_CARATTERI_CERCA))
  })
})

describe('periodo da oggi e fine', () => {
  it('le 4 settimane di un esperimento concluso finiscono all\'ultima misura', () => {
    const fine = fineDelleSettimane('concluso', '2026-11-02', '2026-06-30')
    expect(intervalloDelPeriodo({ modo: 'settimane', n: 4 }, fine)).toEqual({ da: '2026-06-03', a: '2026-06-30' })
  })
})
