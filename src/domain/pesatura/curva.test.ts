import { describe, expect, it } from 'vitest'
import {
  adattaCurva,
  consultaPerCC,
  consultaPerLettura,
  curvePerSubstrato,
  deficitInMl,
  equazione,
  intestazioniLetturaCC,
  letturaAPercentuale,
  mediaDeiParametri,
  modelloPer,
  parametriDelSubstrato,
  PERCENTUALI_TABELLA,
  pccDaLettura,
  sogliaDelSubstrato,
  vasiDaPesi,
  type Curva,
  type PuntoCurva,
  type Vaso,
} from './curva'
import type { CampionePesatura, Peso, TipoPeso } from './tipi'

function campione(id: string, substrato: string | null, ordine = 0): CampionePesatura {
  return { id, sessione_id: 's1', pianta_id: null, nome: id.toUpperCase(), substrato, ordine }
}

let contatore = 0
function peso(campione_id: string, tipo: TipoPeso, valore: number, lettura: number | null = null, misurato_il = '2026-11-11T10:00:00Z', replica = 1): Peso {
  contatore += 1
  return { id: `p${contatore}`, campione_id, replica, tipo, valore, lettura, misurato_il }
}

const punti = (xs: number[], f: (x: number) => number): PuntoCurva[] => xs.map((x) => ({ lettura: x, pcc: f(x) }))
const coppie = (hs: number[], wcs: number[]): PuntoCurva[] => hs.map((h, i) => ({ lettura: h, pcc: wcs[i] }))

/** Un vaso con secco 1800 e CC 2600 e i punti di y = 10 + 2x su x = 1..4 (in % CC). */
function vaso(id: string, substrato: string | null, opzioni: Partial<Vaso> = {}): Vaso {
  return {
    campione: campione(id, substrato),
    secco: 1800,
    cc: 2600,
    letturaCC: null,
    punti: punti([1, 2, 3, 4], (x) => 10 + 2 * x),
    ...opzioni,
  }
}

// I due vasi di riferimento: i valori attesi vengono da `scipy.optimize.curve_fit` su WC = a · h^b.
const PUNTI_A = coppie([23.7, 23.9, 26.7, 42.9, 61.2], [100, 93.2, 86.5, 71.1, 51.9])
const PUNTI_B = coppie([9.9, 15.5, 19.8, 30.7, 32.9, 64.3], [100, 92.7, 86.3, 76.3, 73.6, 55.5])
const vasoA = (opzioni: Partial<Vaso> = {}) => vaso('a', 'HC', { punti: PUNTI_A, letturaCC: 23.7, ...opzioni })
const vasoB = (opzioni: Partial<Vaso> = {}) => vaso('b', 'HC', { punti: PUNTI_B, letturaCC: 9.9, ...opzioni })

/** Uguale ad `atteso` entro 4 cifre significative. */
const circa = (valore: number | null | undefined, atteso: number) => expect((valore as number) / atteso).toBeCloseTo(1, 4)

describe('adattaCurva', () => {
  it('lineare: punti esatti y = 10 + 2x', () => {
    const c = adattaCurva(punti([1, 2, 3, 4], (x) => 10 + 2 * x), 'lineare')
    expect(c).not.toBeNull()
    expect(c!.modello).toBe('lineare')
    expect(c!.a).toBeCloseTo(10)
    expect(c!.b).toBeCloseTo(2)
    expect(c!.r2).toBeCloseTo(1)
    expect(c!.n).toBe(4)
    expect(c!.min).toBe(1)
    expect(c!.max).toBe(4)
  })

  it('potenza: il vaso A come curve_fit', () => {
    const c = adattaCurva(PUNTI_A, 'potenza')
    expect(c!.modello).toBe('potenza')
    circa(c!.a, 649.1709)
    circa(c!.b, -0.603303)
    circa(c!.r2, 0.966057)
    expect(c!.n).toBe(5)
    expect(c!.min).toBe(23.7)
    expect(c!.max).toBe(61.2)
  })

  it('potenza: il vaso B come curve_fit', () => {
    const c = adattaCurva(PUNTI_B, 'potenza')
    circa(c!.a, 202.2677)
    circa(c!.b, -0.293121)
    circa(c!.r2, 0.966054)
    expect(c!.n).toBe(6)
  })

  it('potenza: le letture negative danno la stessa curva, con min e max su |h|', () => {
    const c = adattaCurva(PUNTI_A.map((p) => ({ lettura: -p.lettura, pcc: p.pcc })), 'potenza')
    circa(c!.a, 649.1709)
    circa(c!.b, -0.603303)
    circa(c!.r2, 0.966057)
    expect(c!.min).toBe(23.7)
    expect(c!.max).toBe(61.2)
  })

  it('potenza: punti esatti y = 200·x^−0,5 (nessun passo migliora più: è il minimo e la curva c\'è)', () => {
    const c = adattaCurva(punti([4, 16, 25, 100], (x) => 200 * x ** -0.5), 'potenza')
    expect(c!.a).toBeCloseTo(200, 6)
    expect(c!.b).toBeCloseTo(-0.5, 8)
    expect(c!.r2).toBeCloseTo(1, 9)
  })

  it('potenza: un adattamento che non converge non dà curva', () => {
    // dati a gradino: a e b scappano verso l'infinito e la somma dei quadrati continua a calare
    expect(adattaCurva(coppie([10, 11, 12], [100, 0.01, 0.01]), 'potenza')).toBeNull()
    expect(adattaCurva(coppie([10, 20, 30, 40], [100, 0.5, -0.5, 0.2]), 'potenza')).toBeNull()
  })

  it('potenza: scarta le letture a zero', () => {
    const c = adattaCurva([{ lettura: 0, pcc: 100 }, ...PUNTI_A], 'potenza')
    circa(c!.a, 649.1709)
    expect(c!.n).toBe(5)
  })

  it('potenza: servono 3 |h| distinte (−10 e 10 sono la stessa)', () => {
    expect(adattaCurva(punti([-10, 10, 20], (x) => 100 - Math.abs(x)), 'potenza')).toBeNull()
  })

  it('potenza: gli zeri scartati possono far mancare i punti', () => {
    expect(adattaCurva(punti([0, 5, 10], (x) => 100 - x), 'potenza')).toBeNull()
  })

  it('con 2 punti restituisce null', () => {
    expect(adattaCurva(punti([1, 2], (x) => x), 'lineare')).toBeNull()
  })

  it('servono 3 x distinte: punti ripetuti non bastano', () => {
    expect(adattaCurva([{ lettura: 1, pcc: 1 }, { lettura: 1, pcc: 2 }, { lettura: 2, pcc: 3 }], 'lineare')).toBeNull()
  })

  it('R² è null se tutte le y sono uguali', () => {
    const c = adattaCurva(punti([1, 2, 3], () => 50), 'lineare')
    expect(c!.b).toBeCloseTo(0)
    expect(c!.r2).toBeNull()
  })

  it('R² minore di 1 con punti non allineati', () => {
    const c = adattaCurva([{ lettura: 1, pcc: 1 }, { lettura: 2, pcc: 3 }, { lettura: 3, pcc: 2 }], 'lineare')
    expect(c!.b).toBeCloseTo(0.5)
    expect(c!.r2).toBeCloseTo(0.25)
  })
})

describe('pccDaLettura, letturaAPercentuale e modelloPer', () => {
  it('valuta la curva', () => {
    expect(pccDaLettura({ modello: 'lineare', a: 10, b: 2, r2: 1, n: 4, min: 1, max: 4 }, 3)).toBeCloseTo(16)
    expect(pccDaLettura({ modello: 'potenza', a: 200, b: -0.5, r2: 1, n: 4, min: 4, max: 100 }, -16)).toBeCloseTo(50)
  })

  it('la lettura a cui la curva dà il 100 %', () => {
    circa(letturaAPercentuale(adattaCurva(PUNTI_A, 'potenza')!, 100), 22.2085)
    circa(letturaAPercentuale(adattaCurva(PUNTI_B, 'potenza')!, 100), 11.0583)
    expect(letturaAPercentuale({ modello: 'lineare', a: 10, b: 2, r2: 1, n: 4, min: 1, max: 4 }, 16)).toBeCloseTo(3)
  })

  it('null quando la lettura non esiste', () => {
    const potenza: Curva = { modello: 'potenza', a: 200, b: -0.5, r2: 1, n: 4, min: 4, max: 100 }
    expect(letturaAPercentuale(potenza, 0)).toBeNull()
    expect(letturaAPercentuale({ ...potenza, a: -200 }, 50)).toBeNull()
    expect(letturaAPercentuale({ ...potenza, b: 0 }, 50)).toBeNull()
    expect(letturaAPercentuale({ modello: 'lineare', a: 10, b: 0, r2: null, n: 3, min: 1, max: 3 }, 50)).toBeNull()
  })

  it('tensione → potenza, umidità → lineare', () => {
    expect(modelloPer({ tipo: 'tensione', unita: 'kPa' })).toBe('potenza')
    expect(modelloPer({ tipo: 'tdr', unita: '%' })).toBe('lineare')
  })
})

describe('mediaDeiParametri', () => {
  const c = (a: number, b: number, r2: number | null, n: number, min: number, max: number): Curva => ({ modello: 'potenza', a, b, r2, n, min, max })

  it('a media geometrica, b e R² medi, n sommati, min e max estremi', () => {
    const m = mediaDeiParametri([c(600, -0.6, 0.9, 5, 20, 60), c(200, -0.2, 0.8, 6, 10, 70)])
    expect(m!.modello).toBe('potenza')
    expect(m!.a).toBeCloseTo(Math.sqrt(600 * 200))
    expect(m!.b).toBeCloseTo(-0.4)
    expect(m!.r2).toBeCloseTo(0.85)
    expect(m!.n).toBe(11)
    expect(m!.min).toBe(10)
    expect(m!.max).toBe(70)
  })

  it('R² medio dei soli R² che ci sono; null se non ce n\'è nessuno', () => {
    expect(mediaDeiParametri([c(600, -0.6, 0.9, 5, 20, 60), c(200, -0.2, null, 6, 10, 70)])!.r2).toBeCloseTo(0.9)
    expect(mediaDeiParametri([c(600, -0.6, null, 5, 20, 60)])!.r2).toBeNull()
  })

  it('i vasi A–D della tesi: WC = 362 · h^−0,4464, con il 60 % CC a 56 hPa e il 50 % a 84 hPa', () => {
    const m = mediaDeiParametri([
      c(660.83, -0.6093, 0.966, 6, 17, 61), c(201.8, -0.2926, 0.965, 6, 9.9, 64),
      c(332.47, -0.4088, 0.959, 6, 17.8, 50), c(386.85, -0.4752, 0.978, 6, 17.1, 51),
    ])!
    expect(m.a).toBeCloseTo(361.89, 2)
    expect(m.b).toBeCloseTo(-0.446475, 6)
    expect(letturaAPercentuale(m, 60)).toBeCloseTo(55.97, 2)
    expect(letturaAPercentuale(m, 50)).toBeCloseTo(84.2, 1)
  })

  it('senza curve è null', () => {
    expect(mediaDeiParametri([])).toBeNull()
  })
})

describe('equazione', () => {
  it('potenza: a con 2 decimali, b con 4, R² con 3, e l\'unità di h', () => {
    const c = adattaCurva(PUNTI_A, 'potenza')!
    expect(equazione(c, { tipo: 'tensione', unita: 'hPa' })).toBe('WC = 649,17 · h^−0,6033  (h in hPa; R² 0,966, n 5)')
  })

  it('potenza senza unità e senza R²', () => {
    const c = adattaCurva(PUNTI_A, 'potenza')!
    expect(equazione(c, { tipo: 'tensione', unita: ' ' })).toBe('WC = 649,17 · h^−0,6033  (R² 0,966, n 5)')
    expect(equazione({ ...c, r2: null, b: 0.25 }, { tipo: 'tensione', unita: 'kPa' })).toBe('WC = 649,17 · h^0,2500  (h in kPa; n 5)')
  })

  it('lineare con pendenza positiva e R² assente', () => {
    const c = { modello: 'lineare' as const, a: 10, b: 2, r2: null, n: 3, min: 1, max: 3 }
    expect(equazione(c, { tipo: 'tdr', unita: '%' })).toBe('%CC = 2,000 · TDR + 10,00  (n 3)')
  })

  it('lineare con la virgola decimale e il segno meno', () => {
    const c = { modello: 'lineare' as const, a: 112.43, b: -18.27, r2: 0.9712, n: 14, min: 5, max: 70 }
    expect(equazione(c, { tipo: 'tdr', unita: '%' })).toBe('%CC = −18,27 · TDR + 112,4  (R² 0,971, n 14)')
  })
})

describe('vasiDaPesi', () => {
  it('prende secco e CC della replica 1 e i punti di asciugatura con lettura, in ordine di tempo', () => {
    const pesi = [
      peso('v1', 'secco', 1800),
      peso('v1', 'capacita_campo', 2600),
      peso('v1', 'secco', 9999, null, '2026-11-11T10:00:00Z', 2),
      peso('v1', 'asciugatura', 2200, 30, '2026-11-13T10:00:00Z'),
      peso('v1', 'asciugatura', 2400, 10, '2026-11-12T10:00:00Z'),
      peso('v1', 'asciugatura', 2300, null, '2026-11-12T18:00:00Z'),
    ]
    const [v] = vasiDaPesi([campione('v1', 'HC')], pesi)
    expect(v.secco).toBe(1800)
    expect(v.cc).toBe(2600)
    expect(v.punti).toHaveLength(2)
    expect(v.punti[0]).toEqual({ lettura: 10, pcc: 75 })
    expect(v.punti[1]).toEqual({ lettura: 30, pcc: 50 })
  })

  it('la CC con la lettura è il primo punto, al 100 %', () => {
    const pesi = [
      peso('v1', 'secco', 1800),
      peso('v1', 'capacita_campo', 2600, 23.7, '2026-11-11T10:00:00Z'),
      peso('v1', 'asciugatura', 2400, 30, '2026-11-12T10:00:00Z'),
    ]
    const [v] = vasiDaPesi([campione('v1', 'HC')], pesi)
    expect(v.letturaCC).toBe(23.7)
    expect(v.punti).toEqual([{ lettura: 23.7, pcc: 100 }, { lettura: 30, pcc: 75 }])
  })

  it('la CC senza lettura (sessioni vecchie) non dà il punto al 100 %', () => {
    const pesi = [peso('v1', 'secco', 1800), peso('v1', 'capacita_campo', 2600), peso('v1', 'asciugatura', 2400, 30, '2026-11-12T10:00:00Z')]
    const [v] = vasiDaPesi([campione('v1', 'HC')], pesi)
    expect(v.letturaCC).toBeNull()
    expect(v.punti).toEqual([{ lettura: 30, pcc: 75 }])
  })

  it('con una CC che non supera il secco nessun punto, nemmeno quello a CC', () => {
    const pesi = [peso('v1', 'secco', 2600), peso('v1', 'capacita_campo', 2600, 23.7), peso('v1', 'asciugatura', 2400, 30)]
    const [v] = vasiDaPesi([campione('v1', 'HC')], pesi)
    expect(v.letturaCC).toBe(23.7)
    expect(v.punti).toEqual([])
  })

  it('senza secco o senza CC il vaso non ha punti', () => {
    const pesi = [peso('v1', 'capacita_campo', 2600, 20), peso('v1', 'asciugatura', 2200, 30), peso('v2', 'secco', 1800), peso('v2', 'asciugatura', 2200, 30)]
    const [v1, v2] = vasiDaPesi([campione('v1', 'HC'), campione('v2', 'HC')], pesi)
    expect(v1.secco).toBeNull()
    expect(v1.cc).toBe(2600)
    expect(v1.punti).toEqual([])
    expect(v2.cc).toBeNull()
    expect(v2.letturaCC).toBeNull()
    expect(v2.punti).toEqual([])
  })
})

describe('curvePerSubstrato', () => {
  it('raggruppa due vasi "HC" e un vaso "Ctrl", con la curva media lineare delle rette dei vasi', () => {
    const vasi = [
      vaso('a', 'HC'),
      vaso('b', 'Ctrl'),
      vaso('c', 'HC', { punti: punti([5, 6], (x) => 10 + 2 * x) }),
    ]
    const gruppi = curvePerSubstrato(vasi, 'lineare')
    expect(gruppi.map((g) => g.substrato)).toEqual(['HC', 'Ctrl'])
    expect(gruppi[0].vasi.map((v) => v.campione.id)).toEqual(['a', 'c'])
    // il vaso "c" ha solo 2 punti: non ha retta e la media usa quella di "a"
    expect(gruppi[0].curve[1]).toBeNull()
    expect(gruppi[0].media!.n).toBe(4)
    expect(gruppi[0].media!.max).toBe(4)
    expect(gruppi[1].vasi.map((v) => v.campione.id)).toEqual(['b'])
    expect(gruppi[1].media!.n).toBe(4)
  })

  it('la curva di ogni vaso, nell\'ordine dei vasi', () => {
    const [g] = curvePerSubstrato([vasoA(), vasoB()], 'potenza')
    expect(g.curve).toHaveLength(2)
    circa(g.curve[0]!.a, 649.1709)
    circa(g.curve[1]!.a, 202.2677)
  })

  it('potenza: la curva media è la media in scala logaritmica delle curve dei vasi', () => {
    const [g] = curvePerSubstrato([vasoA(), vasoB()], 'potenza')
    const m = g.media!
    expect(m.modello).toBe('potenza')
    circa(m.a, 362.3621)
    circa(m.b, -0.448212)
    circa(m.r2, 0.966055)
    expect(m.n).toBe(11)
    circa(letturaAPercentuale(m, 100), 17.6806)
    circa(pccDaLettura(m, 40), 69.3555)
  })

  it('un vaso il cui adattamento non converge non ha curva e la media usa gli altri', () => {
    const gradino = vaso('d', 'HC', { punti: coppie([10, 20, 30, 40], [100, 0.5, -0.5, 0.2]) })
    const [g] = curvePerSubstrato([vasoA(), gradino], 'potenza')
    expect(g.curve[1]).toBeNull()
    circa(g.media!.a, 649.1709)
    circa(g.media!.b, -0.603303)
    expect(g.media!.n).toBe(5)
  })

  it('un vaso con 2 h distinte non ha curva e la media usa gli altri', () => {
    const [g] = curvePerSubstrato([vasoA(), vaso('c', 'HC', { punti: coppie([10, 10, 20], [100, 95, 80]) })], 'potenza')
    expect(g.curve[1]).toBeNull()
    circa(g.media!.a, 649.1709)
    circa(g.media!.b, -0.603303)
    expect(g.media!.n).toBe(5)
  })

  it('substrato vuoto o null → "Senza substrato"; media null se mancano i punti', () => {
    const gruppi = curvePerSubstrato([vaso('a', null, { punti: [] }), vaso('b', '  ', { punti: [] })], 'lineare')
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0].substrato).toBe('Senza substrato')
    expect(gruppi[0].vasi).toHaveLength(2)
    expect(gruppi[0].curve).toEqual([null, null])
    expect(gruppi[0].media).toBeNull()
  })

  it('potenza: substrato senza curve → media null', () => {
    const [g] = curvePerSubstrato([vaso('a', 'HC', { punti: [] })], 'potenza')
    expect(g.curve).toEqual([null])
    expect(g.media).toBeNull()
  })
})

describe('parametriDelSubstrato', () => {
  it('una riga per vaso e la riga della curva media', () => {
    const [g] = curvePerSubstrato([vasoA(), vasoB()], 'potenza')
    const righe = parametriDelSubstrato(g)
    expect(righe.map((r) => r.nome)).toEqual(['A', 'B', 'Curva media'])
    expect(righe.map((r) => r.media)).toEqual([false, false, true])
    const [a, , media] = righe
    circa(a.a, 649.1709)
    circa(a.b, -0.603303)
    circa(a.r2, 0.966057)
    expect(a.n).toBe(5)
    circa(a.letturaCCCurva, 22.2085)
    expect(a.letturaCCMisurata).toBe(23.7)
    circa(media.a, 362.3621)
    circa(media.b, -0.448212)
    circa(media.r2, 0.966055)
    expect(media.n).toBe(11)
    circa(media.letturaCCCurva, 17.6806)
    expect(media.letturaCCMisurata).toBeNull()
  })

  it('il nome è quello del campione o, se manca, l\'id', () => {
    const senzaNome = vasoB({ campione: { ...campione('b', 'HC'), nome: '  ' } })
    const [g] = curvePerSubstrato([vasoA(), senzaNome], 'potenza')
    expect(parametriDelSubstrato(g).map((r) => r.nome)).toEqual(['A', 'b', 'Curva media'])
  })

  it('un vaso senza curva ha i parametri null; la lettura misurata resta', () => {
    const [g] = curvePerSubstrato([vasoA(), vaso('c', 'HC', { punti: coppie([10, 20], [100, 80]), letturaCC: 10 })], 'potenza')
    const [, c] = parametriDelSubstrato(g)
    expect(c).toMatchObject({ nome: 'C', a: null, b: null, r2: null, letturaCCCurva: null, letturaCCMisurata: 10, media: false })
  })

  it('con il tensiometro la lettura misurata a CC è in valore assoluto, come la curva', () => {
    const negativo = vasoA({ punti: PUNTI_A.map((p) => ({ lettura: -p.lettura, pcc: p.pcc })), letturaCC: -23.7 })
    const [g] = curvePerSubstrato([negativo], 'potenza')
    expect(parametriDelSubstrato(g)[0].letturaCCMisurata).toBe(23.7)
  })

  it('con il tensiometro e nessuna curva la lettura misurata è comunque in valore assoluto', () => {
    const [g] = curvePerSubstrato([vaso('c', 'HC', { punti: coppie([10, 20], [100, 80]), letturaCC: -23.7 })], 'potenza')
    expect(g.media).toBeNull()
    expect(g.modello).toBe('potenza')
    expect(parametriDelSubstrato(g)[0].letturaCCMisurata).toBe(23.7)
  })


  it('senza nessuna curva non c\'è la riga media', () => {
    const [g] = curvePerSubstrato([vaso('a', 'HC', { punti: [] })], 'potenza')
    const righe = parametriDelSubstrato(g)
    expect(righe).toHaveLength(1)
    expect(righe[0].media).toBe(false)
  })
})

describe('consultaPerCC', () => {
  it('peso di ogni vaso a p % CC e media del substrato', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC'), vaso('b', 'HC', { secco: 2000, cc: 3000 }), vaso('c', 'Ctrl')], 'lineare')
    const [hc, ctrl] = consultaPerCC(gruppi, 50)
    expect(hc.substrato).toBe('HC')
    expect(hc.vasi).toEqual([
      { vaso: 'a', peso: 2200, fuoriCampo: false },
      { vaso: 'b', peso: 2500, fuoriCampo: false },
    ])
    expect(hc.media).toBeCloseTo(2350)
    expect(hc.fuoriCampo).toBe(false)
    expect(ctrl.media).toBeCloseTo(2200)
  })

  it('un vaso senza secco dà peso null e resta fuori dalla media', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC'), vaso('b', 'HC', { secco: null, punti: [] })], 'lineare')
    const [hc] = consultaPerCC(gruppi, 50)
    expect(hc.vasi[1]).toEqual({ vaso: 'b', peso: null, fuoriCampo: false })
    expect(hc.media).toBeCloseTo(2200)
  })

  it('un vaso con CC non maggiore del secco dà peso null', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC'), vaso('b', 'HC', { secco: 2600, cc: 2600, punti: [] }), vaso('c', 'HC', { secco: 2600, cc: 2000, punti: [] })], 'lineare')
    const [hc] = consultaPerCC(gruppi, 50)
    expect(hc.vasi.map((v) => v.peso)).toEqual([2200, null, null])
    expect(hc.media).toBeCloseTo(2200)
  })

  it('media null se nessun vaso ha secco e CC', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC', { cc: null, punti: [] })], 'lineare')
    expect(consultaPerCC(gruppi, 50)[0].media).toBeNull()
  })

  it('la tabella usa 100, 80, 60, 50, 40', () => {
    expect([...PERCENTUALI_TABELLA]).toEqual([100, 80, 60, 50, 40])
  })
})

describe('consultaPerLettura', () => {
  // curva del vaso: pcc = 10 + 2·lettura, su letture 1..4
  it('usa la curva del vaso dentro i valori misurati', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC')], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 2.5)
    // pcc 15 → 1800 + 0,15 × 800 = 1920
    expect(hc.vasi[0].peso).toBeCloseTo(1920)
    expect(hc.vasi[0].fuoriCampo).toBe(false)
    expect(hc.media).toBeCloseTo(1920)
    expect(hc.fuoriCampo).toBe(false)
  })

  it('una lettura fuori da [min, max] dà fuoriCampo: true', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC')], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 10)
    // pcc 30 → 1800 + 0,30 × 800 = 2040, estrapolato
    expect(hc.vasi[0].peso).toBeCloseTo(2040)
    expect(hc.vasi[0].fuoriCampo).toBe(true)
    expect(hc.fuoriCampo).toBe(true)
  })

  it('senza curva propria il vaso usa la curva media del substrato', () => {
    const gruppi = curvePerSubstrato(
      [vaso('a', 'HC'), vaso('b', 'HC', { punti: punti([3, 4], (x) => 10 + 2 * x) })],
      'lineare',
    )
    const [hc] = consultaPerLettura(gruppi, 2.5)
    expect(hc.vasi.map((v) => v.peso)).toEqual([expect.closeTo(1920), expect.closeTo(1920)])
    expect(hc.vasi.every((v) => !v.fuoriCampo)).toBe(true)
  })

  it('senza curva il peso è null', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC', { punti: [] })], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 2.5)
    expect(hc.vasi[0]).toEqual({ vaso: 'a', peso: null, fuoriCampo: false })
    expect(hc.media).toBeNull()
  })

  it('un vaso senza secco dà peso null anche con la curva media', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC'), vaso('b', 'HC', { secco: null, punti: [] })], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 2.5)
    expect(hc.vasi[1].peso).toBeNull()
    expect(hc.media).toBeCloseTo(1920)
  })

  it('un vaso con CC non maggiore del secco dà peso null anche con la curva media', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC'), vaso('b', 'HC', { secco: 2600, cc: 2000, punti: [] })], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 10)
    expect(hc.vasi[1]).toEqual({ vaso: 'b', peso: null, fuoriCampo: false })
    expect(hc.media).toBeCloseTo(2040)
  })

  it('tensiometro: una lettura negativa si usa in valore assoluto e non è fuori campo', () => {
    const gruppi = curvePerSubstrato([vasoA()], 'potenza')
    const [meno] = consultaPerLettura(gruppi, -40)
    const [piu] = consultaPerLettura(gruppi, 40)
    // pcc = 649,17 · 40^−0,6033 ≈ 70,1 → 1800 + 0,701 × 800
    expect(meno.vasi[0].peso).toBeCloseTo(1800 + (pccDaLettura(gruppi[0].curve[0]!, 40) / 100) * 800)
    expect(meno.vasi[0].peso).toBeCloseTo(piu.vasi[0].peso as number)
    expect(meno.vasi[0].fuoriCampo).toBe(false)
    expect(consultaPerLettura(gruppi, -70)[0].vasi[0].fuoriCampo).toBe(true)
  })

  it('tensiometro: una lettura a zero non dà un peso infinito', () => {
    const gruppi = curvePerSubstrato([vasoA()], 'potenza')
    const [hc] = consultaPerLettura(gruppi, 0)
    expect(hc.vasi[0].peso).toBeNull()
    expect(hc.media).toBeNull()
  })
})

// Il TDR: vasi veri, con valori da `numpy.polyfit` (la retta di ogni vaso con la CC al 100 %).
function vasoTDR(id: string, secco: number, cc: number, letturaCC: number, asciugatura: [number, number][]): Vaso {
  const pesi = [
    peso(id, 'secco', secco),
    peso(id, 'capacita_campo', cc, letturaCC),
    ...asciugatura.map(([p, l], i) => peso(id, 'asciugatura', p, l, `2026-11-1${i + 1}T10:00:00Z`)),
  ]
  return vasiDaPesi([campione(id, 'S')], pesi)[0]
}
const T1 = () => vasoTDR('t1', 750, 4850, 54, [[4030, 44.8], [3210, 35.2], [2390, 26.0], [1570, 17.5]])
const T2 = () => vasoTDR('t2', 1000, 2000, 50, [[1750, 40], [1520, 30], [1300, 20]])
const TDR_RAW = { tipo: 'tdr' as const, unita: 'raw' }

describe('retta media e soglie del TDR', () => {
  it('la retta di un vaso: CC al 100 %, m e q dei minimi quadrati', () => {
    const [g] = curvePerSubstrato([T1()], 'lineare')
    const c = g.curve[0]!
    circa(c.b, 2.177729)
    circa(c.a, -17.309389)
    circa(c.r2, 0.999578)
    expect(c.n).toBe(5)
  })

  it('la retta media è la media delle rette dei vasi (m e q aritmetici, R² medio, n sommato)', () => {
    const [g] = curvePerSubstrato([T1(), T2()], 'lineare')
    circa(g.curve[1]!.b, 2.33)
    circa(g.curve[1]!.a, -17.3)
    const m = g.media!
    circa(m.b, 2.253865)
    circa(m.a, -17.304695)
    circa(m.r2, 0.999366)
    expect(m.n).toBe(9)
  })

  it('la media lineare tiene il segno di q (media aritmetica, non geometrica)', () => {
    const c = (a: number, b: number): Curva => ({ modello: 'lineare', a, b, r2: 1, n: 3, min: 1, max: 3 })
    const m = mediaDeiParametri([c(-20, 2), c(-10, 4)])!
    expect(m.a).toBe(-15)
    expect(m.b).toBe(3)
  })

  it('soglia di un vaso: lettura dalla retta, peso e deficit dal suo secco e dalla sua CC', () => {
    const [g] = curvePerSubstrato([T1()], 'lineare')
    const s60 = sogliaDelSubstrato(g, 60)
    circa(s60.letturaTarget, 35.5)
    expect(s60.pcc).toBe(60)
    expect(s60.vasi).toEqual([{ vaso: 't1', pesoTarget: 3210, deficit: 1640 }])
    expect(s60.pesoMedio).toBe(3210)
    expect(s60.deficitMedio).toBe(1640)
    const s100 = sogliaDelSubstrato(g, 100)
    circa(s100.letturaTarget, 53.8678)
    expect(s100.vasi[0].deficit).toBe(0)
    const s50 = sogliaDelSubstrato(g, 50)
    circa(s50.letturaTarget, 30.9081)
    expect(s50.vasi[0].pesoTarget).toBe(2800)
    expect(s50.vasi[0].deficit).toBe(2050)
  })

  it('soglia di due vasi: lettura dalla retta media, peso e deficit medi dei vasi', () => {
    const [g] = curvePerSubstrato([T1(), T2()], 'lineare')
    const s = sogliaDelSubstrato(g, 60)
    circa(s.letturaTarget, 34.2987)
    expect(s.vasi.map((v) => v.pesoTarget)).toEqual([3210, 1600])
    expect(s.pesoMedio).toBe(2405)
    expect(s.deficitMedio).toBe(1020)
  })

  it('un vaso senza secco e CC non ha peso e non entra nelle medie', () => {
    const [g] = curvePerSubstrato([T1(), vasoTDR('t3', 1000, 1000, 50, [[1, 1]])], 'lineare')
    const s = sogliaDelSubstrato(g, 60)
    expect(s.vasi[1]).toEqual({ vaso: 't3', pesoTarget: null, deficit: null })
    expect(s.pesoMedio).toBe(3210)
    expect(s.deficitMedio).toBe(1640)
  })

  it('un vaso con letture tutte uguali non ha retta: lettura target null', () => {
    const piatto = vasoTDR('p', 750, 4850, 40, [[4030, 40], [3210, 40], [2390, 40]])
    const [g] = curvePerSubstrato([piatto], 'lineare')
    expect(g.media).toBeNull()
    const s = sogliaDelSubstrato(g, 60)
    expect(s.letturaTarget).toBeNull()
    expect(s.pesoMedio).toBe(3210)
  })

  it('pendenza negativa: la lettura target è finita e corretta', () => {
    const neg = vasoTDR('n', 1000, 2000, 10, [[1800, 20], [1500, 30], [1200, 40]])
    const [g] = curvePerSubstrato([neg], 'lineare')
    expect(g.media!.b).toBeLessThan(0)
    const t = sogliaDelSubstrato(g, 60).letturaTarget!
    expect(Number.isFinite(t)).toBe(true)
    circa(pccDaLettura(g.media!, t), 60)
  })

  it('pendenza nulla nella media: lettura target null', () => {
    const g = { ...curvePerSubstrato([T1()], 'lineare')[0], media: { modello: 'lineare' as const, a: 50, b: 0, r2: null, n: 3, min: 1, max: 3 } }
    expect(sogliaDelSubstrato(g, 60).letturaTarget).toBeNull()
  })

  it("deficitInMl: in grammi (o kg) è acqua in mL, altrimenti resta l'unità della sessione", () => {
    expect(deficitInMl(1640, 'g')).toEqual({ valore: 1640, unita: 'mL' })
    expect(deficitInMl(1.64, 'kg')).toEqual({ valore: 1640, unita: 'mL' })
    expect(deficitInMl(3.6, 'lb')).toEqual({ valore: 3.6, unita: 'lb' })
  })

  it('equazione del TDR: m e q a 4 cifre, R² a 3 decimali', () => {
    const [g] = curvePerSubstrato([T1()], 'lineare')
    expect(equazione(g.media!, { tipo: 'tdr', unita: 'raw' })).toBe('%CC = 2,178 · TDR − 17,31  (R² 1,000, n 5)')
    const c = { modello: 'lineare' as const, a: 10, b: 2, r2: null, n: 3, min: 1, max: 3 }
    expect(equazione(c, TDR_RAW)).toBe('%CC = 2,000 · TDR + 10,00  (n 3)')
    expect(equazione({ ...c, b: -0.5, a: -3 }, TDR_RAW)).toBe('%CC = −0,5000 · TDR − 3,000  (n 3)')
  })

  it('intestazioni della lettura a CC del TDR', () => {
    expect(intestazioniLetturaCC(TDR_RAW)).toEqual({ curva: 'TDR a CC, retta (raw)', misurato: 'TDR a CC, misurata (raw)' })
    expect(intestazioniLetturaCC({ tipo: 'tensione', unita: 'hPa' })).toEqual({ curva: 'h a CC, curva (hPa)', misurato: 'h a CC, misurato (hPa)' })
  })
})
