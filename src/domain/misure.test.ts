import { describe, it, expect } from 'vitest'
import {
  valoreVuoto, eVuoto, parametriDiUnaMisura, ultimoValore, mantenibile, valoriDaSalvare, valoriDeiParametri, valoriIniziali, validaMisura, contaPerPianta, raggruppaStoria, formattaValore, fuoriIntervallo,
} from './misure'
import type { ConfigEsperimento, ElementoLista, Misura, Strumento, ValoriMisura } from './tipi'
import { parametro } from './test-helpers'

const D = '2026-10-28'
const palchi = parametro('Palchi', {
  tipo: 'lista', progressivo: true,
  sotto_campi: [{ chiave: 'f', nome: 'Fiori', unita: null }],
})
const listaDueCampi = parametro('Grappoli', {
  tipo: 'lista',
  sotto_campi: [{ chiave: 'a', nome: 'A', unita: null }, { chiave: 'b', nome: 'B', unita: null }],
})
const tempAria = parametro('Temp. aria', { unita: '°C' })
const spad3 = parametro('SPAD', { n_letture: 3 })
const altezza = parametro('Altezza', { unita: 'cm', valore_min: 0, valore_max: 120 })
const note = parametro('Note', { tipo: 'testo' })
const siNo = parametro('Fioritura', { tipo: 'sino' })

let contatore = 0
/** Misura di test: pianta P1 e strumento "Fenologici" salvo diversa indicazione. */
function mis(data: string, ora: string, valori: ValoriMisura, extra: Partial<Misura> = {}): Misura {
  contatore += 1
  return { id: `m${contatore}`, pianta_id: 'P1', strumento_id: 'PA1', data_rilievo: data, ora, valori, ...extra }
}

describe('valoreVuoto', () => {
  it('uno per tipo', () => {
    expect(valoreVuoto(spad3)).toEqual([null, null, null])
    expect(valoreVuoto(altezza)).toEqual([null])
    expect(valoreVuoto(note)).toBe('')
    expect(valoreVuoto(siNo)).toBeNull()
    expect(valoreVuoto(palchi)).toEqual([])
  })
  it('restituisce istanze nuove a ogni chiamata', () => {
    const a = valoreVuoto(spad3) as (number | null)[]
    a[0] = 7
    expect(valoreVuoto(spad3)).toEqual([null, null, null])
  })
})

describe('eVuoto', () => {
  it('numero: vuoto se mancano valori o sono tutte null', () => {
    expect(eVuoto(spad3, undefined)).toBe(true)
    expect(eVuoto(spad3, [null, null, null])).toBe(true)
    expect(eVuoto(spad3, [null, 0, null])).toBe(false)   // 0 è un valore
    expect(eVuoto(altezza, [42])).toBe(false)
  })
  it('testo: vuoto se solo spazi', () => {
    expect(eVuoto(note, undefined)).toBe(true)
    expect(eVuoto(note, '')).toBe(true)
    expect(eVuoto(note, '  ')).toBe(true)
    expect(eVuoto(note, 'ok')).toBe(false)
  })
  it('sino: false è un valore, null no', () => {
    expect(eVuoto(siNo, undefined)).toBe(true)
    expect(eVuoto(siNo, null)).toBe(true)
    expect(eVuoto(siNo, false)).toBe(false)
    expect(eVuoto(siNo, true)).toBe(false)
  })
  it('lista: vuota se senza elementi', () => {
    expect(eVuoto(palchi, undefined)).toBe(true)
    expect(eVuoto(palchi, [])).toBe(true)
    expect(eVuoto(palchi, [{ n: 1, valori: { f: 5 } }])).toBe(false)
  })
})

describe('ultimoValore', () => {
  const uno = (n: number) => [n]
  it('prende il valore non vuoto più recente per (data, ora), non per posizione nell\'array', () => {
    const misure = [
      mis('2026-10-21', '10:00', { x: uno(2) }),
      mis('2026-10-14', '09:00', { x: uno(1) }),
      mis('2026-10-21', '08:00', { x: uno(0) }),
    ]
    expect(ultimoValore(misure, 'x', D)).toEqual([2])
  })
  it('a parità di data decide l\'ora', () => {
    const misure = [mis(D, '08:00', { x: uno(1) }), mis(D, '17:30', { x: uno(2) }), mis(D, '09:00', { x: uno(3) })]
    expect(ultimoValore(misure, 'x', D)).toEqual([2])
  })
  it('a parità di data e ora vince la misura che compare dopo nell\'array', () => {
    const prima = mis(D, '09:00', { x: uno(1) })
    const dopo = mis(D, '09:00', { x: uno(2) })
    expect(ultimoValore([prima, dopo], 'x', D)).toEqual([2])
    expect(ultimoValore([dopo, prima], 'x', D)).toEqual([1])
  })
  it('ignora le misure dopo finoA ma include il giorno stesso', () => {
    const misure = [mis('2026-10-27', '09:00', { x: uno(1) }), mis('2026-10-28', '09:00', { x: uno(2) }), mis('2026-10-29', '09:00', { x: uno(3) })]
    expect(ultimoValore(misure, 'x', '2026-10-28')).toEqual([2])
    expect(ultimoValore(misure, 'x', '2026-10-27')).toEqual([1])
    expect(ultimoValore(misure, 'x', '2026-10-26')).toBeUndefined()
  })
  it('ignora i valori vuoti anche se più recenti', () => {
    const misure = [
      mis('2026-10-14', '09:00', { x: [5] }),
      mis('2026-10-20', '09:00', { x: [null] }),
      mis('2026-10-21', '09:00', { x: [] }),
      mis('2026-10-22', '09:00', { x: '  ' }),
      mis('2026-10-23', '09:00', { x: null }),
      mis('2026-10-24', '09:00', {}),
    ]
    expect(ultimoValore(misure, 'x', D)).toEqual([5])
  })
  it('un sì/no false o uno 0 sono valori, non vuoti', () => {
    expect(ultimoValore([mis('2026-10-14', '09:00', { x: [9] }), mis('2026-10-15', '09:00', { x: [0] })], 'x', D)).toEqual([0])
    expect(ultimoValore([mis('2026-10-14', '09:00', { x: true }), mis('2026-10-15', '09:00', { x: false })], 'x', D)).toBe(false)
  })
  it('escludiId salta la misura indicata', () => {
    const a = mis('2026-10-14', '09:00', { x: [1] })
    const b = mis('2026-10-21', '09:00', { x: [2] })
    expect(ultimoValore([a, b], 'x', D, b.id)).toEqual([1])
    expect(ultimoValore([a], 'x', D, a.id)).toBeUndefined()
  })
  it('nessuna misura → undefined', () => expect(ultimoValore([], 'x', D)).toBeUndefined())
  it('è una copia profonda', () => {
    const m = mis('2026-10-14', '09:00', { x: [{ n: 1, valori: { f: 5 } }] })
    const v = ultimoValore([m], 'x', D) as ElementoLista[]
    v[0].valori.f = 99
    v.push({ n: 2, valori: {} })
    expect((m.valori.x as ElementoLista[])).toEqual([{ n: 1, valori: { f: 5 } }])
  })
})

describe('valoriIniziali', () => {
  it('progressivo riprende l\'ultimo valore della pianta, non quelli futuri', () => {
    const misure = [mis('2026-10-14', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 5 } }] }),
                    mis('2026-10-21', '10:00', { [palchi.id]: [{ n: 1, valori: { f: 6 } }, { n: 2, valori: { f: 3 } }] }),
                    mis('2026-10-28', '09:00', { [palchi.id]: [] })]           // vuoto: ignorato
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: '2026-10-27', mantenuti: {} })
    expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: 6 } }, { n: 2, valori: { f: 3 } }])
    ;(v[palchi.id] as ElementoLista[])[0].valori.f = 99
    expect((misure[1].valori[palchi.id] as ElementoLista[])[0].valori.f).toBe(6)   // copia profonda
  })
  it('progressivo: una misura vuota recente non nasconde l\'ultimo valore reale', () => {
    const misure = [mis('2026-10-14', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 5 } }] }),
                    mis('2026-10-26', '09:00', { [palchi.id]: [] })]
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: D, mantenuti: {} })
    expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: 5 } }])
  })
  it('progressivo: una misura di un giorno successivo non viene ripresa', () => {
    const misure = [mis('2026-10-29', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 8 } }] })]
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: D, mantenuti: {} })
    expect(v[palchi.id]).toEqual([])
  })
  it('mantenuti e vuoti', () => {
    const v = valoriIniziali({ parametri: [tempAria, spad3], misurePianta: [], dataRilievo: D, mantenuti: { [tempAria.id]: [24.5] } })
    expect(v).toEqual({ [tempAria.id]: [24.5], [spad3.id]: [null, null, null] })
  })
  it('mantenuti: copia, non riferimento', () => {
    const mantenuto = [24.5]
    const v = valoriIniziali({ parametri: [tempAria], misurePianta: [], dataRilievo: D, mantenuti: { [tempAria.id]: mantenuto } })
    ;(v[tempAria.id] as number[])[0] = 0
    expect(mantenuto).toEqual([24.5])
  })
  it('un valore mantenuto vale per un parametro qualsiasi di tipo numero, testo o sì/no', () => {
    const v = valoriIniziali({ parametri: [spad3, note, siNo], misurePianta: [], dataRilievo: D,
      mantenuti: { [spad3.id]: [1, 2, 3], [note.id]: 'sereno', [siNo.id]: false } })
    expect(v).toEqual({ [spad3.id]: [1, 2, 3], [note.id]: 'sereno', [siNo.id]: false })
  })
  it('un valore mantenuto di una lista si ignora', () => {
    const v = valoriIniziali({ parametri: [listaDueCampi], misurePianta: [], dataRilievo: D,
      mantenuti: { [listaDueCampi.id]: [{ n: 1, valori: { a: 1, b: 2 } }] } })
    expect(v[listaDueCampi.id]).toEqual([])
  })
  it('un valore mantenuto vuoto lascia il valore vuoto del parametro', () => {
    const v = valoriIniziali({ parametri: [tempAria, note, siNo], misurePianta: [], dataRilievo: D,
      mantenuti: { [tempAria.id]: [null], [note.id]: '  ', [siNo.id]: null } })
    expect(v).toEqual({ [tempAria.id]: [null], [note.id]: '', [siNo.id]: null })
  })
  it('un mantenuto vuoto non nasconde il progressivo', () => {
    const prog = parametro('Diametro', { progressivo: true })
    const misure = [mis('2026-10-14', '09:00', { [prog.id]: [7] })]
    const v = valoriIniziali({ parametri: [prog], misurePianta: misure, dataRilievo: D, mantenuti: { [prog.id]: [null] } })
    expect(v[prog.id]).toEqual([7])
  })
  it('precedenza: il mantenuto batte il progressivo, il progressivo batte il vuoto', () => {
    const prog = parametro('Diametro', { progressivo: true })
    const misure = [mis('2026-10-14', '09:00', { [prog.id]: [4] })]
    const conMantenuto = valoriIniziali({ parametri: [prog], misurePianta: misure, dataRilievo: D, mantenuti: { [prog.id]: [9] } })
    expect(conMantenuto[prog.id]).toEqual([9])
    const soloStoria = valoriIniziali({ parametri: [prog], misurePianta: misure, dataRilievo: D, mantenuti: {} })
    expect(soloStoria[prog.id]).toEqual([4])
    const niente = valoriIniziali({ parametri: [prog], misurePianta: [], dataRilievo: D, mantenuti: {} })
    expect(niente[prog.id]).toEqual([null])
  })
  it('la lista progressiva con un mantenuto di troppo usa il progressivo', () => {
    const misure = [mis('2026-10-14', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 4 } }] })]
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: D,
      mantenuti: { [palchi.id]: [{ n: 1, valori: { f: 1 } }] } })
    expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: 4 } }])
  })
  describe('letture adattate a n_letture attuale', () => {
    const prog = parametro('Diametro', { progressivo: true, n_letture: 3 })
    const storia = (valori: (number | null)[]) => [mis('2026-10-14', '09:00', { [prog.id]: valori })]
    const iniziali = (misurePianta: Misura[], mantenuti: ValoriMisura = {}) =>
      valoriIniziali({ parametri: [prog], misurePianta, dataRilievo: D, mantenuti })[prog.id]
    it('progressivo con meno letture di n_letture → completato con null', () => {
      expect(iniziali(storia([4]))).toEqual([4, null, null])
    })
    it('progressivo con più letture di n_letture → troncato', () => {
      expect(iniziali(storia([1, 2, 3, 4, 5]))).toEqual([1, 2, 3])
    })
    it('mantenuto con meno letture → completato con null', () => {
      expect(iniziali([], { [prog.id]: [7, 8] })).toEqual([7, 8, null])
    })
    it('mantenuto con più letture → troncato', () => {
      expect(iniziali([], { [prog.id]: [1, 2, 3, 4] })).toEqual([1, 2, 3])
    })
    it('lunghezza già corretta → invariata', () => {
      expect(iniziali(storia([1, null, 3]))).toEqual([1, null, 3])
    })
  })
  it('un parametro non progressivo non usa la storia', () => {
    const misure = [mis('2026-10-14', '09:00', { [altezza.id]: [10] })]
    const v = valoriIniziali({ parametri: [altezza], misurePianta: misure, dataRilievo: D, mantenuti: {} })
    expect(v[altezza.id]).toEqual([null])
  })
})

describe('mantenibile', () => {
  it('vero per numero, testo e sì/no, falso per la lista', () => {
    expect([altezza, note, siNo].map(mantenibile)).toEqual([true, true, true])
    expect(mantenibile(palchi)).toBe(false)
  })
})

describe('validaMisura', () => {
  it('campo obbligatorio vuoto → errore (e non "nessun valore")', () => {
    const r = validaMisura([altezza, note], new Set([altezza.id]), { [altezza.id]: [null], [note.id]: '' })
    expect(r.errori).toEqual(['«Altezza» è obbligatorio.'])
    expect(r.avvisi).toEqual([])
  })
  it('obbligatorio mancante dalle chiavi dei valori → errore', () => {
    expect(validaMisura([altezza], new Set([altezza.id]), {}).errori).toEqual(['«Altezza» è obbligatorio.'])
  })
  it('un obbligatorio compilato e un facoltativo vuoto → nessun errore', () => {
    const r = validaMisura([altezza, note], new Set([altezza.id]), { [altezza.id]: [50], [note.id]: '' })
    expect(r).toEqual({ errori: [], avvisi: [] })
  })
  it('fuori intervallo → avviso, non errore', () => {
    const r = validaMisura([altezza], new Set(), { [altezza.id]: [150] })
    expect(r.avvisi).toEqual(['«Altezza» = 150 cm è fuori dall\'intervallo atteso (0–120).'])
    expect(r.errori).toEqual([])
  })
  it('sotto il minimo → avviso; gli estremi sono ammessi', () => {
    expect(validaMisura([altezza], new Set(), { [altezza.id]: [-1] }).avvisi)
      .toEqual(['«Altezza» = -1 cm è fuori dall\'intervallo atteso (0–120).'])
    expect(validaMisura([altezza], new Set(), { [altezza.id]: [0] }).avvisi).toEqual([])
    expect(validaMisura([altezza], new Set(), { [altezza.id]: [120] }).avvisi).toEqual([])
  })
  it('avviso senza unità e con decimali in virgola', () => {
    const p = parametro('pH', { valore_min: 5.5, valore_max: 7.5 })
    expect(validaMisura([p], new Set(), { [p.id]: [8.25] }).avvisi)
      .toEqual(['«pH» = 8,25 è fuori dall\'intervallo atteso (5,5–7,5).'])
  })
  it('intervallo con un solo estremo', () => {
    const soloMin = parametro('Peso', { unita: 'g', valore_min: 10 })
    const soloMax = parametro('Umidità', { unita: '%', valore_max: 100 })
    expect(validaMisura([soloMin], new Set(), { [soloMin.id]: [3] }).avvisi)
      .toEqual(['«Peso» = 3 g è fuori dall\'intervallo atteso (≥ 10).'])
    expect(validaMisura([soloMax], new Set(), { [soloMax.id]: [101] }).avvisi)
      .toEqual(['«Umidità» = 101 % è fuori dall\'intervallo atteso (≤ 100).'])
  })
  it('senza limiti non ci sono avvisi', () => {
    expect(validaMisura([spad3], new Set(), { [spad3.id]: [1e6, null, -50] })).toEqual({ errori: [], avvisi: [] })
  })
  it('l\'avviso min/max è calcolato per ogni lettura', () => {
    const p = parametro('Diametro', { unita: 'mm', n_letture: 3, valore_min: 1, valore_max: 10 })
    const r = validaMisura([p], new Set(), { [p.id]: [0, 5, 11] })
    expect(r.avvisi).toEqual([
      '«Diametro» lettura 1 = 0 mm è fuori dall\'intervallo atteso (1–10).',
      '«Diametro» lettura 3 = 11 mm è fuori dall\'intervallo atteso (1–10).',
    ])
    expect(r.errori).toEqual([])
  })
  it('lettura non numerica → errore, con il numero della lettura', () => {
    expect(validaMisura([spad3], new Set(), { [spad3.id]: [40, NaN, null] }).errori)
      .toEqual(['«SPAD» lettura 2: numero non valido.'])
  })
  it('un solo valore non numerico → errore senza numero di lettura', () => {
    expect(validaMisura([altezza], new Set(), { [altezza.id]: [NaN] }).errori)
      .toEqual(['«Altezza»: numero non valido.'])
    expect(validaMisura([altezza], new Set(), { [altezza.id]: [Infinity] }).errori)
      .toEqual(['«Altezza»: numero non valido.'])
  })
  it('un numero non valido non produce anche l\'avviso di intervallo', () => {
    const r = validaMisura([altezza], new Set(), { [altezza.id]: [NaN] })
    expect(r.avvisi).toEqual([])
  })
  describe('liste', () => {
    const conNomi = parametro('Palchi', {
      tipo: 'lista',
      sotto_campi: [{ chiave: 'f', nome: 'N foglie', unita: null }, { chiave: 'l', nome: 'Lunghezza', unita: 'cm' }],
    })
    const valida = (valori: ElementoLista[]) => validaMisura([conNomi], new Set(), { [conNomi.id]: valori })
    it('lista valida → nessun errore né avviso', () => {
      expect(valida([{ n: 1, valori: { f: 4, l: 2.5 } }, { n: 2, valori: { f: 0, l: null } }])).toEqual({ errori: [], avvisi: [] })
    })
    it('un NaN in un sotto-campo → un solo errore con elemento e sotto-campo', () => {
      expect(valida([{ n: 1, valori: { f: 4, l: 1 } }, { n: 2, valori: { f: NaN, l: 1 } }]).errori)
        .toEqual(['«Palchi» 2, N foglie: numero non valido.'])
    })
    it('Infinity e -Infinity sono non validi', () => {
      expect(valida([{ n: 1, valori: { f: Infinity, l: -Infinity } }]).errori)
        .toEqual(['«Palchi» 1, N foglie: numero non valido.', '«Palchi» 1, Lunghezza: numero non valido.'])
    })
    it('valori null o mancanti nei sotto-campi non sono errori', () => {
      expect(valida([{ n: 1, valori: { f: null } }]).errori).toEqual([])
    })
    it('una lista con soli valori non validi non è "nessun valore"', () => {
      expect(valida([{ n: 1, valori: { f: NaN } }]).errori).toEqual(['«Palchi» 1, N foglie: numero non valido.'])
    })
    it('una lista obbligatoria vuota resta "obbligatorio"', () => {
      expect(validaMisura([conNomi], new Set([conNomi.id]), { [conNomi.id]: [] }).errori)
        .toEqual(['«Palchi» è obbligatorio.'])
    })
  })
  it('tutto vuoto e niente di obbligatorio → "Nessun valore inserito."', () => {
    expect(validaMisura([altezza, note], new Set(), { [altezza.id]: [null], [note.id]: '  ' }).errori)
      .toEqual(['Nessun valore inserito.'])
  })
  it('basta un valore (anche false) per non essere "nessun valore"', () => {
    expect(validaMisura([altezza, siNo], new Set(), { [altezza.id]: [null], [siNo.id]: false }).errori).toEqual([])
  })
  it('più errori restano separati e nell\'ordine dei parametri', () => {
    const r = validaMisura([altezza, spad3, note], new Set([altezza.id, note.id]),
      { [altezza.id]: [null], [spad3.id]: [NaN, null, null], [note.id]: '' })
    expect(r.errori).toEqual([
      '«Altezza» è obbligatorio.',
      '«SPAD» lettura 1: numero non valido.',
      '«Note» è obbligatorio.',
    ])
  })
})

describe('contaPerPianta', () => {
  it('conta solo lo strumento indicato', () => {
    const misure = [
      mis(D, '09:00', {}, { pianta_id: 'P1', strumento_id: 'Termometro' }),
      mis(D, '10:00', {}, { pianta_id: 'P1', strumento_id: 'Termometro' }),
      mis(D, '11:00', {}, { pianta_id: 'P1', strumento_id: 'SPAD' }),
    ]
    expect(contaPerPianta(misure, 'Termometro')).toEqual(new Map([['P1', 2]]))
  })
  it('una voce per ogni pianta che ha misure, nessuna per le altre', () => {
    const misure = [
      mis(D, '09:00', {}, { pianta_id: 'P1', strumento_id: 'T' }),
      mis(D, '09:05', {}, { pianta_id: 'P2', strumento_id: 'T' }),
      mis(D, '09:10', {}, { pianta_id: 'P2', strumento_id: 'T' }),
      mis(D, '09:15', {}, { pianta_id: 'P3', strumento_id: 'ALTRA' }),
    ]
    const m = contaPerPianta(misure, 'T')
    expect(m.get('P1')).toBe(1)
    expect(m.get('P2')).toBe(2)
    expect(m.has('P3')).toBe(false)
    expect(m.size).toBe(2)
  })
  it('nessuna misura → mappa vuota', () => expect(contaPerPianta([], 'T').size).toBe(0))
})

describe('raggruppaStoria', () => {
  it('date decrescenti, ore crescenti all\'interno della data', () => {
    const a = mis('2026-10-14', '15:00', {})
    const b = mis('2026-10-28', '09:30', {})
    const c = mis('2026-10-14', '08:00', {})
    const d = mis('2026-10-21', '12:00', {})
    const e = mis('2026-10-28', '08:15', {})
    const r = raggruppaStoria([a, b, c, d, e])
    expect(r.map(g => g.data)).toEqual(['2026-10-28', '2026-10-21', '2026-10-14'])
    expect(r.map(g => g.misure.map(m => m.id))).toEqual([[e.id, b.id], [d.id], [c.id, a.id]])
  })
  it('non modifica l\'array ricevuto', () => {
    const misure = [mis('2026-10-14', '15:00', {}), mis('2026-10-28', '09:30', {}), mis('2026-10-14', '08:00', {})]
    const ids = misure.map(m => m.id)
    raggruppaStoria(misure)
    expect(misure.map(m => m.id)).toEqual(ids)
  })
  it('nessuna misura → nessun gruppo', () => expect(raggruppaStoria([])).toEqual([]))
})

describe('formattaValore', () => {
  it('numeri: letture separate da barra, virgola decimale, null saltati', () => {
    expect(formattaValore(spad3, [40.1, 41, null])).toBe('40,1 / 41')
  })
  it('numero con unità', () => {
    expect(formattaValore(altezza, [42])).toBe('42 cm')
    expect(formattaValore(altezza, [42.5])).toBe('42,5 cm')
  })
  it('sì/no', () => {
    expect(formattaValore(siNo, true)).toBe('Sì')
    expect(formattaValore(siNo, false)).toBe('No')
    expect(formattaValore(siNo, null)).toBe('—')
  })
  it('testo', () => expect(formattaValore(note, ' bella pianta ')).toBe('bella pianta'))
  it('lista con un solo sotto-campo: numero di elementi e valori', () => {
    expect(formattaValore(palchi, [{ n: 1, valori: { f: 12 } }, { n: 2, valori: { f: 10 } }])).toBe('2 (12, 10)')
    expect(formattaValore(palchi, [{ n: 1, valori: { f: 12.5 } }, { n: 2, valori: { f: null } }])).toBe('2 (12,5, —)')
  })
  it('lista con più sotto-campi: solo il conteggio, con il plurale corretto', () => {
    expect(formattaValore(listaDueCampi, [{ n: 1, valori: { a: 1, b: 2 } }])).toBe('1 elemento')
    expect(formattaValore(listaDueCampi, [{ n: 1, valori: { a: 1, b: 2 } }, { n: 2, valori: { a: 3, b: 4 } }])).toBe('2 elementi')
  })
  it('valori mancanti o vuoti → trattino', () => {
    expect(formattaValore(altezza, undefined)).toBe('—')
    expect(formattaValore(altezza, [null])).toBe('—')
    expect(formattaValore(note, '  ')).toBe('—')
    expect(formattaValore(palchi, [])).toBe('—')
    expect(formattaValore(siNo, undefined)).toBe('—')
  })
})

describe('fuoriIntervallo', () => {
  it('con due estremi: dentro e sugli estremi no, fuori sì', () => {
    expect(fuoriIntervallo(altezza, 50)).toBe(false)
    expect(fuoriIntervallo(altezza, 0)).toBe(false)
    expect(fuoriIntervallo(altezza, 120)).toBe(false)
    expect(fuoriIntervallo(altezza, -0.1)).toBe(true)
    expect(fuoriIntervallo(altezza, 120.1)).toBe(true)
  })
  it('con un solo estremo controlla solo quello', () => {
    const soloMin = parametro('Peso', { valore_min: 10 })
    const soloMax = parametro('Umidità', { valore_max: 100 })
    expect(fuoriIntervallo(soloMin, 3)).toBe(true)
    expect(fuoriIntervallo(soloMin, 1e9)).toBe(false)
    expect(fuoriIntervallo(soloMax, 101)).toBe(true)
    expect(fuoriIntervallo(soloMax, -1e9)).toBe(false)
  })
  it('senza limiti non è mai fuori', () => {
    expect(fuoriIntervallo(spad3, 1e9)).toBe(false)
  })
  it('un numero non finito non è "fuori": è un errore, non un avviso', () => {
    expect(fuoriIntervallo(altezza, NaN)).toBe(false)
    expect(fuoriIntervallo(altezza, Infinity)).toBe(false)
  })
})

describe('valoriDeiParametri', () => {
  it('dà i valori dei soli parametri indicati, vuoti dove mancano; gli altri non compaiono', () => {
    const valori: ValoriMisura = { [altezza.id]: [12], [note.id]: 'x', altro: 'fuori' }
    expect(valoriDeiParametri([altezza, tempAria], valori)).toEqual({ [altezza.id]: [12], [tempAria.id]: [null] })
  })
})

describe('parametriDiUnaMisura', () => {
  const vecchio = { ...parametro('Vecchio'), archiviato: true }
  const staccato = parametro('Staccato')
  const vuoto = parametro('Mai misurato')
  const config = { parametri: [altezza, tempAria, vecchio, staccato, vuoto, note] } as ConfigEsperimento
  const strumento: Strumento = {
    id: 'PA', nome: 'Termometro', icona: null, ordine: 0, tipo: 'strumento', archiviato: false, catalogo_id: null,
    parametri: [
      { parametro_id: tempAria.id, obbligatorio: true, ordine: 1 },
      { parametro_id: vecchio.id, obbligatorio: false, ordine: 0 },
    ],
  }

  it('prima i parametri dello strumento nel suo ordine, anche gli archiviati con "(archiviato)"', () => {
    const { parametri } = parametriDiUnaMisura(config, strumento, {})
    expect(parametri.map(p => p.nome)).toEqual(['Vecchio (archiviato)', 'Temp. aria'])
  })

  it('poi quelli che non sono nello strumento ma hanno un valore, nell\'ordine della configurazione', () => {
    const valori: ValoriMisura = { [note.id]: 'ok', [altezza.id]: [3], [vuoto.id]: [null], 'chiave-estranea': 'x' }
    const { parametri } = parametriDiUnaMisura(config, strumento, valori)
    expect(parametri.map(p => p.nome)).toEqual(['Vecchio (archiviato)', 'Temp. aria', 'Altezza', 'Note'])
  })

  it('un parametro archiviato che non è nello strumento porta lo stesso suffisso, e la configurazione non cambia', () => {
    const { parametri } = parametriDiUnaMisura(config, strumento, { [vecchio.id]: [1], [staccato.id]: [2] })
    expect(parametri.map(p => p.nome)).toEqual(['Vecchio (archiviato)', 'Temp. aria', 'Staccato'])
    expect(vecchio.nome).toBe('Vecchio')
    expect(parametri[0]).toMatchObject({ id: vecchio.id, archiviato: true })
  })

  it('gli obbligatori sono quelli segnati nello strumento per cui la misura ha già un valore', () => {
    const { obbligatori } = parametriDiUnaMisura(config, strumento, { [tempAria.id]: [21], [altezza.id]: [3] })
    expect([...obbligatori]).toEqual([tempAria.id])
  })

  it('un obbligatorio senza valore nella misura (aggiunto dopo) o con il valore vuoto non lo è: la misura vecchia si corregge', () => {
    expect([...parametriDiUnaMisura(config, strumento, { [altezza.id]: [3] }).obbligatori]).toEqual([])
    expect([...parametriDiUnaMisura(config, strumento, { [tempAria.id]: [null] }).obbligatori]).toEqual([])
  })
})

describe('valoriDaSalvare', () => {
  const vuoti: ValoriMisura = {
    n: [null], t: '', s: null, l: [], tb: '   ',
  }

  it('una misura nuova (prima = null) non scrive i parametri lasciati vuoti, di nessun tipo', () => {
    expect(valoriDaSalvare(null, { ...vuoti, [altezza.id]: [12], [note.id]: 'ok' })).toEqual({ [altezza.id]: [12], [note.id]: 'ok' })
  })

  it('tiene i valori compilati, anche un "No" e uno zero', () => {
    const modulo: ValoriMisura = { a: [0], b: false, c: [{ n: 1, valori: { f: null } }] }
    expect(valoriDaSalvare(null, modulo)).toEqual(modulo)
  })

  it('una correzione non crea chiavi vuote nuove, ma tiene quelle già presenti anche svuotate', () => {
    const prima: ValoriMisura = { a: [1], b: 'x', altra: 'da tenere' }
    expect(valoriDaSalvare(prima, { a: [null], b: '', nuovo: [null], nuovoTesto: '' })).toEqual({
      a: [null], b: '', altra: 'da tenere',
    })
  })

  it('un valore nuovo compilato per una chiave assente si scrive; le chiavi non mostrate restano com\'erano', () => {
    expect(valoriDaSalvare({ altra: 1 as never }, { nuovo: [5] })).toEqual({ altra: 1, nuovo: [5] })
  })

  it('non modifica gli oggetti ricevuti', () => {
    const prima: ValoriMisura = { a: [1] }
    const modulo: ValoriMisura = { a: [2], b: [3] }
    valoriDaSalvare(prima, modulo)
    expect(prima).toEqual({ a: [1] })
    expect(modulo).toEqual({ a: [2], b: [3] })
  })

  it('la validazione non dipende dalla presenza delle chiavi vuote', () => {
    const mancante = validaMisura([altezza, note], new Set(), { [altezza.id]: [3] })
    const presente = validaMisura([altezza, note], new Set(), { [altezza.id]: [3], [note.id]: '' })
    expect(mancante).toEqual(presente)
    expect(validaMisura([altezza], new Set(), {}).errori).toEqual(['Nessun valore inserito.'])
  })
})
