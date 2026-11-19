import { describe, expect, it } from 'vitest'
import type { DatiPesatura } from '@/api/pesatura'
import { RIGHE_IMMAGINE, type Cella, type Foglio } from '@/domain/export/fogli'
import type { ConfigEsperimento } from '@/domain/tipi'
import { consultaPerCC, curvePerSubstrato, parametriDelSubstrato, PERCENTUALI_TABELLA, vasiDaPesi } from './curva'
import { cartellaPesatura, gruppiDeiVasi, idGraficoCurve, nomeLettura } from './export'
import { IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type Peso, type SessionePesatura } from './tipi'

const sessione = (extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g',
  impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, repliche: 2 }, data: '2026-11-11', nota: null, conclusa: false, creato_da: 'io', ...extra,
})
const campione = (id: string, ordine: number, extra: Partial<CampionePesatura> = {}): CampionePesatura => ({
  id, sessione_id: 'S', pianta_id: null, nome: null, substrato: null, ordine, ...extra,
})
const peso = (id: string, campione_id: string, replica: number, tipo: Peso['tipo'], valore: number, extra: Partial<Peso> = {}): Peso => ({
  id, campione_id, replica, tipo, valore, lettura: null, misurato_il: '2026-11-11T08:00:00Z', creato_da: 'io', ...extra,
})

const config: ConfigEsperimento = {
  esperimento: { id: 'E', nome: 'Prova città', data_inizio: null, note: '', stato: 'in_corso' },
  fattori: [{ id: 'f1', nome: 'Sale', ordine: 1, livelli: [{ id: 'l1', nome: '0 mM', ordine: 1 }, { id: 'l2', nome: '100 mM', ordine: 2 }] }],
  trattamenti: [{ id: 'tB', etichetta: 'Sale 100', ordine: 1, livello_ids: ['l2'] }],
  piante: [{ id: 'p12', trattamento_id: 'tB', etichetta: '12', blocco: null, ordine: 1 }],
  parametri: [],
  strumenti: [],
}

const foglio = (nome: string, fogli: Foglio[]): Foglio => {
  const f = fogli.find(x => x.nome === nome)
  if (!f) throw new Error(`manca il foglio ${nome}`)
  return f
}
const titoli = (f: Foglio) => f.colonne.map(c => c.titolo)
const col = (f: Foglio, riga: Cella[], titolo: string) => riga[titoli(f).indexOf(titolo)]

const OGGI = '2026-11-12'
const ADESSO = '2026-11-12T10:00:00Z'

describe('cartellaPesatura: RWC', () => {
  const campioni = [campione('c12', 1, { pianta_id: 'p12' }), campione('cb', 2, { nome: 'Bianco' })]
  const dati: DatiPesatura = {
    sessioni: [sessione()],
    campioni,
    pesi: [
      peso('1', 'c12', 1, 'fresco', 1.2), peso('2', 'c12', 1, 'turgido', 1.6), peso('3', 'c12', 1, 'secco', 0.4),
      // la replica B è incompleta: manca il secco
      peso('4', 'c12', 2, 'fresco', 1.3), peso('5', 'c12', 2, 'turgido', 1.7),
    ],
  }
  const cartella = cartellaPesatura(dati.sessioni, dati, config, OGGI, ADESSO)

  it('ha Pesi e Info, nome del file pulito e nessuno strumento', () => {
    expect(cartella.fogli.map(f => f.nome)).toEqual(['Pesi', 'Info'])
    expect(cartella.nomeFile).toBe('Pesatura_RWC-foglie_2026-11-12.xlsx')
    expect(cartella.strumenti).toEqual([])
    expect(cartella.grafici).toEqual([])
    expect(cartella.intervallo).toEqual({ da: '2026-11-11', a: '2026-11-11' })
  })

  it('le colonne: identificativi, un fattore, poi pesi e valori calcolati', () => {
    const pesi = foglio('Pesi', cartella.fogli)
    expect(pesi.tipo).toBe('dati')
    expect(pesi.intestazione).toBe(true)
    expect(titoli(pesi)).toEqual([
      'Esperimento', 'Analisi', 'Data', 'Campione', 'Sale', 'Trattamento', 'Replica',
      'Fresco (g)', 'Turgido (g)', 'Secco (g)', 'RWC (%)', 'Sostanza secca (%)',
    ])
  })

  it('una riga per replica con RWC e sostanza secca calcolati', () => {
    const pesi = foglio('Pesi', cartella.fogli)
    expect(pesi.righe).toHaveLength(4)
    const a = pesi.righe[0]
    expect(col(pesi, a, 'Esperimento')).toBe('Prova città')
    expect(col(pesi, a, 'Analisi')).toBe('RWC foglie')
    expect(col(pesi, a, 'Data')).toEqual({ data: '2026-11-11' })
    expect(col(pesi, a, 'Campione')).toBe('P12')
    expect(col(pesi, a, 'Sale')).toBe('100 mM')
    expect(col(pesi, a, 'Trattamento')).toBe('Sale 100')
    expect(col(pesi, a, 'Replica')).toBe('A')
    // con le cifre significative del peso che ne ha di più (1,2 e 1,6: due): 66,67 → 67 e 33,3 → 33
    expect(col(pesi, a, 'RWC (%)')).toBe(67)
    expect(col(pesi, a, 'Sostanza secca (%)')).toBe(33)
  })

  it('una replica incompleta ha le celle calcolate a null', () => {
    const pesi = foglio('Pesi', cartella.fogli)
    const b = pesi.righe[1]
    expect(col(pesi, b, 'Replica')).toBe('B')
    expect(col(pesi, b, 'Fresco (g)')).toBe(1.3)
    expect(col(pesi, b, 'Secco (g)')).toBeNull()
    expect(col(pesi, b, 'RWC (%)')).toBeNull()
    expect(col(pesi, b, 'Sostanza secca (%)')).toBeNull()
  })

  it('i campioni liberi non hanno fattori né trattamento', () => {
    const pesi = foglio('Pesi', cartella.fogli)
    const libero = pesi.righe[2]
    expect(col(pesi, libero, 'Campione')).toBe('Bianco')
    expect(col(pesi, libero, 'Sale')).toBeNull()
    expect(col(pesi, libero, 'Trattamento')).toBeNull()
  })

  it('Info dice analisi, unità, impostazioni ed esportazione', () => {
    const info = foglio('Info', cartella.fogli)
    expect(info.tipo).toBe('info')
    expect(info.intestazione).toBe(false)
    const testo = JSON.stringify(info.righe)
    expect(testo).toContain('RWC foglie')
    expect(testo).toContain('Repliche')
    expect(testo).toContain('"g"')
  })
})

describe('cartellaPesatura: aliquota e sostanza secca', () => {
  it('con il rapporto c\'è la colonna Tampone (mL)', () => {
    const s = sessione({ tipo: 'aliquota', unita: 'mg', impostazioni: { repliche: 1, rapportoTampone: 5, sensore: null } })
    const dati: DatiPesatura = { sessioni: [s], campioni: [campione('c1', 1, { nome: 'A1' })], pesi: [peso('1', 'c1', 1, 'aliquota', 200)] }
    const pesi = foglio('Pesi', cartellaPesatura([s], dati, config, OGGI, ADESSO).fogli)
    expect(titoli(pesi).slice(-2)).toEqual(['Peso (mg)', 'Tampone (mL)'])
    expect(col(pesi, pesi.righe[0], 'Peso (mg)')).toBe(200)
    expect(col(pesi, pesi.righe[0], 'Tampone (mL)')).toBeCloseTo(1, 9)
  })

  it('senza rapporto la colonna Tampone non c\'è', () => {
    const s = sessione({ tipo: 'aliquota', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    const dati: DatiPesatura = { sessioni: [s], campioni: [campione('c1', 1, { nome: 'A1' })], pesi: [] }
    const pesi = foglio('Pesi', cartellaPesatura([s], dati, config, OGGI, ADESSO).fogli)
    expect(titoli(pesi).slice(-1)).toEqual(['Peso (g)'])
    expect(col(pesi, pesi.righe[0], 'Peso (g)')).toBeNull()
  })

  it('sostanza secca: Fresco, Secco, Sostanza secca (%)', () => {
    const s = sessione({ tipo: 'sostanza_secca', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    const dati: DatiPesatura = {
      sessioni: [s], campioni: [campione('c1', 1, { nome: 'A1' })], pesi: [peso('1', 'c1', 1, 'fresco', 2), peso('2', 'c1', 1, 'secco', 0.5)],
    }
    const pesi = foglio('Pesi', cartellaPesatura([s], dati, config, OGGI, ADESSO).fogli)
    expect(titoli(pesi).slice(-3)).toEqual(['Fresco (g)', 'Secco (g)', 'Sostanza secca (%)'])
    // 0,5 / 2 = 25 %: le cifre significative arrotondano solo i decimali, le cifre intere restano (mai 30)
    expect(col(pesi, pesi.righe[0], 'Sostanza secca (%)')).toBe(25)
  })

  it('sessioni passate dalla più nuova: tipo, unità e righe seguono la più vecchia', () => {
    const vecchia = sessione({ id: 'S1', data: '2026-11-03', titolo: 'Prima', tipo: 'sostanza_secca', unita: 'mg', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    const nuova = sessione({ id: 'S2', data: '2026-11-10', titolo: 'Seconda', tipo: 'sostanza_secca', unita: 'g', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    const dati: DatiPesatura = {
      sessioni: [nuova, vecchia],
      campioni: [campione('c1', 1, { nome: 'A', sessione_id: 'S1' }), campione('c2', 1, { nome: 'A', sessione_id: 'S2' })],
      pesi: [peso('1', 'c1', 1, 'fresco', 2000), peso('2', 'c2', 1, 'fresco', 3)],
    }
    const c = cartellaPesatura([nuova, vecchia], dati, config, OGGI, ADESSO)
    const pesi = foglio('Pesi', c.fogli)
    expect(c.nomeFile).toBe('Pesatura_Prima_2026-11-12.xlsx')
    expect(titoli(pesi)).toContain('Fresco (mg)')
    // la sessione in g è convertita nell'unità della più vecchia (mg)
    expect(pesi.righe.map(r => col(pesi, r, 'Fresco (mg)'))).toEqual([2000, 3000])
    expect(JSON.stringify(foglio('Info', c.fogli).righe)).toContain('"mg"')
  })

  it('più sessioni: righe di tutte, intervallo dal minimo al massimo', () => {
    const s1 = sessione({ id: 'S1', data: '2026-11-03', tipo: 'sostanza_secca', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    const s2 = sessione({ id: 'S2', data: '2026-11-10', tipo: 'sostanza_secca', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    const dati: DatiPesatura = {
      sessioni: [s2, s1],
      campioni: [campione('c1', 1, { nome: 'A', sessione_id: 'S1' }), campione('c2', 1, { nome: 'A', sessione_id: 'S2' })],
      pesi: [],
    }
    const c = cartellaPesatura(dati.sessioni, dati, config, OGGI, ADESSO)
    const pesi = foglio('Pesi', c.fogli)
    expect(pesi.righe.map(r => col(pesi, r, 'Data'))).toEqual([{ data: '2026-11-03' }, { data: '2026-11-10' }])
    expect(c.intervallo).toEqual({ da: '2026-11-03', a: '2026-11-10' })
  })
})

describe('cartellaPesatura: vasi', () => {
  const sensore = { tipo: 'tensione' as const, unita: 'kPa' }
  const s = sessione({ tipo: 'vasi', impostazioni: { repliche: 1, rapportoTampone: null, sensore } })
  const campioni = [
    campione('v1', 1, { nome: 'V1', substrato: 'Torba' }),
    campione('v2', 2, { nome: 'V2', substrato: 'Torba' }),
    campione('v3', 3, { nome: 'V3', substrato: 'Sabbia' }),
  ]
  const asciuga = (id: string, c: string, valore: number, lettura: number, ora: string) =>
    peso(id, c, 1, 'asciugatura', valore, { lettura, misurato_il: `2026-11-11T${ora}:00Z` })
  const pesi: Peso[] = [
    peso('s1', 'v1', 1, 'secco', 100), peso('c1', 'v1', 1, 'capacita_campo', 200),
    peso('s2', 'v2', 1, 'secco', 110), peso('c2', 'v2', 1, 'capacita_campo', 230),
    peso('s3', 'v3', 1, 'secco', 90), peso('c3', 'v3', 1, 'capacita_campo', 150),
    asciuga('a1', 'v1', 190, 5, '09:00'), asciuga('a2', 'v1', 160, 20, '10:00'), asciuga('a3', 'v1', 130, 60, '11:00'),
    asciuga('a4', 'v2', 215, 6, '09:00'),
  ]
  const dati: DatiPesatura = { sessioni: [s], campioni, pesi }
  const cartella = cartellaPesatura([s], dati, config, OGGI, ADESSO)

  it('ha Punti, Parametri, Pesi target, Grafico e Info (senza Pesi)', () => {
    expect(cartella.fogli.map(f => f.nome)).toEqual(['Punti', 'Parametri', 'Pesi target', 'Grafico', 'Info'])
    expect(foglio('Punti', cartella.fogli).tipo).toBe('dati')
    expect(foglio('Pesi target', cartella.fogli).tipo).toBe('dati')
    expect(foglio('Grafico', cartella.fogli).tipo).toBe('grafici')
  })

  it('Grafico: un grafico per substrato, con i titoli e le righe distanziate', () => {
    expect(idGraficoCurve(1)).toBe('curve-1')
    expect(cartella.grafici.map(g => g.parametroId)).toEqual(['curve-0', 'curve-1'])
    expect(cartella.grafici.map(g => g.titolo)).toEqual(['Curve di ritenzione — Torba', 'Curve di ritenzione — Sabbia'])
    const [a, b] = cartella.grafici
    const righe = foglio('Grafico', cartella.fogli).righe
    expect(righe[a.riga]).toEqual(['Curve di ritenzione — Torba'])
    expect(righe[b.riga]).toEqual(['Curve di ritenzione — Sabbia'])
    expect(b.riga - a.riga).toBe(RIGHE_IMMAGINE + 1)
  })

  it('Parametri: una riga per vaso e la Curva media, arrotondate come la tabella', () => {
    const p = foglio('Parametri', cartella.fogli)
    expect(titoli(p)).toEqual(['Substrato', 'Vaso', 'a', 'b', 'R²', 'h a CC, curva (kPa)', 'h a CC, misurato (kPa)', 'n'])
    const gruppi = gruppiDeiVasi([s], dati).gruppi
    const attese = gruppi.flatMap(g => parametriDelSubstrato(g).map(r => [g.substrato, r]))
    expect(p.righe).toHaveLength(attese.length)
    expect(p.righe.map(r => r[1])).toEqual(expect.arrayContaining(['V1', 'V2', 'V3', 'Curva media']))
    const tondo = (x: number | null, d: number) => (x === null ? null : Number(x.toFixed(d)))
    attese.forEach(([sub, r], i) => {
      const riga = p.righe[i]
      const rp = r as ReturnType<typeof parametriDelSubstrato>[number]
      expect(riga[0]).toBe(sub)
      expect(riga[1]).toBe(rp.nome)
      expect(riga[2]).toBe(tondo(rp.a, 2))
      expect(riga[3]).toBe(tondo(rp.b, 4))
      expect(riga[4]).toBe(tondo(rp.r2, 3))
      expect(riga[5]).toBe(tondo(rp.letturaCCCurva, 1))
      expect(riga[6]).toBe(tondo(rp.letturaCCMisurata, 1))
      expect(riga[7]).toBe(rp.n)
    })
    // V2 ha un solo punto: nessuna curva, celle vuote
    const v2 = p.righe.find(r => r[1] === 'V2') as Cella[]
    expect(col(p, v2, 'a')).toBeNull()
    expect(col(p, v2, 'R²')).toBeNull()
  })

  it('Punti: il peso CC con lettura è la riga Capacità di campo al 100 %', () => {
    const conLettura = [...pesi.filter(x => x.id !== 'c1'), peso('c1', 'v1', 1, 'capacita_campo', 200, { lettura: 2, misurato_il: '2026-11-11T08:30:00Z' })]
    const d: DatiPesatura = { sessioni: [s], campioni, pesi: conLettura }
    const p = foglio('Punti', cartellaPesatura([s], d, config, OGGI, ADESSO).fogli)
    expect(p.righe).toHaveLength(5)
    const cc = p.righe.find(r => col(p, r, 'Fase') === 'Capacità di campo') as Cella[]
    expect(col(p, cc, 'Vaso')).toBe('V1')
    expect(col(p, cc, 'Peso')).toBe(200)
    expect(col(p, cc, 'Lettura')).toBe(2)
    expect(col(p, cc, '% CC')).toBe(100)
    expect(col(p, cc, 'Acqua')).toBeCloseTo(100, 9)
    expect(col(p, cc, 'Data e ora')).toEqual({ istante: '2026-11-11T08:30:00Z' })
    expect(p.righe.filter(r => col(p, r, 'Fase') === 'Asciugatura')).toHaveLength(4)
  })

  it('Punti: senza secco o con CC non sopra il secco la riga CC non ha % CC', () => {
    const senzaSecco = [...pesi.filter(x => x.id !== 'c1' && x.id !== 's1'), peso('c1', 'v1', 1, 'capacita_campo', 200, { lettura: 2, misurato_il: '2026-11-11T08:30:00Z' })]
    const p = foglio('Punti', cartellaPesatura([s], { sessioni: [s], campioni, pesi: senzaSecco }, config, OGGI, ADESSO).fogli)
    const cc = p.righe.find(r => col(p, r, 'Fase') === 'Capacità di campo') as Cella[]
    expect(col(p, cc, '% CC')).toBeNull()
  })

  it("Parametri: con un sensore TDR le intestazioni dicono TDR e l'unità", () => {
    const sU = sessione({ tipo: 'vasi', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tdr' as const, unita: '%' } } })
    const p = foglio('Parametri', cartellaPesatura([sU], { sessioni: [sU], campioni, pesi }, config, OGGI, ADESSO).fogli)
    expect(titoli(p)).toEqual(['Substrato', 'Vaso', 'm', 'q', 'R²', 'TDR a CC, retta (%)', 'TDR a CC, misurata (%)', 'n'])
  })

  it('Info: equazione della curva media è in forma potenza', () => {
    const info = foglio('Info', cartella.fogli).righe.find(r => r[0] === 'Torba' && typeof r[1] === 'string' && r[1].startsWith('WC = '))
    expect(info?.[1]).toContain('h^')
  })

  it('Punti: una riga per asciugatura con acqua e % CC', () => {
    const p = foglio('Punti', cartella.fogli)
    expect(titoli(p)).toEqual(['Vaso', 'Substrato', 'Data e ora', 'Fase', 'Peso', 'Lettura', 'Acqua', '% CC'])
    expect(p.righe).toHaveLength(4)
    const r = p.righe[0]
    expect(col(p, r, 'Vaso')).toBe('V1')
    expect(col(p, r, 'Substrato')).toBe('Torba')
    expect(col(p, r, 'Data e ora')).toEqual({ istante: '2026-11-11T09:00:00Z' })
    expect(col(p, r, 'Fase')).toBe('Asciugatura')
    expect(col(p, r, 'Peso')).toBe(190)
    expect(col(p, r, 'Lettura')).toBe(5)
    expect(col(p, r, 'Acqua')).toBeCloseTo(90, 9)
    expect(col(p, r, '% CC')).toBeCloseTo(90, 9)
  })

  it('Pesi target: una colonna per percentuale e la riga Media uguale a consultaPerCC', () => {
    const t = foglio('Pesi target', cartella.fogli)
    expect(titoli(t)).toEqual(['Substrato', 'Vaso', ...PERCENTUALI_TABELLA.map(p => `${p} % CC`)])
    const gruppi = curvePerSubstrato(vasiDaPesi(campioni, pesi), 'potenza')
    const riga = (substrato: string, vaso: string) => t.righe.find(r => r[0] === substrato && r[1] === vaso) as Cella[]
    PERCENTUALI_TABELLA.forEach(p => {
      const r = consultaPerCC(gruppi, p)
      const torba = r.find(x => x.substrato === 'Torba')
      const sabbia = r.find(x => x.substrato === 'Sabbia')
      expect(col(t, riga('Torba', 'Media'), `${p} % CC`)).toBeCloseTo(torba?.media as number, 9)
      expect(col(t, riga('Sabbia', 'Media'), `${p} % CC`)).toBeCloseTo(sabbia?.media as number, 9)
      expect(col(t, riga('Torba', 'V1'), `${p} % CC`)).toBeCloseTo(torba?.vasi[0].peso as number, 9)
    })
    // V1: secco 100, CC 200 → a 60 % pesa 160
    expect(col(t, riga('Torba', 'V1'), '60 % CC')).toBeCloseTo(160, 9)
  })

  it('Info: l\'equazione dei substrati con una curva e secco e CC di ogni vaso', () => {
    const info = JSON.stringify(foglio('Info', cartella.fogli).righe)
    expect(info).toContain('WC = ')
    expect(info).toContain('h in kPa')
    expect(info).toContain('Sabbia')
    expect(info).toContain('Capacità di campo')
  })

  it('gruppiDeiVasi usa il modello del sensore', () => {
    expect(gruppiDeiVasi([s], dati).gruppi.map(g => g.substrato)).toEqual(['Torba', 'Sabbia'])
    expect(gruppiDeiVasi([s], dati).gruppi[0].media?.modello).toBe('potenza')
  })
})

describe('nomeLettura', () => {
  it('dice il sensore con la sua unità', () => {
    expect(nomeLettura({ tipo: 'tdr', unita: 'raw' })).toBe('TDR (raw)')
    expect(nomeLettura({ tipo: 'tensione', unita: 'hPa' })).toBe('Tensione (hPa)')
  })
})

describe('cartellaPesatura: soglie del TDR', () => {
  const tdr = { tipo: 'tdr' as const, unita: 'raw' }
  const tens = { tipo: 'tensione' as const, unita: 'kPa' }
  const sessioneVasi = (sensore: typeof tdr | typeof tens) => sessione({ tipo: 'vasi', impostazioni: { repliche: 1, rapportoTampone: null, sensore } })
  const campioni = [campione('t1', 1, { nome: 'T1', substrato: 'Torba' })]
  const asciuga = (id: string, valore: number, lettura: number, giorno: number) =>
    peso(id, 't1', 1, 'asciugatura', valore, { lettura, misurato_il: `2026-11-1${giorno}T10:00:00Z` })
  const pesi: Peso[] = [
    peso('s', 't1', 1, 'secco', 750), peso('c', 't1', 1, 'capacita_campo', 4850, { lettura: 54 }),
    asciuga('a1', 4030, 44.8, 1), asciuga('a2', 3210, 35.2, 2), asciuga('a3', 2390, 26.0, 3), asciuga('a4', 1570, 17.5, 4),
  ]
  const fogliDi = (s: SessionePesatura) => cartellaPesatura([s], { sessioni: [s], campioni, pesi }, config, OGGI, ADESSO).fogli

  it('il foglio Soglie sta dopo Pesi target', () => {
    expect(fogliDi(sessioneVasi(tdr)).map(f => f.nome)).toEqual(['Punti', 'Parametri', 'Pesi target', 'Soglie', 'Grafico', 'Info'])
  })

  it('una riga per substrato e %, con TDR target, peso medio e deficit medio', () => {
    const f = foglio('Soglie', fogliDi(sessioneVasi(tdr)))
    expect(f.tipo).toBe('dati')
    expect(titoli(f)).toEqual(['Substrato', '% CC', 'TDR target', 'Peso medio', 'Deficit medio (mL)', 'Nota'])
    expect(f.righe).toHaveLength(PERCENTUALI_TABELLA.length)
    expect(f.righe.map(r => r[1])).toEqual([...PERCENTUALI_TABELLA])
    // il 60 %: 35,5 con 2 decimali (le letture ne hanno 1), 3210 g, deficit 1640 mL
    expect(f.righe[2]).toEqual(['Torba', 60, 35.5, 3210, 1640, null])
    expect(f.righe[0][2]).toBe(53.87)
  })

  it('Parametri ha m e q a 4 cifre significative', () => {
    const f = foglio('Parametri', fogliDi(sessioneVasi(tdr)))
    expect(titoli(f).slice(2, 5)).toEqual(['m', 'q', 'R²'])
    const riga = f.righe.find(r => r[1] === 'T1') as Cella[]
    expect(riga.slice(2, 5)).toEqual([2.178, -17.31, 1])
  })

  it('con il tensiometro niente foglio Soglie e a, b come prima', () => {
    const fogli = fogliDi(sessioneVasi(tens))
    expect(fogli.map(f => f.nome)).toEqual(['Punti', 'Parametri', 'Pesi target', 'Grafico', 'Info'])
    expect(titoli(foglio('Parametri', fogli)).slice(2, 5)).toEqual(['a', 'b', 'R²'])
  })

  it("con un peso non convertibile l'intestazione del deficit porta l'unita della sessione", () => {
    const s = { ...sessioneVasi(tdr), unita: 'lb' }
    expect(titoli(foglio('Soglie', fogliDi(s)))[4]).toBe('Deficit medio (lb)')
  })
})
