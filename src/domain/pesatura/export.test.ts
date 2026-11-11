import { describe, expect, it } from 'vitest'
import type { DatiPesatura } from '@/api/pesatura'
import type { Cella, Foglio } from '@/domain/export/fogli'
import type { ConfigEsperimento } from '@/domain/tipi'
import { consultaPerCC, curvePerSubstrato, PERCENTUALI_TABELLA, vasiDaPesi } from './curva'
import { cartellaPesatura, gruppiDeiVasi } from './export'
import { IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type Peso, type SessionePesatura } from './tipi'

const sessione = (extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', analisi_id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g',
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
      'Fresco', 'Turgido', 'Secco', 'RWC (%)', 'Sostanza secca (%)',
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
    expect(col(pesi, a, 'RWC (%)')).toBeCloseTo(((1.2 - 0.4) / (1.6 - 0.4)) * 100, 9)
    expect(col(pesi, a, 'Sostanza secca (%)')).toBeCloseTo((0.4 / 1.2) * 100, 9)
  })

  it('una replica incompleta ha le celle calcolate a null', () => {
    const pesi = foglio('Pesi', cartella.fogli)
    const b = pesi.righe[1]
    expect(col(pesi, b, 'Replica')).toBe('B')
    expect(col(pesi, b, 'Fresco')).toBe(1.3)
    expect(col(pesi, b, 'Secco')).toBeNull()
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
    expect(titoli(pesi).slice(-3)).toEqual(['Fresco', 'Secco', 'Sostanza secca (%)'])
    expect(col(pesi, pesi.righe[0], 'Sostanza secca (%)')).toBeCloseTo(25, 9)
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

  it('ha Punti, Pesi target, Grafico e Info (senza Pesi)', () => {
    expect(cartella.fogli.map(f => f.nome)).toEqual(['Punti', 'Pesi target', 'Grafico', 'Info'])
    expect(foglio('Punti', cartella.fogli).tipo).toBe('dati')
    expect(foglio('Pesi target', cartella.fogli).tipo).toBe('dati')
    expect(foglio('Grafico', cartella.fogli).tipo).toBe('grafici')
    expect(cartella.grafici).toHaveLength(1)
    expect(cartella.grafici[0].parametroId).toBe('curve')
    expect(cartella.grafici[0].riga).toBe(foglio('Grafico', cartella.fogli).righe.findIndex(r => r.length > 0))
  })

  it('Punti: una riga per asciugatura con acqua e % CC', () => {
    const p = foglio('Punti', cartella.fogli)
    expect(titoli(p)).toEqual(['Vaso', 'Substrato', 'Data e ora', 'Peso', 'Lettura', 'Acqua', '% CC'])
    expect(p.righe).toHaveLength(4)
    const r = p.righe[0]
    expect(col(p, r, 'Vaso')).toBe('V1')
    expect(col(p, r, 'Substrato')).toBe('Torba')
    expect(col(p, r, 'Data e ora')).toEqual({ istante: '2026-11-11T09:00:00Z' })
    expect(col(p, r, 'Peso')).toBe(190)
    expect(col(p, r, 'Lettura')).toBe(5)
    expect(col(p, r, 'Acqua')).toBeCloseTo(90, 9)
    expect(col(p, r, '% CC')).toBeCloseTo(90, 9)
  })

  it('Pesi target: una colonna per percentuale e la riga Media uguale a consultaPerCC', () => {
    const t = foglio('Pesi target', cartella.fogli)
    expect(titoli(t)).toEqual(['Substrato', 'Vaso', ...PERCENTUALI_TABELLA.map(p => `${p} % CC`)])
    const gruppi = curvePerSubstrato(vasiDaPesi(campioni, pesi), 'logaritmico')
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
    expect(info).toContain('%CC = ')
    expect(info).toContain('ln(kPa)')
    expect(info).toContain('Sabbia')
    expect(info).toContain('Capacità di campo')
  })

  it('gruppiDeiVasi usa il modello del sensore', () => {
    expect(gruppiDeiVasi([s], dati).gruppi.map(g => g.substrato)).toEqual(['Torba', 'Sabbia'])
    expect(gruppiDeiVasi([s], dati).gruppi[0].media?.modello).toBe('logaritmico')
  })
})
