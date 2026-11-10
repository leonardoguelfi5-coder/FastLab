import { describe, it, expect } from 'vitest'
import {
  SCELTA_TUTTO, applicaAllaConfigurazione, descriviScelta, leggiSceltaExport, sceltaDaFiltri, sceltaDaRicerca,
  type SceltaExport,
} from './scelte'
import { GENERATI, casiDelPgtap, idsGenerati } from './scelte.casi'
import type { FiltriDataset } from '../dataset'
import type { ConfigEsperimento, Pianta, Strumento, Trattamento } from '../tipi'

const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

const casi = casiDelPgtap()

describe('i casi di prova del pgTAP', () => {
  it('si leggono tutti dal file: 12 validi e 33 sbagliati, con nomi unici', () => {
    expect(casi.filter(c => c.valida)).toHaveLength(12)
    expect(casi.filter(c => !c.valida)).toHaveLength(33)
    expect(new Set(casi.map(c => c.nome)).size).toBe(casi.length)
  })

  it('ogni caso generato in TS ha il suo nome nel file, e viceversa', () => {
    const nomi = new Set(casi.map(c => c.nome))
    for (const nome of Object.keys(GENERATI)) expect(nomi.has(nome), nome).toBe(true)
  })

  it('un caso generato nel file senza gemello in TS fa fallire la lettura', () => {
    const sql = "insert into casi (nome, valida, scelte) values\n  ('nuovo', true, jsonb_build_object('v', 1));\n"
    expect(() => casiDelPgtap(sql)).toThrow('nuovo')
  })

  it('il generatore degli ids è quello dell\'SQL (lpad di to_hex)', () => {
    expect(idsGenerati('d5000000-0000-0000-0000-', 11).slice(9)).toEqual([
      'd5000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000b',
    ])
  })

  it('il caso "uuid seguito da un a capo" porta davvero un a capo (\\n del JSON)', () => {
    const caso = casi.find(c => c.nome === 'uuid seguito da un a capo')
    expect((caso?.scelte as { piante: { ids: string[] } }).piante.ids[0].endsWith('\n')).toBe(true)
  })
})

describe('leggiSceltaExport: la stessa risposta di scelte_export_valide', () => {
  it.each(casi.map(c => [c.nome, c] as const))('%s', (_, caso) => {
    expect(leggiSceltaExport(caso.scelte) !== null).toBe(caso.valida)
  })

  it('null, undefined, un numero, un testo: null', () => {
    for (const x of [null, undefined, 1, 'tutto', true]) expect(leggiSceltaExport(x)).toBeNull()
  })

  it('un oggetto di 2 MB: null senza errori', () => {
    expect(leggiSceltaExport({ v: 1, x: 'y'.repeat(2_000_000) })).toBeNull()
  })

  it('valori che il JSON non sa scrivere (BigInt, cicli): null, mai un errore', () => {
    const base = structuredClone(SCELTA_TUTTO) as unknown as Record<string, unknown>
    expect(leggiSceltaExport({ ...base, v: BigInt(1) })).toBeNull()
    const ciclo: Record<string, unknown> = { ...base }
    ciclo.come = { ...SCELTA_TUTTO.come, info: ciclo }
    expect(leggiSceltaExport(ciclo)).toBeNull()
  })

  it('il limite di 100 000 byte conta i byte UTF-8 e gli spazi del testo di jsonb', () => {
    // 2200 uuid (il massimo legittimo) restano sotto il limite
    const ids = idsGenerati('b5000000-0000-0000-0000-', 2000)
    expect(leggiSceltaExport({ ...SCELTA_TUTTO, piante: { modo: 'piante', ids } })).not.toBeNull()
  })

  it('restituisce una copia: cambiare l\'originale non cambia la scelta letta', () => {
    const originale = { ...structuredClone(SCELTA_TUTTO), strumenti: { modo: 'scelti', ids: [uuid(1)] } }
    const letta = leggiSceltaExport(originale)
    originale.strumenti.ids.push(uuid(2))
    expect(letta?.strumenti).toEqual({ modo: 'scelti', ids: [uuid(1)] })
  })

  it('SCELTA_TUTTO è valida e non si può cambiare per sbaglio', () => {
    expect(leggiSceltaExport(SCELTA_TUTTO)).toEqual(SCELTA_TUTTO)
    expect(Object.isFrozen(SCELTA_TUTTO) && Object.isFrozen(SCELTA_TUTTO.come)).toBe(true)
  })

  it('il 29 febbraio di un anno sotto il 100 (bisestile 0004, non 0100)', () => {
    const conPeriodo = (da: string, a: string) => ({ ...SCELTA_TUTTO, periodo: { modo: 'intervallo', da, a } })
    expect(leggiSceltaExport(conPeriodo('0004-02-29', '0004-03-01'))).not.toBeNull()
    expect(leggiSceltaExport(conPeriodo('0001-01-01', '9999-12-31'))).not.toBeNull()
    expect(leggiSceltaExport(conPeriodo('0100-02-29', '0100-03-01'))).toBeNull()
  })
})

// ---- configurazione per applica, sceltaDaFiltri e descriviScelta ----

const strumento = (n: number, nome: string, ordine: number, archiviato = false): Strumento => ({
  id: uuid(n), nome, icona: null, ordine, tipo: 'strumento', archiviato, catalogo_id: null, parametri: [],
})
const [ctrl, s1] = [{ id: uuid(101), nome: 'Controllo', ordine: 0 }, { id: uuid(102), nome: 'S1', ordine: 1 }]
const [no, si] = [{ id: uuid(103), nome: 'No', ordine: 0 }, { id: uuid(104), nome: 'Sì', ordine: 1 }]
const tratt = (n: number, etichetta: string, ordine: number, livelli: string[]): Trattamento =>
  ({ id: uuid(n), etichetta, ordine, livello_ids: livelli })
const tCN = tratt(201, 'Controllo + No', 0, [ctrl.id, no.id])
const tCS = tratt(202, 'Controllo + Sì', 1, [ctrl.id, si.id])
const tSN = tratt(203, 'S1 + No', 2, [s1.id, no.id])
const tSS = tratt(204, 'S1 + Sì', 3, [s1.id, si.id])
const pianta = (n: number, etichetta: string, t: Trattamento, ordine: number): Pianta =>
  ({ id: uuid(n), trattamento_id: t.id, etichetta, blocco: null, ordine })
const piante = [
  pianta(301, '1', tCN, 0), pianta(302, '2', tCS, 1), pianta(303, '3', tSN, 2), pianta(312, '12', tSS, 3),
  pianta(313, '13', tSS, 4), pianta(335, '35', tCN, 5), pianta(336, '36', tCN, 6), pianta(337, '37', tCN, 7),
  pianta(338, '38', tCN, 8),
]
const spad = strumento(1, 'SPAD', 0)
const ciras = strumento(2, 'Ciras', 1)
const vecchio = strumento(3, 'Vecchio', 2, true)
const config: ConfigEsperimento = {
  esperimento: { id: uuid(900), nome: 'Hydrochar', data_inizio: '2026-10-01', note: '', stato: 'in_corso' },
  fattori: [
    { id: uuid(110), nome: 'Stress', ordine: 0, livelli: [ctrl, s1] },
    { id: uuid(111), nome: 'Hydrochar', ordine: 1, livelli: [no, si] },
  ],
  trattamenti: [tCN, tCS, tSN, tSS], piante, parametri: [],
  // in disordine: l'ordine è quello di `ordine`, archiviati in fondo
  strumenti: [vecchio, ciras, spad],
}

const con = (extra: Partial<SceltaExport>): SceltaExport => ({ ...structuredClone(SCELTA_TUTTO), ...extra })

describe('applicaAllaConfigurazione', () => {
  it('lascia com\'è una scelta con ids tutti presenti', () => {
    const scelta = con({ strumenti: { modo: 'scelti', ids: [spad.id] }, piante: { modo: 'piante', ids: [piante[0].id] } })
    expect(applicaAllaConfigurazione(scelta, config)).toEqual({ scelta, scartati: [] })
  })

  it('toglie gli ids che non ci sono più e lo dice, al singolare e al plurale', () => {
    const r = applicaAllaConfigurazione(con({
      strumenti: { modo: 'scelti', ids: [uuid(77), spad.id] },
      piante: { modo: 'piante', ids: [piante[1].id, uuid(78), uuid(79)] },
    }), config)
    expect(r.scelta.strumenti).toEqual({ modo: 'scelti', ids: [spad.id] })
    expect(r.scelta.piante).toEqual({ modo: 'piante', ids: [piante[1].id] })
    expect(r.scartati).toEqual(['1 strumento non c\'è più', '2 piante non ci sono più'])
  })

  it('un elenco che resta vuoto torna a tutti o a tutte', () => {
    const r = applicaAllaConfigurazione(con({
      strumenti: { modo: 'scelti', ids: [uuid(77), uuid(78)] },
      piante: { modo: 'trattamenti', ids: [uuid(79)] },
    }), config)
    expect(r.scelta.strumenti).toEqual({ modo: 'tutti' })
    expect(r.scelta.piante).toEqual({ modo: 'tutte' })
    expect(r.scartati).toEqual(['2 strumenti non ci sono più', '1 trattamento non c\'è più'])
  })

  it('i trattamenti scartati al plurale; una pianta scartata al singolare', () => {
    expect(applicaAllaConfigurazione(con({ piante: { modo: 'trattamenti', ids: [tCN.id, uuid(1), uuid(2)] } }), config).scartati)
      .toEqual(['2 trattamenti non ci sono più'])
    expect(applicaAllaConfigurazione(con({ piante: { modo: 'piante', ids: [uuid(1)] } }), config).scartati)
      .toEqual(['1 pianta non c\'è più'])
  })

  it('un id di pianta non vale come trattamento (e viceversa)', () => {
    const r = applicaAllaConfigurazione(con({ piante: { modo: 'trattamenti', ids: [piante[0].id] } }), config)
    expect(r.scelta.piante).toEqual({ modo: 'tutte' })
  })
})

const filtri = (extra: Partial<FiltriDataset> = {}): FiltriDataset => ({
  strumentoId: spad.id, parametroId: null, trattamentoIds: [], livelloIds: [], periodo: { modo: 'tutto' }, cercato: '', ...extra,
})

describe('sceltaDaFiltri (Dataset → Esporta)', () => {
  it('senza filtri: lo strumento del filtro, tutte le piante, stesso periodo, `come` tutto vero', () => {
    const s = sceltaDaFiltri(filtri({ periodo: { modo: 'settimane', n: 4 } }), config)
    expect(s).toEqual({
      v: 1, strumenti: { modo: 'scelti', ids: [spad.id] }, piante: { modo: 'tutte' },
      periodo: { modo: 'settimane', n: 4 }, come: SCELTA_TUTTO.come,
    })
    expect(leggiSceltaExport(s)).toEqual(s)
  })

  it('le piante cercate e trovate vincono su trattamenti e livelli, nell\'ordine della configurazione', () => {
    const s = sceltaDaFiltri(filtri({ cercato: '36, 3, 99', trattamentoIds: [tSS.id], livelloIds: [si.id] }), config)
    expect(s.piante).toEqual({ modo: 'piante', ids: [uuid(303), uuid(336)] })
  })

  it('con il filtro dei trattamenti e dei livelli: i trattamenti che passano tutti e due', () => {
    expect(sceltaDaFiltri(filtri({ trattamentoIds: [tCN.id, tSS.id, tSN.id], livelloIds: [s1.id] }), config).piante)
      .toEqual({ modo: 'trattamenti', ids: [tSN.id, tSS.id] })
    expect(sceltaDaFiltri(filtri({ livelloIds: [si.id] }), config).piante)
      .toEqual({ modo: 'trattamenti', ids: [tCS.id, tSS.id] })
  })

  it('un filtro che non lascia passare nessun trattamento torna a tutte le piante (una scelta vuota non si salva)', () => {
    expect(sceltaDaFiltri(filtri({ trattamentoIds: [tCN.id], livelloIds: [s1.id] }), config).piante).toEqual({ modo: 'tutte' })
  })

  it('senza strumento: tutti gli strumenti; una ricerca senza piante trovate non conta', () => {
    const s = sceltaDaFiltri(filtri({ strumentoId: null, cercato: '99' }), config)
    expect(s.strumenti).toEqual({ modo: 'tutti' })
    expect(s.piante).toEqual({ modo: 'tutte' })
  })

  it('sceltaDaRicerca legge la URL con filtriDaRicerca: solo 2s, 4s e 8s, ids sconosciuti scartati', () => {
    const da = (q: string) => sceltaDaRicerca(new URLSearchParams(q), config)
    expect(da(`s=${ciras.id}&per=8s&t=${tCS.id},${uuid(5)}`)).toEqual({
      v: 1, strumenti: { modo: 'scelti', ids: [ciras.id] }, piante: { modo: 'trattamenti', ids: [tCS.id] },
      periodo: { modo: 'settimane', n: 8 }, come: SCELTA_TUTTO.come,
    })
    expect(da(`s=${spad.id}&per=3s`).periodo).toEqual({ modo: 'tutto' })
    expect(da('per=2026-10-06_2026-11-02').periodo).toEqual({ modo: 'intervallo', da: '2026-10-06', a: '2026-11-02' })
    expect(da(`s=${uuid(55)}`).strumenti).toEqual({ modo: 'tutti' })
    expect(da(`cerca=${encodeURIComponent('1,'.repeat(1500))}`).piante).toEqual({ modo: 'piante', ids: [uuid(301)] })
  })
})

describe('descriviScelta', () => {
  it('l\'esempio del piano: strumenti, piante, periodo e contenuto', () => {
    expect(descriviScelta(con({
      strumenti: { modo: 'scelti', ids: [ciras.id, spad.id] }, periodo: { modo: 'settimane', n: 4 },
      come: { valori: true, medie: true, grafici: true, diario: false, info: false },
    }), config)).toBe('SPAD, Ciras · tutte le piante · ultime 4 settimane · valori, medie, grafici')
  })

  it('tutto l\'esperimento', () => {
    expect(descriviScelta(SCELTA_TUTTO, config))
      .toBe('tutti gli strumenti · tutte le piante · tutto il periodo · valori, medie, grafici, diario, info')
  })

  it('trattamenti e piante, al singolare e al plurale, nell\'ordine della configurazione', () => {
    const d = (piante: SceltaExport['piante']) => descriviScelta(con({ piante }), config).split(' · ')[1]
    expect(d({ modo: 'trattamenti', ids: [tSS.id] })).toBe('trattamento S1 + Sì')
    expect(d({ modo: 'trattamenti', ids: [tSS.id, tCN.id] })).toBe('trattamenti Controllo + No, S1 + Sì')
    expect(d({ modo: 'piante', ids: [uuid(312)] })).toBe('pianta 12')
    expect(d({ modo: 'piante', ids: [uuid(336), uuid(335)] })).toBe('piante 35, 36')
    expect(d({ modo: 'piante', ids: piante.map(p => p.id) })).toBe('piante 1, 2, 3, 12, 13, 35 e altre 3')
  })

  it('il periodo: una settimana, un intervallo, un giorno solo', () => {
    const d = (periodo: SceltaExport['periodo']) => descriviScelta(con({ periodo }), config).split(' · ')[2]
    expect(d({ modo: 'settimane', n: 1 })).toBe('ultima settimana')
    expect(d({ modo: 'intervallo', da: '2026-10-06', a: '2026-11-02' })).toBe('dal 06/10/2026 al 02/11/2026')
    expect(d({ modo: 'intervallo', da: '2026-11-02', a: '2026-11-02' })).toBe('il 02/11/2026')
  })

  it('gli ids che non ci sono più non compaiono (e un elenco vuoto vale tutti)', () => {
    expect(descriviScelta(con({ strumenti: { modo: 'scelti', ids: [uuid(77), vecchio.id] } }), config).split(' · ')[0]).toBe('Vecchio')
    expect(descriviScelta(con({ strumenti: { modo: 'scelti', ids: [uuid(77)] } }), config).split(' · ')[0]).toBe('tutti gli strumenti')
  })
})
