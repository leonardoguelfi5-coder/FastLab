import { describe, it, expect } from 'vitest'
import {
  COLORI_GRAFICO, COLORI_SERIE, MARCATORI, MASSIMA_DISTANZA_NOTA, dataPiuVicina, dateSelezionabili, dominioVerticale,
  etichettaSerie, impagina, letturaDelGiorno, percorsoBarre, riassuntoGrafico, tacche, valoreScritto, type OpzioniImpagina,
} from './grafico'
import type { NoteDellaData, PuntoSerie, Serie, SerieTrattamento } from './dataset'
import type { Nota, Pianta, Trattamento } from './tipi'

const trattamento = (id: string, etichetta: string, ordine = 0): Trattamento => ({ id, etichetta, ordine, livello_ids: [] })
const punto = (data: string, media: number, es: number | null = null, n = 4): PuntoSerie => ({ data, media, es, n })
function serieT(
  etichetta: string, posto: number | null, punti: PuntoSerie[], extra: Partial<SerieTrattamento> = {},
): SerieTrattamento {
  return { tipo: 'trattamento', trattamento: trattamento(`t-${etichetta}`, etichetta), posto, riferimento: false, punti, ...extra }
}
const nota = (id: string, data: string, testo = 'Irrigazione'): Nota =>
  ({ id, data, testo, promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [] })
const segni = (...voci: [string, string[]][]): NoteDellaData[] =>
  voci.map(([data, ids]) => ({ data, note: ids.map(id => nota(id, data)) }))

const OPZ: OpzioniImpagina = { larghezza: 360, altezza: 260, scala: 'valore' }

describe('tavolozza', () => {
  it('ha otto colori diversi, nessuno verde, e otto marcatori diversi', () => {
    expect(COLORI_SERIE).toHaveLength(8)
    expect(new Set(COLORI_SERIE).size).toBe(8)
    for (const hex of COLORI_SERIE) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
      expect(g > r && g > b, `${hex} è verde`).toBe(false)
    }
    expect(MARCATORI).toHaveLength(8)
    expect(new Set(MARCATORI).size).toBe(8)
  })
  it('i colori fissi sono esadecimali (un SVG trasformato in immagine non legge le variabili CSS)', () => {
    for (const hex of Object.values(COLORI_GRAFICO)) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('tacche', () => {
  it('da 35 a 45 con al più 5 tacche: passo 5, dominio sulle tacche', () => {
    expect(tacche(35, 45, 5)).toEqual({ min: 35, max: 45, valori: [35, 40, 45] })
  })
  it('allarga il dominio alla tacca più vicina', () => {
    expect(tacche(36.2, 44.1, 5)).toEqual({ min: 35, max: 45, valori: [35, 40, 45] })
  })
  it('tutti i valori uguali: più o meno il 10%', () => {
    expect(tacche(40, 40, 5)).toEqual({ min: 36, max: 44, valori: [36, 38, 40, 42, 44] })
  })
  it('tutti zero: più o meno 1', () => {
    expect(tacche(0, 0, 5)).toEqual({ min: -1, max: 1, valori: [-1, -0.5, 0, 0.5, 1] })
  })
  it('valori negativi', () => {
    expect(tacche(-12, -3, 5)).toEqual({ min: -15, max: 0, valori: [-15, -10, -5, 0] })
  })
  it('valori piccoli senza errori di virgola mobile', () => {
    expect(tacche(0.001, 0.004, 5)).toEqual({ min: 0.001, max: 0.004, valori: [0.001, 0.002, 0.003, 0.004] })
  })
  it('numeri grandi', () => {
    expect(tacche(1200, 4800, 5)).toEqual({ min: 1000, max: 5000, valori: [1000, 2000, 3000, 4000, 5000] })
  })
  it('non supera mai il numero di tacche chiesto', () => {
    for (const [min, max] of [[0, 1], [3.3, 97.1], [-500, 20], [12, 12.4]]) {
      for (const quante of [3, 4, 5, 6]) {
        const t = tacche(min, max, quante)
        expect(t.valori.length).toBeLessThanOrEqual(quante)
        expect(t.min).toBeLessThanOrEqual(min)
        expect(t.max).toBeGreaterThanOrEqual(max)
      }
    }
  })
  it('valori non finiti o invertiti non producono un dominio rotto', () => {
    expect(tacche(5, 1, 5).min).toBeLessThanOrEqual(1)
    const t = tacche(Number.NaN, 3, 5)
    expect(Number.isFinite(t.min) && Number.isFinite(t.max)).toBe(true)
  })
})

describe('dominioVerticale', () => {
  it('percentuale: sempre da 0 a 100', () => {
    expect(dominioVerticale('percentuale', 12, 80, 6)).toEqual({ min: 0, max: 100, valori: [0, 20, 40, 60, 80, 100] })
  })
  it('conteggio: parte da 0', () => {
    expect(dominioVerticale('conteggio', 3, 9, 5)).toEqual({ min: 0, max: 10, valori: [0, 5, 10] })
  })
  it('conteggio di soli zeri: da 0 a 1, non da -1', () => {
    const d = dominioVerticale('conteggio', 0, 0, 5)
    expect(d.min).toBe(0)
    expect(d.max).toBe(1)
  })
  it('valore: come tacche', () => {
    expect(dominioVerticale('valore', 35, 45, 5)).toEqual(tacche(35, 45, 5))
  })
})

describe('impagina: asse X', () => {
  it('colloca le date per giorni veri, non per posto', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-02', 11), punto('2026-10-10', 12)])], [], OPZ)
    const [a, b, c] = imp.serie[0].punti.map(p => p.x)
    expect((b - a) / (c - a)).toBeCloseTo(1 / 9, 5)
    expect(a).toBeLessThan(b)
    expect(c).toBeLessThan(imp.area.destra)
    expect(a).toBeGreaterThan(imp.area.sinistra)
  })
  it('due serie con date diverse condividono lo stesso asse', () => {
    const imp = impagina([
      serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-05', 11)]),
      serieT('S2', 1, [punto('2026-10-03', 9)]),
    ], [], OPZ)
    const [s1, s2] = imp.serie
    expect(s2.punti[0].x).toBeCloseTo((s1.punti[0].x + s1.punti[1].x) / 2, 5)
  })
  it('le tacche non si sovrappongono: almeno 56 px una dall\'altra, etichette GG/MM', () => {
    const punti = Array.from({ length: 30 }, (_, i) => punto(`2026-10-${String(i + 1).padStart(2, '0')}`, 10 + i))
    const imp = impagina([serieT('S1', 0, punti)], [], OPZ)
    expect(imp.tacchex.length).toBeGreaterThan(1)
    for (let i = 1; i < imp.tacchex.length; i++) expect(imp.tacchex[i].x - imp.tacchex[i - 1].x).toBeGreaterThanOrEqual(56)
    expect(imp.tacchex[0].etichetta).toBe('01/10')
    expect(imp.tacchex[0].data).toBe('2026-10-01')
  })
  it('tiene la prima e l\'ultima data quando c\'è posto', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-02', 11), punto('2026-10-20', 12)])], [], OPZ)
    expect(imp.tacchex.map(t => t.data)).toEqual(['2026-10-01', '2026-10-20'])
  })
  it('con poche date mette una tacca per ogni data', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-08', 11), punto('2026-10-15', 12)])], [], OPZ)
    expect(imp.tacchex.map(t => t.etichetta)).toEqual(['01/10', '08/10', '15/10'])
  })
  it('una sola data: il punto sta al centro e l\'asse ha una sola tacca', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10)]), serieT('S2', 1, [punto('2026-10-01', 12)])], [], OPZ)
    const centro = (imp.area.sinistra + imp.area.destra) / 2
    for (const s of imp.serie) expect(s.punti[0].x).toBeCloseTo(centro, 5)
    expect(imp.tacchex).toHaveLength(1)
  })
})

describe('impagina: asse Y, linee, barre e marcatori', () => {
  it('il dominio contiene anche media più e meno errore standard', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 40, 9), punto('2026-10-02', 41, 1)])], [], OPZ)
    const valori = imp.tacchey.map(t => t.valore)
    expect(Math.min(...valori)).toBeLessThanOrEqual(31)
    expect(Math.max(...valori)).toBeGreaterThanOrEqual(49)
    for (const b of imp.serie[0].barre) {
      expect(b.yAlto).toBeGreaterThanOrEqual(imp.area.alto)
      expect(b.yBasso).toBeLessThanOrEqual(imp.area.basso)
    }
  })
  it('i valori più alti stanno più in alto (y minore)', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-02', 20)])], [], OPZ)
    const [a, b] = imp.serie[0].punti
    expect(b.y).toBeLessThan(a.y)
    const alta = imp.tacchey[imp.tacchey.length - 1]
    expect(alta.y).toBeLessThan(imp.tacchey[0].y)
  })
  it('la tacca alta porta l\'unità, le altre solo il numero con la virgola', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 0.5), punto('2026-10-02', 2.5)])], [], { ...OPZ, unita: 'cm' })
    const alta = imp.tacchey[imp.tacchey.length - 1]
    expect(alta.etichetta).toMatch(/ cm$/)
    for (const t of imp.tacchey.slice(0, -1)) expect(t.etichetta).not.toMatch(/cm/)
    expect(imp.tacchey.some(t => t.etichetta.includes(','))).toBe(true)
  })
  it('percentuale: asse da 0 a 100, la tacca alta ha il segno %, nessuna barra', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 62, null, 8), punto('2026-10-02', 75, 3, 8)])], [], { ...OPZ, scala: 'percentuale' })
    expect(imp.tacchey.map(t => t.valore)).toEqual([0, 20, 40, 60, 80, 100])
    expect(imp.tacchey[imp.tacchey.length - 1].etichetta).toBe('100 %')
  })
  it('nessuna barra quando l\'errore standard è null (n = 1)', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10, null, 1), punto('2026-10-02', 12, 1.5)])], [], OPZ)
    expect(imp.serie[0].barre).toHaveLength(1)
    expect(imp.serie[0].barre[0].x).toBe(imp.serie[0].punti[1].x)
  })
  it('un errore standard di 0 non disegna una barra lunga zero', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10, 0), punto('2026-10-02', 12, 0)])], [], OPZ)
    expect(imp.serie[0].barre).toEqual([])
  })
  it('la barra va da media + ES a media - ES', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10, 2), punto('2026-10-02', 20, 2)])], [], OPZ)
    const [a, b] = imp.serie[0].punti
    const [ba, bb] = imp.serie[0].barre
    expect(a.y - ba.yAlto).toBeCloseTo(ba.yBasso - a.y, 5)
    expect(ba.yBasso).toBeGreaterThan(ba.yAlto)
    expect(b.y - bb.yAlto).toBeCloseTo(bb.yBasso - b.y, 5)
    expect((percorsoBarre(imp.serie[0].barre).match(/V/g) ?? []).length).toBe(2)
  })
  it('la linea unisce solo i punti che ci sono, in un unico percorso', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-12', 12), punto('2026-10-13', 11)])], [], OPZ)
    const d = imp.serie[0].linea ?? ''
    expect(d.startsWith('M')).toBe(true)
    expect((d.match(/L/g) ?? []).length).toBe(2)
    expect((d.match(/M/g) ?? []).length).toBe(1)
  })
  it('una serie con un solo punto ha il punto ma nessuna linea', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10, 1)]), serieT('S2', 1, [punto('2026-10-05', 11), punto('2026-10-06', 12)])], [], OPZ)
    expect(imp.serie[0].punti).toHaveLength(1)
    expect(imp.serie[0].linea).toBeNull()
    expect(imp.serie[0].barre).toHaveLength(1)
  })
  it('una serie senza punti resta nella legenda, dichiarata senza dati', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10)]), serieT('S2', 1, [])], [], OPZ)
    expect(imp.serie[1].punti).toEqual([])
    expect(imp.serie[1].linea).toBeNull()
    expect(imp.legenda.map(v => [v.etichetta, v.senzaDati])).toEqual([['S1', false], ['S2', true]])
  })
  it('nessun punto in nessuna serie: vuoto, senza tacche', () => {
    const imp = impagina([serieT('S1', 0, [])], [], OPZ)
    expect(imp.vuoto).toBe(true)
    expect(imp.tacchex).toEqual([])
    expect(imp.tacchey).toEqual([])
    expect(impagina([], [], OPZ).vuoto).toBe(true)
  })
})

describe('impagina: stile delle serie', () => {
  it('colore e marcatore seguono il posto del trattamento, non l\'ordine nell\'elenco', () => {
    const imp = impagina([
      serieT('S4', 3, [punto('2026-10-01', 10), punto('2026-10-02', 11)]),
      serieT('S2', 1, [punto('2026-10-01', 12), punto('2026-10-02', 13)]),
    ], [], OPZ)
    expect(imp.serie[0].stile.colore).toBe(COLORI_SERIE[3])
    expect(imp.serie[0].stile.marcatore).toBe(MARCATORI[3])
    expect(imp.serie[1].stile.colore).toBe(COLORI_SERIE[1])
    expect(imp.serie[1].stile.marcatore).toBe(MARCATORI[1])
    expect(imp.serie[0].stile.tratteggio).toBeNull()
  })
  it('posto null (dal nono trattamento): grafite tenue tratteggiata, con un marcatore suo', () => {
    const imp = impagina([
      serieT('S9', null, [punto('2026-10-01', 10), punto('2026-10-02', 11)]),
      serieT('S10', null, [punto('2026-10-01', 12), punto('2026-10-02', 13)]),
    ], [], OPZ)
    for (const s of imp.serie) {
      expect(s.stile.colore).toBe(COLORI_GRAFICO.grafiteTenue)
      expect(s.stile.tratteggio).not.toBeNull()
      expect(MARCATORI).toContain(s.stile.marcatore)
    }
    expect(imp.serie[0].stile.marcatore).not.toBe(imp.serie[1].stile.marcatore)
  })
  it('le serie di riferimento sono tenui, sottili e tratteggiate', () => {
    const imp = impagina([
      serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-02', 11)]),
      serieT('S1', 0, [punto('2026-10-01', 12), punto('2026-10-02', 13)], { riferimento: true }),
    ], [], OPZ)
    const [vera, rif] = imp.serie.map(s => s.stile)
    expect(vera.tenue).toBe(false)
    expect(rif.tenue).toBe(true)
    expect(rif.spessore).toBeLessThan(vera.spessore)
    expect(rif.tratteggio).not.toBeNull()
    expect(imp.serie[1].etichetta).toBe('Media S1')
    expect(imp.serie[0].chiave).not.toBe(imp.serie[1].chiave)
  })
  it('le piante dello stesso trattamento hanno lo stesso colore ma marcatori diversi', () => {
    const t = trattamento('t1', 'S1')
    const p = (id: string, etichetta: string): Pianta => ({ id, trattamento_id: 't1', etichetta, blocco: null, ordine: 0 })
    const serie: Serie[] = ['3', '12', '35'].map(e => ({
      tipo: 'pianta', pianta: p(`p${e}`, e), trattamento: t, posto: 2, riferimento: false,
      punti: [punto('2026-10-01', 10, null, 1), punto('2026-10-02', 11, null, 1)],
    }))
    const imp = impagina(serie, [], OPZ)
    expect(new Set(imp.serie.map(s => s.stile.colore))).toEqual(new Set([COLORI_SERIE[2]]))
    expect(new Set(imp.serie.map(s => s.stile.marcatore)).size).toBe(3)
    expect(imp.serie[0].etichetta).toBe('Pianta 3 (S1)')
    expect(imp.serie.every(s => s.barre.length === 0)).toBe(true)
  })
  it('etichettaSerie', () => {
    expect(etichettaSerie(serieT('S1', 0, []))).toBe('S1')
    expect(etichettaSerie(serieT('S1', 0, [], { riferimento: true }))).toBe('Media S1')
  })
})

describe('impagina: segni delle note', () => {
  const serie = () => [serieT('S1', 0, [punto('2026-10-01', 10), punto('2026-10-11', 12)])]
  it('un segno nella posizione della sua data, con il numero delle note', () => {
    const imp = impagina(serie(), segni(['2026-10-06', ['n1', 'n2']]), OPZ)
    expect(imp.segni).toHaveLength(1)
    const [a, b] = imp.serie[0].punti
    expect(imp.segni[0].x).toBeCloseTo((a.x + b.x) / 2, 5)
    expect(imp.segni[0].quante).toBe(2)
    expect(imp.segni[0].note.map(n => n.id)).toEqual(['n1', 'n2'])
  })
  it('una nota oltre l\'ultima data delle serie non allunga l\'asse e non ha segno', () => {
    const senza = impagina(serie(), [], OPZ)
    const con = impagina(serie(), segni(['2026-12-31', ['futura']], ['2026-09-01', ['vecchia']]), OPZ)
    expect(con.segni).toEqual([])
    expect(con.serie[0].punti.map(p => p.x)).toEqual(senza.serie[0].punti.map(p => p.x))
    expect(con.tacchex).toEqual(senza.tacchex)
  })
  it('le note sulle date estreme ci sono (estremi compresi)', () => {
    const imp = impagina(serie(), segni(['2026-10-01', ['a']], ['2026-10-11', ['b']]), OPZ)
    expect(imp.segni.map(s => s.data)).toEqual(['2026-10-01', '2026-10-11'])
  })
  it('con una sola data, solo le note di quel giorno stanno sul grafico, al centro', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 10)])], segni(['2026-10-01', ['a']], ['2026-10-02', ['b']]), OPZ)
    expect(imp.segni.map(s => s.data)).toEqual(['2026-10-01'])
    expect(imp.segni[0].x).toBeCloseTo((imp.area.sinistra + imp.area.destra) / 2, 5)
  })
  it('un grafico vuoto non ha segni', () => {
    expect(impagina([serieT('S1', 0, [])], segni(['2026-10-01', ['a']]), OPZ).segni).toEqual([])
  })
})

describe('impagina: per l\'immagine', () => {
  const serie = () => [
    serieT('Controllo', 0, [punto('2026-10-01', 10), punto('2026-10-11', 12)]),
    serieT('Stress + Hydrochar sì', 1, [punto('2026-10-01', 11), punto('2026-10-11', 13)]),
    serieT('Stress + Hydrochar no', 2, [punto('2026-10-01', 9), punto('2026-10-11', 8)]),
  ]
  it('lascia posto al titolo in alto e alla legenda in basso, dentro le dimensioni date', () => {
    const solo = impagina(serie(), [], OPZ)
    const img = impagina(serie(), [], { larghezza: 640, altezza: 360, scala: 'valore', perImmagine: true })
    expect(img.area.alto).toBeGreaterThan(solo.area.alto)
    expect(img.area.basso).toBeLessThan(360 - 24)
    expect(img.legenda).toHaveLength(3)
    for (const v of img.legenda) {
      expect(v.x).toBeGreaterThanOrEqual(0)
      expect(v.y).toBeGreaterThan(img.area.basso)
      expect(v.y).toBeLessThanOrEqual(360)
    }
    expect(img.titolo).not.toBeNull()
  })
  it('la legenda va a capo quando non ci sta in una riga', () => {
    const lunghe = Array.from({ length: 6 }, (_, i) => serieT(`Trattamento molto lungo numero ${i}`, i, [punto('2026-10-01', 10 + i), punto('2026-10-02', 11)]))
    const img = impagina(lunghe, [], { larghezza: 360, altezza: 400, scala: 'valore', perImmagine: true })
    expect(new Set(img.legenda.map(v => v.y)).size).toBeGreaterThan(1)
    expect(img.area.basso - img.area.alto).toBeGreaterThan(80)
  })
  it('senza perImmagine non c\'è titolo da disegnare nel grafico', () => {
    expect(impagina(serie(), [], OPZ).titolo).toBeNull()
  })
})

describe('lettura per data', () => {
  const imp = () => impagina([
    serieT('S1', 0, [punto('2026-10-01', 41.2333, 0.8, 7), punto('2026-10-11', 43, null, 1)]),
    serieT('S2', 1, [punto('2026-10-11', 38, 1.5, 6)]),
  ], segni(['2026-10-06', ['n1']]), OPZ)

  it('dateSelezionabili: le date dei punti e delle note, in ordine, senza doppioni', () => {
    expect(dateSelezionabili(imp())).toEqual(['2026-10-01', '2026-10-06', '2026-10-11'])
  })
  it('dataPiuVicina sceglie la data più vicina alla x', () => {
    const i = imp()
    const x = (d: string) => i.serie[0].punti.find(p => p.data === d)?.x ?? i.segni[0].x
    expect(dataPiuVicina(i, x('2026-10-01') + 1)).toBe('2026-10-01')
    expect(dataPiuVicina(i, x('2026-10-11') + 40)).toBe('2026-10-11')
    expect(dataPiuVicina(i, x('2026-10-06'))).toBe('2026-10-06')
    expect(dataPiuVicina(impagina([], [], OPZ), 10)).toBeNull()
  })
  it('letturaDelGiorno: valore ± ES e n per ogni serie che ha un punto, con virgola decimale', () => {
    const l = letturaDelGiorno(imp(), '2026-10-01')
    expect(l.data).toBe('2026-10-01')
    expect(l.voci).toHaveLength(1)
    expect(l.voci[0]).toMatchObject({ etichetta: 'S1', valore: '41,23 ± 0,8', n: 7 })
  })
  it('senza errore standard c\'è solo il valore', () => {
    const l = letturaDelGiorno(imp(), '2026-10-11')
    expect(l.voci.map(v => [v.etichetta, v.valore, v.n])).toEqual([['S1', '43', 1], ['S2', '38 ± 1,5', 6]])
  })
  it('percentuale: 62,5%, senza ±', () => {
    const i = impagina([serieT('S1', 0, [punto('2026-10-01', 62.5, null, 8)])], [], { ...OPZ, scala: 'percentuale' })
    expect(letturaDelGiorno(i, '2026-10-01').voci[0].valore).toBe('62,5%')
  })
  it('le note di quella data', () => {
    expect(letturaDelGiorno(imp(), '2026-10-06').note.map(n => n.id)).toEqual(['n1'])
    expect(letturaDelGiorno(imp(), '2026-10-06').voci).toEqual([])
    expect(letturaDelGiorno(imp(), '2026-10-01').note).toEqual([])
  })
  it('la distanza massima per toccare un segno di nota è un bersaglio da dito', () => {
    expect(MASSIMA_DISTANZA_NOTA).toBeGreaterThanOrEqual(22)
  })
})

describe('valoreScritto: numeri piccoli', () => {
  it('sotto 1 in valore assoluto tiene tre cifre significative, con la virgola: 0,123 ± 0,004 non diventa ± 0', () => {
    expect(valoreScritto({ media: 0.123, es: 0.004 }, 'valore')).toBe('0,123 ± 0,004')
    expect(valoreScritto({ media: 0.0412333, es: 0.00081 }, 'valore')).toBe('0,0412 ± 0,00081')
    expect(valoreScritto({ media: -0.5, es: 0.25 }, 'valore')).toBe('-0,5 ± 0,25')
    expect(valoreScritto({ media: 0.00000041, es: null }, 'valore')).toBe('0,00000041')
  })
  it('da 1 in su restano due decimali al massimo, senza zeri inutili; lo zero è 0', () => {
    expect(valoreScritto({ media: 41.2333, es: 0.8 }, 'valore')).toBe('41,23 ± 0,8')
    expect(valoreScritto({ media: 1, es: 0 }, 'valore')).toBe('1 ± 0')
    expect(valoreScritto({ media: 0, es: null }, 'valore')).toBe('0')
  })
  it('un valore che arrotondando arriva a 1 si scrive 1', () => {
    expect(valoreScritto({ media: 0.9996, es: null }, 'valore')).toBe('1')
  })
  it('la percentuale dei sì', () => {
    expect(valoreScritto({ media: 62.5, es: null }, 'percentuale')).toBe('62,5%')
    expect(valoreScritto({ media: 0.333, es: null }, 'percentuale')).toBe('0,333%')
  })
})

describe('riassuntoGrafico', () => {
  it('l\'ultimo valore di un parametro piccolo non si arrotonda a zero', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 0.0123), punto('2026-10-08', 0.0456)])], [], OPZ)
    expect(riassuntoGrafico(imp, 'gs')).toContain('S1 0,0456')
  })
  it('dice titolo, serie, periodo e ultimo valore', () => {
    const imp = impagina([
      serieT('S1', 0, [punto('2026-10-01', 40), punto('2026-10-11', 43.5)]),
      serieT('S2', 1, [punto('2026-10-01', 38), punto('2026-10-08', 39)]),
    ], [], OPZ)
    const testo = riassuntoGrafico(imp, 'SPAD')
    expect(testo).toContain('SPAD')
    expect(testo).toContain('2 serie')
    expect(testo).toContain('S1, S2')
    expect(testo).toContain('01/10/2026')
    expect(testo).toContain('11/10/2026')
    expect(testo).toContain('S1 43,5')
    expect(testo).toContain('S2 39')
  })
  it('una serie sola', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 40)])], [], OPZ)
    expect(riassuntoGrafico(imp, 'SPAD')).toContain('1 serie')
  })
  it('senza dati lo dice', () => {
    expect(riassuntoGrafico(impagina([], [], OPZ), 'SPAD')).toBe('SPAD. Nessun dato da disegnare.')
  })
  it('non usa trattini lunghi', () => {
    const imp = impagina([serieT('S1', 0, [punto('2026-10-01', 40), punto('2026-10-02', 41)])], [], OPZ)
    expect(riassuntoGrafico(imp, 'SPAD')).not.toMatch(/[\u2013\u2014]/)
  })
})
