import { describe, expect, it } from 'vitest'
import {
  adattaCurva,
  consultaPerCC,
  consultaPerLettura,
  curvePerSubstrato,
  equazione,
  modelloPer,
  PERCENTUALI_TABELLA,
  pccDaLettura,
  vasiDaPesi,
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

/** Un vaso con secco 1800 e CC 2600 e i punti di y = 10 + 2x su x = 1..4 (in % CC). */
function vaso(id: string, substrato: string | null, opzioni: Partial<Vaso> = {}): Vaso {
  return {
    campione: campione(id, substrato),
    secco: 1800,
    cc: 2600,
    punti: punti([1, 2, 3, 4], (x) => 10 + 2 * x),
    ...opzioni,
  }
}

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

  it('logaritmico: punti esatti y = 100 − 20·ln x', () => {
    const c = adattaCurva(punti([5, 10, 20, 40], (x) => 100 - 20 * Math.log(x)), 'logaritmico')
    expect(c!.a).toBeCloseTo(100)
    expect(c!.b).toBeCloseTo(-20)
    expect(c!.r2).toBeCloseTo(1)
    expect(c!.min).toBe(5)
    expect(c!.max).toBe(40)
  })

  it('logaritmico: usa ln|x| e scarta le letture a zero', () => {
    const xs = [-5, -10, -20, -40]
    const c = adattaCurva([...punti(xs, (x) => 100 - 20 * Math.log(Math.abs(x))), { lettura: 0, pcc: 100 }], 'logaritmico')
    expect(c!.a).toBeCloseTo(100)
    expect(c!.b).toBeCloseTo(-20)
    expect(c!.n).toBe(4)
    expect(c!.min).toBe(-40)
    expect(c!.max).toBe(-5)
  })

  it('con 2 punti restituisce null', () => {
    expect(adattaCurva(punti([1, 2], (x) => x), 'lineare')).toBeNull()
  })

  it('servono 3 x distinte: punti ripetuti non bastano', () => {
    expect(adattaCurva([{ lettura: 1, pcc: 1 }, { lettura: 1, pcc: 2 }, { lettura: 2, pcc: 3 }], 'lineare')).toBeNull()
  })

  it('nel logaritmico gli zeri scartati possono far mancare i punti', () => {
    expect(adattaCurva(punti([0, 5, 10], (x) => x), 'logaritmico')).toBeNull()
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

describe('pccDaLettura e modelloPer', () => {
  it('valuta la curva', () => {
    expect(pccDaLettura({ modello: 'lineare', a: 10, b: 2, r2: 1, n: 4, min: 1, max: 4 }, 3)).toBeCloseTo(16)
    expect(pccDaLettura({ modello: 'logaritmico', a: 100, b: -20, r2: 1, n: 4, min: 5, max: 40 }, -10)).toBeCloseTo(100 - 20 * Math.log(10))
  })

  it('tensione → logaritmico, umidità → lineare', () => {
    expect(modelloPer({ tipo: 'tensione', unita: 'kPa' })).toBe('logaritmico')
    expect(modelloPer({ tipo: 'umidita', unita: '%' })).toBe('lineare')
  })
})

describe('equazione', () => {
  it('scrive la curva con la virgola decimale', () => {
    const c = { modello: 'logaritmico' as const, a: 112.43, b: -18.27, r2: 0.9712, n: 14, min: 5, max: 70 }
    expect(equazione(c, { tipo: 'tensione', unita: 'kPa' })).toBe('%CC = 112,4 − 18,3 · ln(kPa)  (R² 0,97, n 14)')
  })

  it('lineare con pendenza positiva e R² assente', () => {
    const c = { modello: 'lineare' as const, a: 10, b: 2, r2: null, n: 3, min: 1, max: 3 }
    expect(equazione(c, { tipo: 'umidita', unita: '%' })).toBe('%CC = 10,0 + 2,0 · %  (n 3)')
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

  it('senza secco o senza CC il vaso non ha punti', () => {
    const pesi = [peso('v1', 'capacita_campo', 2600), peso('v1', 'asciugatura', 2200, 30), peso('v2', 'secco', 1800), peso('v2', 'asciugatura', 2200, 30)]
    const [v1, v2] = vasiDaPesi([campione('v1', 'HC'), campione('v2', 'HC')], pesi)
    expect(v1.secco).toBeNull()
    expect(v1.cc).toBe(2600)
    expect(v1.punti).toEqual([])
    expect(v2.cc).toBeNull()
    expect(v2.punti).toEqual([])
  })
})

describe('curvePerSubstrato', () => {
  it('raggruppa due vasi "HC" e un vaso "Ctrl", con la curva media su tutti i punti', () => {
    const vasi = [
      vaso('a', 'HC'),
      vaso('b', 'Ctrl'),
      vaso('c', 'HC', { punti: punti([5, 6], (x) => 10 + 2 * x) }),
    ]
    const gruppi = curvePerSubstrato(vasi, 'lineare')
    expect(gruppi.map((g) => g.substrato)).toEqual(['HC', 'Ctrl'])
    expect(gruppi[0].vasi.map((v) => v.campione.id)).toEqual(['a', 'c'])
    expect(gruppi[0].media!.n).toBe(6)
    expect(gruppi[0].media!.max).toBe(6)
    expect(gruppi[1].vasi.map((v) => v.campione.id)).toEqual(['b'])
    expect(gruppi[1].media!.n).toBe(4)
  })

  it('substrato vuoto o null → "Senza substrato"; media null se mancano i punti', () => {
    const gruppi = curvePerSubstrato([vaso('a', null, { punti: [] }), vaso('b', '  ', { punti: [] })], 'lineare')
    expect(gruppi).toHaveLength(1)
    expect(gruppi[0].substrato).toBe('Senza substrato')
    expect(gruppi[0].vasi).toHaveLength(2)
    expect(gruppi[0].media).toBeNull()
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
    const [hc] = consultaPerLettura(gruppi, 2.5, 'lineare')
    // pcc 15 → 1800 + 0,15 × 800 = 1920
    expect(hc.vasi[0].peso).toBeCloseTo(1920)
    expect(hc.vasi[0].fuoriCampo).toBe(false)
    expect(hc.media).toBeCloseTo(1920)
    expect(hc.fuoriCampo).toBe(false)
  })

  it('una lettura fuori da [min, max] dà fuoriCampo: true', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC')], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 10, 'lineare')
    // pcc 30 → 1800 + 0,30 × 800 = 2040, estrapolato
    expect(hc.vasi[0].peso).toBeCloseTo(2040)
    expect(hc.vasi[0].fuoriCampo).toBe(true)
    expect(hc.fuoriCampo).toBe(true)
  })

  it('senza curva propria il vaso usa la curva media del substrato', () => {
    const gruppi = curvePerSubstrato(
      [vaso('a', 'HC', { punti: punti([1, 2], (x) => 10 + 2 * x) }), vaso('b', 'HC', { punti: punti([3, 4], (x) => 10 + 2 * x) })],
      'lineare',
    )
    const [hc] = consultaPerLettura(gruppi, 2.5, 'lineare')
    expect(hc.vasi.map((v) => v.peso)).toEqual([expect.closeTo(1920), expect.closeTo(1920)])
    expect(hc.vasi.every((v) => !v.fuoriCampo)).toBe(true)
  })

  it('senza curva il peso è null', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC', { punti: [] })], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 2.5, 'lineare')
    expect(hc.vasi[0]).toEqual({ vaso: 'a', peso: null, fuoriCampo: false })
    expect(hc.media).toBeNull()
  })

  it('un vaso senza secco dà peso null anche con la curva media', () => {
    const gruppi = curvePerSubstrato([vaso('a', 'HC'), vaso('b', 'HC', { secco: null, punti: [] })], 'lineare')
    const [hc] = consultaPerLettura(gruppi, 2.5, 'lineare')
    expect(hc.vasi[1].peso).toBeNull()
    expect(hc.media).toBeCloseTo(1920)
  })

  it('logaritmico: una lettura a zero non dà un peso infinito', () => {
    const v = vaso('a', 'HC', { punti: punti([5, 10, 20, 40], (x) => 100 - 20 * Math.log(x)) })
    const gruppi = curvePerSubstrato([v], 'logaritmico')
    const [hc] = consultaPerLettura(gruppi, 0, 'logaritmico')
    expect(hc.vasi[0].peso).toBeNull()
    expect(hc.media).toBeNull()
  })
})
