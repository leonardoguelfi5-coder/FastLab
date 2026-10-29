import { describe, it, expect } from 'vitest'
import {
  valoreVuoto, eVuoto, ultimoValore, valoriIniziali, validaMisura, contaPerPianta, raggruppaStoria, formattaValore,
} from './misure'
import type { ElementoLista, Misura, ValoriMisura } from './tipi'
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
const tempAria = parametro('Temp. aria', { unita: '°C', ricorda_tra_piante: true })
const spad3 = parametro('SPAD', { n_letture: 3 })
const altezza = parametro('Altezza', { unita: 'cm', valore_min: 0, valore_max: 120 })
const note = parametro('Note', { tipo: 'testo' })
const siNo = parametro('Fioritura', { tipo: 'sino' })

let contatore = 0
/** Misura di test: pianta P1 e passata "Fenologici" salvo diversa indicazione. */
function mis(data: string, ora: string, valori: ValoriMisura, extra: Partial<Misura> = {}): Misura {
  contatore += 1
  return { id: `m${contatore}`, pianta_id: 'P1', passata_id: 'PA1', data_rilievo: data, ora, valori, ...extra }
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
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: '2026-10-27', ricordati: {} })
    expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: 6 } }, { n: 2, valori: { f: 3 } }])
    ;(v[palchi.id] as ElementoLista[])[0].valori.f = 99
    expect((misure[1].valori[palchi.id] as ElementoLista[])[0].valori.f).toBe(6)   // copia profonda
  })
  it('progressivo: una misura vuota recente non nasconde l\'ultimo valore reale', () => {
    const misure = [mis('2026-10-14', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 5 } }] }),
                    mis('2026-10-26', '09:00', { [palchi.id]: [] })]
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: D, ricordati: {} })
    expect(v[palchi.id]).toEqual([{ n: 1, valori: { f: 5 } }])
  })
  it('progressivo: una misura di un giorno successivo non viene ripresa', () => {
    const misure = [mis('2026-10-29', '09:00', { [palchi.id]: [{ n: 1, valori: { f: 8 } }] })]
    const v = valoriIniziali({ parametri: [palchi], misurePianta: misure, dataRilievo: D, ricordati: {} })
    expect(v[palchi.id]).toEqual([])
  })
  it('ricorda tra piante e vuoti', () => {
    const v = valoriIniziali({ parametri: [tempAria, spad3], misurePianta: [], dataRilievo: D, ricordati: { [tempAria.id]: [24.5] } })
    expect(v).toEqual({ [tempAria.id]: [24.5], [spad3.id]: [null, null, null] })
  })
  it('ricorda tra piante: copia, non riferimento', () => {
    const ricordato = [24.5]
    const v = valoriIniziali({ parametri: [tempAria], misurePianta: [], dataRilievo: D, ricordati: { [tempAria.id]: ricordato } })
    ;(v[tempAria.id] as number[])[0] = 0
    expect(ricordato).toEqual([24.5])
  })
  it('un valore ricordato è ignorato se il parametro non è "ricorda tra piante"', () => {
    const v = valoriIniziali({ parametri: [spad3], misurePianta: [], dataRilievo: D, ricordati: { [spad3.id]: [1, 2, 3] } })
    expect(v[spad3.id]).toEqual([null, null, null])
  })
  it('un valore ricordato vuoto lascia il valore vuoto del parametro', () => {
    const v = valoriIniziali({ parametri: [tempAria], misurePianta: [], dataRilievo: D, ricordati: { [tempAria.id]: [null] } })
    expect(v[tempAria.id]).toEqual([null])
  })
  it('precedenza: il progressivo batte il ricordato, il ricordato batte il vuoto', () => {
    const prog = parametro('Conteggio', { tipo: 'lista', progressivo: true, ricorda_tra_piante: true,
      sotto_campi: [{ chiave: 'f', nome: 'F', unita: null }] })
    const misure = [mis('2026-10-14', '09:00', { [prog.id]: [{ n: 1, valori: { f: 4 } }] })]
    const conStoria = valoriIniziali({ parametri: [prog], misurePianta: misure, dataRilievo: D,
      ricordati: { [prog.id]: [{ n: 1, valori: { f: 1 } }] } })
    expect(conStoria[prog.id]).toEqual([{ n: 1, valori: { f: 4 } }])
    const senzaStoria = valoriIniziali({ parametri: [prog], misurePianta: [], dataRilievo: D,
      ricordati: { [prog.id]: [{ n: 1, valori: { f: 1 } }] } })
    expect(senzaStoria[prog.id]).toEqual([{ n: 1, valori: { f: 1 } }])
  })
  describe('letture adattate a n_letture attuale', () => {
    const prog = parametro('Diametro', { progressivo: true, ricorda_tra_piante: true, n_letture: 3 })
    const storia = (valori: (number | null)[]) => [mis('2026-10-14', '09:00', { [prog.id]: valori })]
    const iniziali = (misurePianta: Misura[], ricordati: ValoriMisura = {}) =>
      valoriIniziali({ parametri: [prog], misurePianta, dataRilievo: D, ricordati })[prog.id]
    it('progressivo con meno letture di n_letture → completato con null', () => {
      expect(iniziali(storia([4]))).toEqual([4, null, null])
    })
    it('progressivo con più letture di n_letture → troncato', () => {
      expect(iniziali(storia([1, 2, 3, 4, 5]))).toEqual([1, 2, 3])
    })
    it('ricordato con meno letture → completato con null', () => {
      expect(iniziali([], { [prog.id]: [7, 8] })).toEqual([7, 8, null])
    })
    it('ricordato con più letture → troncato', () => {
      expect(iniziali([], { [prog.id]: [1, 2, 3, 4] })).toEqual([1, 2, 3])
    })
    it('lunghezza già corretta → invariata', () => {
      expect(iniziali(storia([1, null, 3]))).toEqual([1, null, 3])
    })
  })
  it('un parametro non progressivo non usa la storia', () => {
    const misure = [mis('2026-10-14', '09:00', { [altezza.id]: [10] })]
    const v = valoriIniziali({ parametri: [altezza], misurePianta: misure, dataRilievo: D, ricordati: {} })
    expect(v[altezza.id]).toEqual([null])
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
  it('conta solo la passata indicata', () => {
    const misure = [
      mis(D, '09:00', {}, { pianta_id: 'P1', passata_id: 'Termometro' }),
      mis(D, '10:00', {}, { pianta_id: 'P1', passata_id: 'Termometro' }),
      mis(D, '11:00', {}, { pianta_id: 'P1', passata_id: 'SPAD' }),
    ]
    expect(contaPerPianta(misure, 'Termometro')).toEqual(new Map([['P1', 2]]))
  })
  it('una voce per ogni pianta che ha misure, nessuna per le altre', () => {
    const misure = [
      mis(D, '09:00', {}, { pianta_id: 'P1', passata_id: 'T' }),
      mis(D, '09:05', {}, { pianta_id: 'P2', passata_id: 'T' }),
      mis(D, '09:10', {}, { pianta_id: 'P2', passata_id: 'T' }),
      mis(D, '09:15', {}, { pianta_id: 'P3', passata_id: 'ALTRA' }),
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
