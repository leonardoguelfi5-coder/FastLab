import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/esperimenti', () => ({ caricaConfig: vi.fn() }))
vi.mock('@/api/misure', () => ({ misureStrumento: vi.fn(), ultimaMisuraPerStrumento: vi.fn() }))
vi.mock('@/api/note', () => ({ listaNote: vi.fn(), eliminaNota: vi.fn() }))
vi.mock('@/lib/graficoPng', () => ({ svgInPng: vi.fn(), fontDati: vi.fn() }))
vi.mock('@/lib/scaricaFile', () => ({ consegna: vi.fn() }))
vi.mock('@/lib/excel/scriviXlsx', () => ({ scriviCartella: vi.fn(), LARGHEZZA_IMMAGINE: 800, ALTEZZA_IMMAGINE: 450 }))
vi.mock('@/components/note/eliminaNotaConAnnulla', () => ({ senzaNoteInEliminazione: vi.fn((note: unknown[]) => note) }))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn() }) }))

import { toast } from 'sonner'
import { caricaConfig } from '@/api/esperimenti'
import { senzaNoteInEliminazione } from '@/components/note/eliminaNotaConAnnulla'
import { misureStrumento, ultimaMisuraPerStrumento } from '@/api/misure'
import { listaNote } from '@/api/note'
import { chiavi } from '@/api/query'
import type { Cartella } from '@/domain/export/fogli'
import { SCELTA_TUTTO, type SceltaExport } from '@/domain/export/scelte'
import { configExport, misura, nota, p1, p2, p3, pA, sCiras, sSpad, sMetro, spad, altezzaM, uuid } from '@/domain/export/test-helpers'
import type { Misura } from '@/domain/tipi'
import { ErroreApp, messaggioErrore } from '@/lib/errori'
import { scriviCartella } from '@/lib/excel/scriviXlsx'
import { fontDati, svgInPng } from '@/lib/graficoPng'
import { consegna } from '@/lib/scaricaFile'
import { toastSalvato } from '@/lib/toastSalvato'
import { scaricaExcel, testoFase, type FaseExcel } from './scaricaExcel'

const E = uuid(900)
const OGGI = '2026-11-02'
const PNG = (n: number) => new Uint8Array([137, 80, 78, 71, n])

const MISURE: Record<string, Misura[]> = {
  [sSpad.id]: [
    misura(p1, sSpad, '2026-10-20', '09:00', { [spad.id]: [40, 42] }),
    misura(p2, sSpad, '2026-10-20', '09:10', { [spad.id]: [38, 39] }),
  ],
  [sCiras.id]: [misura(p1, sCiras, '2026-10-20', '10:00', { [pA.id]: [12.5] }), misura(p3, sCiras, '2026-10-20', '10:05', { [pA.id]: [10] })],
  [sMetro.id]: [misura(p1, sMetro, '2026-10-21', '11:00', { [altezzaM.id]: [30] })],
}

let queryClient: QueryClient
let fasi: FaseExcel[]

const avvia = (extra: Partial<Parameters<typeof scaricaExcel>[0]> = {}) => scaricaExcel({
  queryClient, espId: E, scelta: SCELTA_TUTTO, oggi: OGGI, onProgresso: f => fasi.push(f), ...extra,
})
const ultimaCartella = (): Cartella => vi.mocked(scriviCartella).mock.calls.at(-1)?.[0] as Cartella
const ultimeImmagini = (): ReadonlyMap<string, Uint8Array> => vi.mocked(scriviCartella).mock.calls.at(-1)?.[1] as ReadonlyMap<string, Uint8Array>

/** Una promessa da risolvere a mano, per fermare l'orchestratore a metà. */
function inSospeso<T>() {
  let risolvi!: (x: T) => void
  const promessa = new Promise<T>(r => { risolvi = r })
  return { promessa, risolvi }
}

beforeEach(() => {
  // come l'app (creaQueryClient): una cache di 30 s che senza `staleTime: 0` varrebbe
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  fasi = []
  vi.mocked(caricaConfig).mockResolvedValue(configExport())
  vi.mocked(misureStrumento).mockImplementation(async (_e, id) => MISURE[id] ?? [])
  vi.mocked(listaNote).mockResolvedValue([nota(1, '2026-10-20', 'Irrigazione')])
  vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([[sSpad.id, '2026-10-20']]))
  vi.mocked(fontDati).mockResolvedValue('data:font/woff2;base64,AAAA')
  let n = 0
  vi.mocked(svgInPng).mockImplementation(async () => PNG(++n))
  vi.mocked(scriviCartella).mockResolvedValue(new Blob(['xlsx']))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('scaricaExcel: le fasi', () => {
  it('Preparo i dati, Disegno i grafici N di M, Scrivo il file, nell\'ordine; poi consegna il file con il suo nome', async () => {
    const esito = await avvia()
    const cartella = ultimaCartella()
    const m = cartella.grafici.length
    expect(m).toBeGreaterThanOrEqual(3)
    expect(fasi).toEqual([
      { fase: 'dati' },
      ...Array.from({ length: m }, (_, i) => ({ fase: 'grafici', numero: i + 1, totale: m })),
      { fase: 'file' },
    ])
    expect(fasi.map(testoFase).slice(0, 3)).toEqual(['Preparo i dati…', `Disegno i grafici 1 di ${m}…`, `Disegno i grafici 2 di ${m}…`])
    expect(testoFase({ fase: 'grafici', numero: 3, totale: 12 })).toBe('Disegno i grafici 3 di 12…')
    expect(testoFase({ fase: 'file' })).toBe('Scrivo il file…')
    expect(consegna).toHaveBeenCalledTimes(1)
    expect(consegna).toHaveBeenCalledWith(await vi.mocked(scriviCartella).mock.results[0].value, 'FastLab_Hydrochar-prova_2026-11-02.xlsx')
    expect(esito).toMatchObject({ nomeFile: 'FastLab_Hydrochar-prova_2026-11-02.xlsx', grafici: m, graficiNelFile: m })
    // tutti i PNG, per id del parametro
    expect([...ultimeImmagini().keys()]).toEqual(cartella.grafici.map(g => g.parametroId))
  })

  it('l\'immagine è il GraficoSvg per l\'Excel: 800 × 450, con titolo, legenda e il font incorporato', async () => {
    await avvia()
    const [svg, larghezza, altezza] = vi.mocked(svgInPng).mock.calls[0]
    expect([larghezza, altezza]).toEqual([800, 450])
    expect(svg).toMatch(/^<svg [^>]*width="800" height="450"/)
    expect(svg).toContain('@font-face')
    expect(svg).toContain('data:font/woff2;base64,AAAA')
    expect(svg).toContain(`${ultimaCartella().grafici[0].titolo} · media per trattamento ± ES`)
  })

  it('senza grafici scelti non disegna niente e non chiede il font', async () => {
    await avvia({ scelta: { ...SCELTA_TUTTO, come: { ...SCELTA_TUTTO.come, grafici: false } } })
    expect(fasi).toEqual([{ fase: 'dati' }, { fase: 'file' }])
    expect(svgInPng).not.toHaveBeenCalled()
    expect(fontDati).not.toHaveBeenCalled()
  })
})

describe('scaricaExcel: i dati freschi', () => {
  it('rilegge configurazione, misure degli strumenti scelti, note e ultima data anche con la cache fresca', async () => {
    // una cache appena scritta e vecchia: non deve valere
    queryClient.setQueryData(chiavi.config(E), { ...configExport(), piante: [] })
    queryClient.setQueryData(chiavi.misureStrumento(E, sSpad.id), [])
    queryClient.setQueryData(chiavi.note(E), [])
    queryClient.setQueryData(chiavi.ultimeMisure(E), new Map())
    const scelta: SceltaExport = { ...SCELTA_TUTTO, strumenti: { modo: 'scelti', ids: [sSpad.id, sCiras.id] } }
    await avvia({ scelta })
    expect(caricaConfig).toHaveBeenCalledWith(E)
    expect(vi.mocked(misureStrumento).mock.calls.map(c => c[1]).sort()).toEqual([sSpad.id, sCiras.id].sort())
    expect(listaNote).toHaveBeenCalledWith(E)
    expect(ultimaMisuraPerStrumento).toHaveBeenCalledWith(E)
    const cartella = ultimaCartella()
    expect(cartella.strumenti.map(s => s.nome)).toEqual(['SPAD', 'Ciras'])
    const dati = cartella.fogli.find(f => f.nome === 'Dati')
    expect(dati?.righe).toHaveLength(3)
    // la cache ora ha i dati veri, per il riepilogo della pagina
    expect(queryClient.getQueryData(chiavi.misureStrumento(E, sSpad.id))).toEqual(MISURE[sSpad.id])
  })

  it('le note in attesa di eliminazione (con "Annulla" aperto) non entrano nel Diario', async () => {
    vi.mocked(listaNote).mockResolvedValue([nota(1, '2026-10-20', 'Irrigazione'), nota(2, '2026-10-21', 'Sta per sparire')])
    vi.mocked(senzaNoteInEliminazione).mockImplementationOnce(note => note.filter(n => n.id !== uuid(2)))
    await avvia()
    const diario = ultimaCartella().fogli.find(f => f.nome === 'Diario')
    expect(diario?.righe.map(r => r[1])).toEqual(['Irrigazione'])
  })

  it('con tutti gli strumenti legge anche gli archiviati (sono nel file)', async () => {
    const config = configExport()
    config.strumenti = config.strumenti.map(s => (s.id === sMetro.id ? { ...s, archiviato: true } : s))
    vi.mocked(caricaConfig).mockResolvedValue(config)
    await avvia()
    expect(vi.mocked(misureStrumento).mock.calls.map(c => c[1]).sort()).toEqual(config.strumenti.map(s => s.id).sort())
  })

  it('un esperimento concluso conta le settimane fino all\'ultima data con misure (riletta)', async () => {
    const config = configExport()
    config.esperimento.stato = 'concluso'
    vi.mocked(caricaConfig).mockResolvedValue(config)
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([[sSpad.id, '2026-10-20'], [sMetro.id, '2026-10-21']]))
    await avvia({ scelta: { ...SCELTA_TUTTO, periodo: { modo: 'settimane', n: 2 } } })
    expect(ultimaCartella().intervallo).toEqual({ da: '2026-10-08', a: '2026-10-21' })
  })
})

describe('scaricaExcel: il toast finale', () => {
  it('neutro (mai il verde di "salvato"), con il nome del file e le righe di Dati', async () => {
    await avvia()
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledTimes(1)
    const [testo, opzioni] = vi.mocked(toast.success).mock.calls[0]
    expect(testo).toBe('Excel scaricato: FastLab_Hydrochar-prova_2026-11-02.xlsx · Dati 4 righe')
    expect(opzioni?.description).toBeUndefined()
    expect(opzioni?.className).toBeUndefined()
  })

  it('senza il foglio Dati dice solo il nome del file', async () => {
    await avvia({ scelta: { ...SCELTA_TUTTO, come: { valori: false, medie: true, grafici: false, diario: false, info: true } } })
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe('Excel scaricato: FastLab_Hydrochar-prova_2026-11-02.xlsx')
  })

  it('un grafico che il browser non disegna ferma i grafici: il file parte senza le immagini mancanti e il toast lo dice', async () => {
    vi.mocked(svgInPng).mockResolvedValueOnce(null)
    const esito = await avvia()
    const m = ultimaCartella().grafici.length
    expect(svgInPng).toHaveBeenCalledTimes(1)
    expect(fasi.filter(f => f.fase === 'grafici')).toHaveLength(1)
    expect(ultimeImmagini().size).toBe(0)
    expect(consegna).toHaveBeenCalledTimes(1)
    expect(esito).toMatchObject({ grafici: m, graficiNelFile: 0 })
    const [, opzioni] = vi.mocked(toast.success).mock.calls[0]
    expect(opzioni?.description).toBe('I grafici non sono nel file: questo browser non li ha disegnati.')
    // resta finché non si chiude: con il telefono in tasca un avviso che sparisce non lo legge nessuno
    expect(opzioni?.duration).toBe(Infinity)
  })

  it('se si ferma dopo qualche grafico, quelli disegnati restano e il toast dice quanti mancano', async () => {
    vi.mocked(svgInPng).mockResolvedValueOnce(PNG(1)).mockResolvedValueOnce(null)
    const esito = await avvia()
    const cartella = ultimaCartella()
    const m = cartella.grafici.length
    expect(svgInPng).toHaveBeenCalledTimes(2)
    expect([...ultimeImmagini().keys()]).toEqual([cartella.grafici[0].parametroId])
    expect(esito).toMatchObject({ grafici: m, graficiNelFile: 1 })
    expect(vi.mocked(toast.success).mock.calls[0][1]?.description)
      .toBe(`${m - 1} grafici su ${m} non sono nel file: questo browser non li ha disegnati.`)
  })

  it('il font che non si legge non ferma i grafici (l\'immagine usa un monospazio di sistema)', async () => {
    vi.mocked(fontDati).mockResolvedValue(null)
    await avvia()
    expect(vi.mocked(svgInPng).mock.calls[0][0]).not.toContain('@font-face')
    expect(ultimeImmagini().size).toBe(ultimaCartella().grafici.length)
  })
})

describe('scaricaExcel: un solo download alla volta', () => {
  it('un secondo tocco mentre il primo lavora non fa niente (null) e parte un solo file', async () => {
    const attesa = inSospeso<Uint8Array | null>()
    vi.mocked(svgInPng).mockReturnValueOnce(attesa.promessa)
    const primo = avvia()
    await vi.waitFor(() => expect(svgInPng).toHaveBeenCalled())
    const secondo = await avvia()
    expect(secondo).toBeNull()
    attesa.risolvi(PNG(1))
    expect(await primo).not.toBeNull()
    expect(consegna).toHaveBeenCalledTimes(1)
    // finito il primo, un nuovo tocco funziona
    expect(await avvia()).not.toBeNull()
    expect(consegna).toHaveBeenCalledTimes(2)
  })

  it('dopo un errore si può riprovare', async () => {
    vi.mocked(listaNote).mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(avvia()).rejects.toThrow('Failed to fetch')
    expect(await avvia()).not.toBeNull()
  })
})

describe('scaricaExcel: la pagina lasciata a metà', () => {
  it('interrotto mentre disegna: nessun file, nessun toast, null', async () => {
    const controllo = new AbortController()
    const attesa = inSospeso<Uint8Array | null>()
    vi.mocked(svgInPng).mockReturnValueOnce(attesa.promessa)
    const promessa = avvia({ segnale: controllo.signal })
    await vi.waitFor(() => expect(svgInPng).toHaveBeenCalled())
    controllo.abort()
    attesa.risolvi(PNG(1))
    expect(await promessa).toBeNull()
    expect(svgInPng).toHaveBeenCalledTimes(1)
    expect(scriviCartella).not.toHaveBeenCalled()
    expect(consegna).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('interrotto mentre scrive il file: nessun download fantasma dopo', async () => {
    const controllo = new AbortController()
    const attesa = inSospeso<Blob>()
    vi.mocked(scriviCartella).mockReturnValueOnce(attesa.promessa)
    const promessa = avvia({ segnale: controllo.signal })
    await vi.waitFor(() => expect(scriviCartella).toHaveBeenCalled())
    expect(vi.mocked(scriviCartella).mock.calls[0][2]).toEqual({ segnale: controllo.signal })
    controllo.abort()
    attesa.risolvi(new Blob(['tardi']))
    expect(await promessa).toBeNull()
    expect(consegna).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('lo scrittore che si ferma con AbortError: null, niente errore', async () => {
    const controllo = new AbortController()
    vi.mocked(scriviCartella).mockImplementationOnce(async () => {
      controllo.abort()
      throw new DOMException('interrotto', 'AbortError')
    })
    expect(await avvia({ segnale: controllo.signal })).toBeNull()
    expect(consegna).not.toHaveBeenCalled()
  })

  it('interrotto mentre si leggono i dati: non disegna e non scrive', async () => {
    const controllo = new AbortController()
    const attesa = inSospeso<ReturnType<typeof configExport>>()
    vi.mocked(caricaConfig).mockReturnValueOnce(attesa.promessa)
    const promessa = avvia({ segnale: controllo.signal })
    controllo.abort()
    attesa.risolvi(configExport())
    expect(await promessa).toBeNull()
    expect(svgInPng).not.toHaveBeenCalled()
    expect(scriviCartella).not.toHaveBeenCalled()
  })

  it('un download lasciato a metà non blocca il successivo (la pagina riaperta)', async () => {
    const controllo = new AbortController()
    const attesa = inSospeso<Blob>()
    vi.mocked(scriviCartella).mockReturnValueOnce(attesa.promessa)
    const lasciato = avvia({ segnale: controllo.signal })
    await vi.waitFor(() => expect(scriviCartella).toHaveBeenCalled())
    controllo.abort()
    const nuovo = avvia()
    attesa.risolvi(new Blob(['tardi']))
    expect(await lasciato).toBeNull()
    expect(await nuovo).not.toBeNull()
    expect(consegna).toHaveBeenCalledTimes(1)
  })
})

describe('scaricaExcel: gli errori vanno al chiamante, in italiano', () => {
  it('una lettura che fallisce si rilancia così com\'è (la pagina la spiega con messaggioErrore)', async () => {
    const errore = { message: 'Failed to fetch' }
    vi.mocked(misureStrumento).mockRejectedValueOnce(errore)
    await expect(avvia()).rejects.toBe(errore)
    expect(consegna).not.toHaveBeenCalled()
  })

  it('lo scrittore che si rompe: un messaggio dell\'app', async () => {
    vi.mocked(scriviCartella).mockRejectedValueOnce(new RangeError('Invalid array length'))
    const errore = await avvia().catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreApp)
    expect(messaggioErrore(errore)).toBe('Non sono riuscito a scrivere il file Excel: riprova. Se succede ancora, esporta meno dati (meno strumenti o un periodo più breve).')
  })

  it('il chunk di exceljs che manca: passa il messaggio dello scrittore ("ricarica")', async () => {
    const ricarica = new ErroreApp('Non riesco a preparare l\'Excel: ricarica la pagina e riprova.')
    vi.mocked(scriviCartella).mockRejectedValueOnce(ricarica)
    await expect(avvia()).rejects.toBe(ricarica)
  })

  it('una scelta non valida: un messaggio dell\'app, e nessuna lettura', async () => {
    const errore = await avvia({ scelta: { ...SCELTA_TUTTO, periodo: { modo: 'settimane', n: 0 } } }).catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreApp)
    expect((errore as Error).message).toBe('Le scelte dell\'export non sono valide: controllale e riprova.')
    expect(caricaConfig).not.toHaveBeenCalled()
  })
})
