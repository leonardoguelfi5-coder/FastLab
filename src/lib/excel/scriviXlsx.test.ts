import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { Workbook, Worksheet } from 'exceljs'
import { costruisciCartella, RIGHE_IMMAGINE, TESTO_GRAFICI, type Cartella, type Cella, type Foglio } from '@/domain/export/fogli'
import { SCELTA_TUTTO } from '@/domain/export/scelte'
import { configExport, misura, p1, p2, pA, pCi, pE, pGs, sCiras, sSpad, spad, tCN, tCS, tSN, tSS, uuid, altezzaF, noteP, palchi, sFeno, vigoroso } from '@/domain/export/test-helpers'
import type { Misura } from '@/domain/tipi'
import {
  ALTEZZA_IMMAGINE, IMMAGINE_NON_DISPONIBILE, LARGHEZZA_IMMAGINE, scriviCartella,
} from './scriviXlsx'

/*
 * Lo scrittore con exceljs vero: scrive il file, poi lo rilegge due volte, con exceljs (`xlsx.load`) e aprendo lo zip
 * (fflate) per guardare l'XML così com'è: un numero di serie di Excel, uno stile, una cella booleana o di testo. I test
 * girano in Europe/Rome (vite.config.ts): una data costruita in ora locale cadrebbe il giorno prima.
 */

const foglioDi = (nome: string, colonne: [string, Foglio['colonne'][number]['tipo']][], righe: Cella[][], extra: Partial<Foglio> = {}): Foglio => ({
  nome, tipo: 'dati', intestazione: true, titoliDiBlocco: [],
  colonne: colonne.map(([titolo, tipo]) => ({ titolo, tipo, larghezza: 12 })), righe, ...extra,
})

const cartellaDi = (fogli: Foglio[], extra: Partial<Cartella> = {}): Cartella => ({
  nomeFile: 'FastLab_prova_2026-11-02.xlsx', fogli, grafici: [], strumenti: [], intervallo: { da: null, a: null }, ...extra,
})

async function scrivi(c: Cartella, immagini: Map<string, Uint8Array> = new Map()): Promise<{ wb: Workbook; zip: Record<string, string>; byte: Uint8Array; blob: Blob }> {
  const blob = await scriviCartella(c, immagini)
  const byte = new Uint8Array(await blob.arrayBuffer())
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(byte.buffer as ArrayBuffer)
  const zip = Object.fromEntries(Object.entries(unzipSync(byte)).filter(([nome]) => nome.endsWith('.xml') || nome.endsWith('.rels'))
    .map(([nome, contenuto]) => [nome, strFromU8(contenuto)]))
  return { wb, zip, byte, blob }
}

/** La cella XML di un indirizzo (es. `B2`) nel foglio n (da 1). */
function cellaXml(zip: Record<string, string>, foglio: number, indirizzo: string): string {
  const xml = zip[`xl/worksheets/sheet${foglio}.xml`]
  const trovata = new RegExp(`<c r="${indirizzo}"[^>]*?(/>|>.*?</c>)`).exec(xml)
  if (!trovata) throw new Error(`manca la cella ${indirizzo}`)
  return trovata[0]
}

/** Il formato numerico (testo) dello stile della cella XML. */
function formatoDi(zip: Record<string, string>, cella: string): string | null {
  const s = /\ss="(\d+)"/.exec(cella)
  if (!s) return null
  const stili = zip['xl/styles.xml']
  const xfs = /<cellXfs[^>]*>(.*?)<\/cellXfs>/s.exec(stili)?.[1] ?? ''
  const xf = [...xfs.matchAll(/<xf [^>]*?(\/>|>.*?<\/xf>)/gs)][Number(s[1])]?.[0] ?? ''
  const id = Number(/numFmtId="(\d+)"/.exec(xf)?.[1] ?? 0)
  if (id === 0) return null
  return new RegExp(`<numFmt numFmtId="${id}" formatCode="([^"]*)"`).exec(stili)?.[1] ?? `predefinito ${id}`
}

const valore = (ws: Worksheet, indirizzo: string) => ws.getCell(indirizzo).value

describe('scriviCartella: fogli, intestazioni e righe', () => {
  it('un foglio per Foglio, nell\'ordine, con il tipo del file Excel e la riga di intestazione in grassetto', async () => {
    const c = cartellaDi([
      foglioDi('Dati', [['Pianta', 'testo'], ['SPAD', 'numero']], [['035', 41.25], ['2', null]]),
      foglioDi('Misure', [['Valore', 'misto']], [[1], ['a'], [true]]),
      foglioDi('Info', [['', 'misto']], [['Voce'], ['Esperimento']], { tipo: 'info', intestazione: false, titoliDiBlocco: [0] }),
    ])
    const { wb, blob } = await scrivi(c)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(wb.worksheets.map(w => w.name)).toEqual(['Dati', 'Misure', 'Info'])
    const dati = wb.getWorksheet('Dati') as Worksheet
    expect(dati.getRow(1).values).toEqual([undefined, 'Pianta', 'SPAD'])
    expect(dati.getCell('A1').font?.bold).toBe(true)
    expect(valore(dati, 'A2')).toBe('035')
    expect(valore(dati, 'B2')).toBe(41.25)
    expect(valore(dati, 'A3')).toBe('2')
    expect(valore(dati, 'B3')).toBeNull()
    expect(dati.rowCount).toBe(3)
    // Info senza intestazione: la prima riga è già un dato, e i titoli dei blocchi sono in grassetto
    const info = wb.getWorksheet('Info') as Worksheet
    expect(valore(info, 'A1')).toBe('Voce')
    expect(info.getCell('A1').font?.bold).toBe(true)
    expect(info.getCell('A2').font?.bold).toBeFalsy()
    expect(info.rowCount).toBe(2)
  })

  it('riga 1 bloccata e filtro automatico su tutta la tabella; niente dei due senza intestazione', async () => {
    const c = cartellaDi([
      foglioDi('Dati', [['Pianta', 'testo'], ['SPAD', 'numero'], ['Note', 'testo']], [['1', 1, 'a'], ['2', 2, 'b']]),
      foglioDi('Info', [['', 'misto']], [['Voce']], { tipo: 'info', intestazione: false }),
    ])
    const { wb, zip } = await scrivi(c)
    const dati = wb.getWorksheet('Dati') as Worksheet
    expect(dati.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(zip['xl/worksheets/sheet1.xml']).toMatch(/<pane [^>]*ySplit="1"[^>]*state="frozen"/)
    expect(zip['xl/worksheets/sheet1.xml']).toContain('<autoFilter ref="A1:C3"')
    expect(zip['xl/worksheets/sheet2.xml']).not.toContain('<pane')
    expect(zip['xl/worksheets/sheet2.xml']).not.toContain('<autoFilter')
  })

  it('larghezze dal modello', async () => {
    const f = foglioDi('Dati', [['Pianta', 'testo'], ['Note', 'testo']], [['1', 'x']])
    // 9 no: exceljs lo prende per la larghezza predefinita e non lo scrive (Excel usa 8,43, una differenza invisibile)
    f.colonne[0].larghezza = 10
    f.colonne[1].larghezza = 40
    const { wb } = await scrivi(cartellaDi([f]))
    const dati = wb.getWorksheet('Dati') as Worksheet
    expect(dati.getColumn(1).width).toBe(10)
    expect(dati.getColumn(2).width).toBe(40)
  })

  it('proprietà della cartella: creata da FastLab, con la data di creazione', async () => {
    const prima = Date.now()
    const { wb } = await scrivi(cartellaDi([foglioDi('Dati', [['A', 'testo']], [['x']])]))
    expect(wb.creator).toBe('FastLab')
    expect(wb.created.getTime()).toBeGreaterThanOrEqual(prima - 1000)
  })
})

describe('scriviCartella: date, ore, istanti, numeri, booleani e testo', () => {
  const DATE = ['2026-03-29', '2026-10-25', '2026-12-31', '2026-01-01']
  /** I numeri di serie di Excel (giorni dal 30/12/1899): 01/01/2026 è 46023. */
  const SERIALI = [46110, 46320, 46387, 46023]

  it('una data è una data vera di Excel, intera, dd/mm/yyyy, e in Europe/Rome è il giorno giusto (anche col cambio dell\'ora)', async () => {
    const { wb, zip } = await scrivi(cartellaDi([foglioDi('Dati', [['Data', 'data']], DATE.map(data => [{ data }]))]))
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Rome')
    const ws = wb.getWorksheet('Dati') as Worksheet
    DATE.forEach((data, i) => {
      const indirizzo = `A${i + 2}`
      const xml = cellaXml(zip, 1, indirizzo)
      // il numero scritto è il giorno intero: nessuna frazione che lo sposti al giorno prima
      expect(xml).toContain(`<v>${SERIALI[i]}</v>`)
      expect(xml).not.toMatch(/t="(s|str|inlineStr)"/)
      expect(formatoDi(zip, xml)).toBe('dd/mm/yyyy')
      const letta = valore(ws, indirizzo)
      expect(letta).toBeInstanceOf(Date)
      const [a, m, g] = data.split('-').map(Number)
      // letta in Europe/Rome (il fuso dei test) è lo stesso giorno
      expect([(letta as Date).getFullYear(), (letta as Date).getMonth() + 1, (letta as Date).getDate()]).toEqual([a, m, g])
      expect(ws.getCell(indirizzo).numFmt).toBe('dd/mm/yyyy')
    })
  })

  it('un\'ora è la frazione del giorno con hh:mm; anche con i secondi', async () => {
    const { zip } = await scrivi(cartellaDi([foglioDi('Misure', [['Ora', 'ora']], [[{ ora: '00:00' }], [{ ora: '09:30' }], [{ ora: '18:00:30' }]])]))
    const numero = (indirizzo: string) => Number(/<v>([^<]*)<\/v>/.exec(cellaXml(zip, 1, indirizzo))?.[1])
    expect(numero('A2')).toBe(0)
    expect(numero('A3')).toBeCloseTo((9 * 60 + 30) / 1440, 12)
    expect(numero('A4')).toBeCloseTo((18 * 3600 + 30) / 86400, 12)
    expect(formatoDi(zip, cellaXml(zip, 1, 'A3'))).toBe('hh:mm')
  })

  it('un istante è data e ora locali (Europe/Rome) come numero di serie con dd/mm/yyyy hh:mm', async () => {
    // 10:15 UTC del 2 novembre (ora solare) = 11:15 in Italia; 10:15 UTC del 1° luglio (ora legale) = 12:15
    const { zip } = await scrivi(cartellaDi([foglioDi('Info', [['', 'misto']], [[{ istante: '2026-11-02T10:15:00.000Z' }], [{ istante: '2026-07-01T10:15:00.000Z' }]], { intestazione: false })]))
    const numero = (indirizzo: string) => Number(/<v>([^<]*)<\/v>/.exec(cellaXml(zip, 1, indirizzo))?.[1])
    expect(numero('A1')).toBeCloseTo(46328 + (11 * 60 + 15) / 1440, 9)
    expect(numero('A2')).toBeCloseTo(46204 + (12 * 60 + 15) / 1440, 9)
    expect(formatoDi(zip, cellaXml(zip, 1, 'A1'))).toBe('dd/mm/yyyy hh:mm')
  })

  it('numeri come numeri a precisione piena, booleani come booleani, testo come testo (mai formula)', async () => {
    const righe: Cella[][] = [
      [41.123456789012, true, '=1+1'],
      [-0.001, false, '+39 333'],
      [0, null, '@somma'],
      [1e-12, null, '035'],
    ]
    const { wb, zip } = await scrivi(cartellaDi([foglioDi('Misure', [['N', 'numero'], ['B', 'booleano'], ['T', 'testo']], righe)]))
    const ws = wb.getWorksheet('Misure') as Worksheet
    expect(valore(ws, 'A2')).toBe(41.123456789012)
    expect(valore(ws, 'A3')).toBe(-0.001)
    expect(valore(ws, 'A4')).toBe(0)
    expect(valore(ws, 'A5')).toBe(1e-12)
    expect(cellaXml(zip, 1, 'A2')).not.toMatch(/t="/)
    expect(valore(ws, 'B2')).toBe(true)
    expect(valore(ws, 'B3')).toBe(false)
    expect(cellaXml(zip, 1, 'B2')).toMatch(/t="b".*<v>1<\/v>/)
    expect(cellaXml(zip, 1, 'B3')).toMatch(/t="b".*<v>0<\/v>/)
    expect(valore(ws, 'C2')).toBe('=1+1')
    expect(valore(ws, 'C3')).toBe('+39 333')
    expect(valore(ws, 'C4')).toBe('@somma')
    expect(valore(ws, 'C5')).toBe('035')
    for (const r of [2, 3, 4, 5]) expect(cellaXml(zip, 1, `C${r}`)).toMatch(/t="(s|str|inlineStr)"/)
    expect(zip['xl/worksheets/sheet1.xml']).not.toContain('<f>')
  })

  it('una data fuori dal calendario di Excel (prima del 01/03/1900) resta il testo AAAA-MM-GG, senza perdere il giorno', async () => {
    const { wb } = await scrivi(cartellaDi([foglioDi('Dati', [['Data', 'data']], [[{ data: '0026-10-20' }], [{ data: '1900-02-28' }], [{ data: '1900-03-01' }]])]))
    const ws = wb.getWorksheet('Dati') as Worksheet
    expect(valore(ws, 'A2')).toBe('0026-10-20')
    expect(valore(ws, 'A3')).toBe('1900-02-28')
    expect(valore(ws, 'A4')).toBeInstanceOf(Date)
  })

  it('un\'ora o un istante illeggibili restano testo', async () => {
    const { wb } = await scrivi(cartellaDi([foglioDi('Misure', [['Ora', 'ora'], ['Quando', 'istante']], [[{ ora: 'mattina' }, { istante: 'ieri' }]])]))
    const ws = wb.getWorksheet('Misure') as Worksheet
    expect(valore(ws, 'A2')).toBe('mattina')
    expect(valore(ws, 'B2')).toBe('ieri')
  })
})

describe('scriviCartella con la cartella del D6', () => {
  const D1 = '2026-10-20'
  const D2 = '2026-10-27'
  const misure = (): Misura[] => [
    misura(p1, sSpad, D1, '09:00', { [spad.id]: [40, 42] }),
    misura(p1, sSpad, D1, '15:00', { [spad.id]: [44, null] }),
    misura(p2, sSpad, D1, '09:10', { [spad.id]: [38, 39] }),
    misura(p1, sSpad, D2, '09:00', { [spad.id]: [45, 46] }),
    misura(p1, sCiras, D1, '10:00', { [pA.id]: [12.5], [pGs.id]: [0.3], [pE.id]: [2], [pCi.id]: [300] }),
    misura(p1, sFeno, D1, '12:00', { [altezzaF.id]: [31], [noteP.id]: '=SOMMA(A1)', [vigoroso.id]: true, [palchi.id]: [{ n: 1, valori: { fiori: 3, lung: 10 } }] }),
  ]
  const cartella = (m = misure()) => costruisciCartella({
    config: configExport(), misure: m, note: [], scelta: SCELTA_TUTTO, oggi: '2026-11-02', adesso: '2026-11-02T10:15:00.000Z', ultimaData: D2,
  })

  it('stessi fogli, intestazioni e righe del modello; N_ presente o assente come nel modello', async () => {
    const c = cartella()
    const { wb } = await scrivi(c)
    expect(wb.worksheets.map(w => w.name)).toEqual(c.fogli.map(f => f.nome))
    for (const f of c.fogli) {
      const ws = wb.getWorksheet(f.nome) as Worksheet
      const scarto = f.intestazione ? 1 : 0
      if (f.intestazione) expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(f.colonne.map(x => x.titolo))
      expect(ws.rowCount).toBeLessThanOrEqual(f.righe.length + scarto)
    }
    const dati = wb.getWorksheet('Dati') as Worksheet
    const titoli = (dati.getRow(1).values as unknown[]).slice(1)
    expect(titoli).toContain('N_SPAD')
    expect(titoli).not.toContain('N_A (µmol/m²/s)')
    const iSpad = titoli.indexOf('SPAD') + 1
    const iN = titoli.indexOf('N_SPAD') + 1
    expect(iN).toBe(iSpad + 1)
    const f = c.fogli[0]
    f.righe.forEach((riga, r) => {
      expect(dati.getRow(r + 2).getCell(iSpad).value).toBe(riga[iSpad - 1])
      expect(dati.getRow(r + 2).getCell(iN).value).toBe(riga[iN - 1])
    })
    // la nota che sembra una formula resta testo, il sì/no è un booleano
    const iNote = titoli.indexOf('Note') + 1
    const iVig = titoli.indexOf('Vigoroso') + 1
    const rigaP1 = f.righe.findIndex(r => r[iNote - 1] === '=SOMMA(A1)') + 2
    expect(dati.getRow(rigaP1).getCell(iNote).value).toBe('=SOMMA(A1)')
    expect(dati.getRow(rigaP1).getCell(iVig).value).toBe(true)
  })

  it('senza un giorno a più misure non c\'è N_', async () => {
    const solo = misure().filter(m => !(m.strumento_id === sSpad.id && m.ora === '15:00'))
    const { wb } = await scrivi(cartella(solo))
    const titoli = ((wb.getWorksheet('Dati') as Worksheet).getRow(1).values as unknown[]).slice(1)
    expect(titoli).toContain('SPAD')
    expect(titoli.some(t => String(t).startsWith('N_'))).toBe(false)
  })

  it('Grafici: un\'immagine 800 × 450 sotto il titolo per ogni PNG, e la riga di ripiego dove manca', async () => {
    const c = cartella()
    expect(c.grafici.length).toBeGreaterThanOrEqual(3)
    const [primo, secondo, terzo] = c.grafici
    const png = (n: number) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, n])
    const immagini = new Map([[primo.parametroId, png(1)], [terzo.parametroId, png(3)]])
    const { wb } = await scrivi(c, immagini)
    const ws = wb.getWorksheet('Grafici') as Worksheet
    expect(valore(ws, 'A1')).toBe(TESTO_GRAFICI)
    const immaginiFoglio = ws.getImages()
    expect(immaginiFoglio).toHaveLength(2)
    const ancore = immaginiFoglio.map(i => ({ riga: i.range.tl.nativeRow, colonna: i.range.tl.nativeCol, ext: (i.range as typeof i.range & { ext?: unknown }).ext }))  // i tipi di exceljs non dichiarano `ext`, che c'è
    // il titolo sta nella riga `riga` (da 0), l'immagine subito sotto
    expect(ancore).toEqual([
      { riga: primo.riga + 1, colonna: 0, ext: { width: LARGHEZZA_IMMAGINE, height: ALTEZZA_IMMAGINE } },
      { riga: terzo.riga + 1, colonna: 0, ext: { width: LARGHEZZA_IMMAGINE, height: ALTEZZA_IMMAGINE } },
    ])
    expect([LARGHEZZA_IMMAGINE, ALTEZZA_IMMAGINE]).toEqual([800, 450])
    // i PNG sono quelli dati, nell'ordine
    const media = immaginiFoglio.map(i => wb.getImage(Number(i.imageId)))
    expect(media.map(m => m.extension)).toEqual(['png', 'png'])
    expect(media.map(m => [...new Uint8Array(m.buffer as unknown as ArrayBuffer)].at(-1))).toEqual([1, 3])
    // titoli al loro posto, il secondo grafico ha la riga di ripiego sotto il titolo
    expect(valore(ws, `A${primo.riga + 1}`)).toBe(primo.titolo)
    expect(valore(ws, `A${primo.riga + 2}`)).toBeNull()
    expect(valore(ws, `A${secondo.riga + 1}`)).toBe(secondo.titolo)
    expect(valore(ws, `A${secondo.riga + 2}`)).toBe(IMMAGINE_NON_DISPONIBILE)
    expect(valore(ws, `A${terzo.riga + 2}`)).toBeNull()
    expect(terzo.riga - secondo.riga).toBe(RIGHE_IMMAGINE + 1)
  })

  it('Grafici senza nessuna immagine: la riga di ripiego sotto ogni titolo', async () => {
    const c = cartella()
    const { wb } = await scrivi(c)
    const ws = wb.getWorksheet('Grafici') as Worksheet
    expect(ws.getImages()).toHaveLength(0)
    for (const g of c.grafici) expect(valore(ws, `A${g.riga + 2}`)).toBe(IMMAGINE_NON_DISPONIBILE)
  })
})

describe('scriviCartella interrotta', () => {
  it('con il segnale già interrotto non scrive niente: AbortError', async () => {
    const controllo = new AbortController()
    controllo.abort()
    const errore = await scriviCartella(cartellaDi([foglioDi('Dati', [['A', 'testo']], [['x']])]), new Map(), { segnale: controllo.signal })
      .catch((e: unknown) => e)
    expect((errore as Error).name).toBe('AbortError')
  })

  it('interrotta a metà (tra un foglio e l\'altro o tra un gruppo di righe e l\'altro) si ferma con AbortError', async () => {
    const controllo = new AbortController()
    const righe: Cella[][] = Array.from({ length: 5000 }, (_, i) => [i])
    const promessa = scriviCartella(cartellaDi([foglioDi('Dati', [['N', 'numero']], righe), foglioDi('Altro', [['N', 'numero']], righe)]), new Map(), { segnale: controllo.signal })
    setTimeout(() => controllo.abort(), 0)
    const errore = await promessa.catch((e: unknown) => e)
    expect((errore as Error).name).toBe('AbortError')
  })
})

describe('prestazioni', () => {
  it('circa 54 000 righe di Misure (18 000 misure) si scrivono e il tempo si misura', async () => {
    const config = configExport()
    const trattamenti = [tCN, tCS, tSN, tSS]
    config.piante = Array.from({ length: 200 }, (_, i) => ({
      id: uuid(20_000 + i), trattamento_id: trattamenti[i % 4].id, etichetta: String(i + 1), blocco: i % 2 ? 'A' : 'B', ordine: i,
    }))
    const date = Array.from({ length: 30 }, (_, i) => `2026-${i < 15 ? '09' : '10'}-${String((i % 15) + 10).padStart(2, '0')}`)
    const misure: Misura[] = []
    let k = 0
    const id = () => uuid(100_000 + k++)
    for (const pianta of config.piante) {
      for (const data of date) {
        const base = { pianta_id: pianta.id, data_rilievo: data }
        misure.push({ ...base, id: id(), strumento_id: sSpad.id, ora: '09:00', valori: { [spad.id]: [40 + (k % 7), 41] } })
        misure.push({ ...base, id: id(), strumento_id: sCiras.id, ora: '10:00', valori: { [pA.id]: [12], [pGs.id]: [0.3], [pE.id]: [2], [pCi.id]: [300] } })
        misure.push({
          ...base, id: id(), strumento_id: sFeno.id, ora: '11:00', valori: {
            [altezzaF.id]: [30 + (k % 5)], [noteP.id]: 'ok', [vigoroso.id]: k % 2 === 0,
            [palchi.id]: [{ n: 1, valori: { fiori: 2, lung: 3 } }, { n: 2, valori: { fiori: 1, lung: 2 } }],
          },
        })
      }
    }
    const c = costruisciCartella({ config, misure, note: [], scelta: SCELTA_TUTTO, oggi: '2026-11-02', adesso: '2026-11-02T10:15:00.000Z', ultimaData: null })
    expect(c.fogli.find(f => f.nome === 'Misure')?.righe).toHaveLength(54_000)
    // il blocco più lungo del thread: quanto la pagina resterebbe ferma senza ridisegnare la fase
    let ultimo = performance.now()
    let blocco = 0
    const orologio = setInterval(() => { const ora = performance.now(); blocco = Math.max(blocco, ora - ultimo); ultimo = ora }, 5)
    const inizio = performance.now()
    const blob = await scriviCartella(c, new Map())
    const durata = performance.now() - inizio
    clearInterval(orologio)
    console.info(`scriviCartella: ${c.fogli.map(f => `${f.nome} ${f.righe.length}`).join(', ')} in ${Math.round(durata)} ms `
      + `(blocco più lungo ${Math.round(blocco)} ms), ${Math.round(blob.size / 1024)} kB`)
    expect(blob.size).toBeGreaterThan(100_000)
    // largo: la macchina dei test può essere lenta; il numero vero è nel log
    expect(durata).toBeLessThan(60_000)
  }, 120_000)
})
