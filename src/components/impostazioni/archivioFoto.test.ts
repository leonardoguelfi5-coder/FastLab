import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'

vi.mock('@/api/foto', () => ({ listaFoto: vi.fn(), urlFoto: vi.fn(), archiviaFileFoto: vi.fn() }))
vi.mock('@/api/note', () => ({ listaNote: vi.fn() }))
// L'import dinamico di fflate è moccabile: la vera libreria, con `zipSync` spiata per vedere come viene chiamata.
vi.mock('fflate', async importOriginale => {
  const vera = await importOriginale<typeof import('fflate')>()
  return { ...vera, zipSync: vi.fn(vera.zipSync) }
})

import { zipSync } from 'fflate'
import { archiviaFileFoto, listaFoto, urlFoto } from '@/api/foto'
import { listaNote } from '@/api/note'
import { oggiLocale } from '@/lib/date'
import type { ConfigEsperimento, Foto } from '@/domain/tipi'
import { liberaSpazio, scaricaArchivio } from './archivioFoto'
import { useArchivioSessione } from './archivioSessione'

const E = 'e0000000-0000-4000-8000-000000000001'
const idDi = (c: string) => `${c.repeat(8)}-0000-4000-8000-000000000000`
const foto = (c: string, extra: Partial<Foto> = {}): Foto => ({
  id: idDi(c), data: '2026-10-28', percorso: `${E}/${idDi(c)}.jpg`, larghezza: 1, altezza: 1, byte: 3,
  pianta_id: null, nota_id: null, archiviata: false, archiviata_il: null, ...extra,
})
const config = {
  esperimento: { id: E, nome: 'Hydrochar / lotto 2', data_inizio: null, note: '', stato: 'concluso' },
  fattori: [], parametri: [], strumenti: [],
  trattamenti: [{ id: 't1', etichetta: 'Controllo', ordine: 0, livello_ids: [] }],
  piante: [{ id: 'p35', trattamento_id: 't1', etichetta: '35', blocco: null, ordine: 0 }],
} as ConfigEsperimento

const BYTE_DI = (url: string) => new Uint8Array([...url].map(c => c.charCodeAt(0) % 256))
let click: ReturnType<typeof vi.fn>
let scaricati: { download: string; href: string }[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useArchivioSessione.setState({ scaricati: {} })
  vi.mocked(listaFoto).mockReset()
  vi.mocked(urlFoto).mockReset()
  vi.mocked(archiviaFileFoto).mockReset()
  vi.mocked(listaNote).mockReset().mockResolvedValue([])
  vi.mocked(zipSync).mockClear()
  vi.mocked(urlFoto).mockImplementation(async percorsi => new Map(percorsi.map(p => [p, `https://storage/${p}?token=1`])))
  fetchMock = vi.fn(async (url: string) => new Response(BYTE_DI(url), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  scaricati = []
  click = vi.fn(function (this: HTMLAnchorElement) { scaricati.push({ download: this.download, href: this.href }) })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click as never)
  URL.createObjectURL = vi.fn(() => 'blob:zip') as never
  URL.revokeObjectURL = vi.fn() as never
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

/** Il Blob consegnato al download, riaperto come zip. */
async function zipScaricato() {
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
  return unzipSync(new Uint8Array(await blob.arrayBuffer()))
}

describe('scaricaArchivio', () => {
  it('scarica le foto, le mette nello zip con i nomi previsti e il foto.csv, e fa partire il download del file giusto', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('b', { pianta_id: 'p35' }), foto('a')])
    const esito = await scaricaArchivio({ espId: E, config, onProgresso: () => {} })

    expect(esito.foto).toBe(2)
    expect(scaricati).toEqual([{ download: `FastLab_Hydrochar-lotto-2_foto_${oggiLocale()}.zip`, href: 'blob:zip' }])
    const zip = await zipScaricato()
    expect(Object.keys(zip).sort()).toEqual(['2026-10-28_esperimento_aaaaaaaa.jpg', '2026-10-28_pianta-35_bbbbbbbb.jpg', 'foto.csv'])
    // Il contenuto di ogni foto è quello scaricato dal suo URL firmato.
    expect([...zip['2026-10-28_pianta-35_bbbbbbbb.jpg']]).toEqual([...BYTE_DI(`https://storage/${E}/${idDi('b')}.jpg?token=1`)])
  })

  it('il foto.csv ha il BOM, il punto e virgola, le foto in ordine di data e le colonne previste', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('b', { pianta_id: 'p35', nota_id: 'n1', data: '2026-10-29' }), foto('a')])
    vi.mocked(listaNote).mockResolvedValue([{ id: 'n1', data: '2026-10-29', testo: 'Foglie "gialle"', promemoria: false, fatto_il: null, pianta_ids: [], trattamento_ids: [] }])
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })

    const csv = (await zipScaricato())['foto.csv']
    expect([...csv.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(strFromU8(csv).split('\r\n')).toEqual([
      'data;pianta;trattamento;nota;nome del file;archiviata',
      '2026-10-28;;;;2026-10-28_esperimento_aaaaaaaa.jpg;',
      '2026-10-29;35;Controllo;"Foglie ""gialle""";2026-10-29_pianta-35_bbbbbbbb.jpg;',
    ])
  })

  it('le foto già archiviate sono nel CSV, segnate, ma non nello zip né tra quelle da liberare', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a'), foto('z', { archiviata: true, archiviata_il: '2026-10-30T10:00:00Z' })])
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })

    const zip = await zipScaricato()
    expect(Object.keys(zip).sort()).toEqual(['2026-10-28_esperimento_aaaaaaaa.jpg', 'foto.csv'])
    expect(strFromU8(zip['foto.csv'])).toContain('2026-10-28;;;;;sì')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useArchivioSessione.getState().scaricati[E]).toEqual([idDi('a')])
  })

  it('i file nello zip hanno tutti nomi diversi, anche con gli stessi primi 8 caratteri dell\'id', async () => {
    vi.mocked(listaFoto).mockResolvedValue([
      foto('a'), { ...foto('a'), id: 'aaaaaaaa-1111-4000-8000-000000000000', percorso: `${E}/aaaaaaaa-1111-4000-8000-000000000000.jpg` },
    ])
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })
    const nomi = Object.keys(await zipScaricato()).filter(n => n.endsWith('.jpg'))
    expect(new Set(nomi).size).toBe(2)
  })

  it('non ricomprime le foto (già JPEG): livello 0 per i file, e il CSV è un\'altra cosa', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a')])
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })

    const contenuto = vi.mocked(zipSync).mock.calls[0][0] as Record<string, [Uint8Array, { level: number }]>
    expect(contenuto['2026-10-28_esperimento_aaaaaaaa.jpg'][1]).toEqual({ level: 0 })
    expect(contenuto['foto.csv'][1].level).toBeGreaterThan(0)
  })

  it('dice a che punto è: prima 0 di N, poi una foto alla volta fino a N di N', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a'), foto('b'), foto('c')])
    const passi: [number, number][] = []
    await scaricaArchivio({ espId: E, config, onProgresso: (fatte, totale) => passi.push([fatte, totale]) })
    expect(passi).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]])
  })

  it('scarica al massimo 3 foto alla volta', async () => {
    vi.mocked(listaFoto).mockResolvedValue('abcdefgh'.split('').map(c => foto(c)))
    let attive = 0
    let massimo = 0
    fetchMock.mockImplementation(async (url: string) => {
      attive++
      massimo = Math.max(massimo, attive)
      await new Promise(r => setTimeout(r, 5))
      attive--
      return new Response(BYTE_DI(url), { status: 200 })
    })
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })
    expect(massimo).toBe(3)
  })

  it('chiede gli URL a gruppi da 100, appena prima di scaricarli (valgono un\'ora)', async () => {
    vi.mocked(listaFoto).mockResolvedValue(Array.from({ length: 230 }, (_, i) => foto(i.toString(16).padStart(2, '0')[0], {
      id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, percorso: `${E}/${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.jpg`,
    })))
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })
    expect(vi.mocked(urlFoto).mock.calls.map(c => c[0].length)).toEqual([100, 100, 30])
  })

  it('se una foto non si scarica ferma tutto: nessun download, nessuno stato per «Libera lo spazio»', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a'), foto('b'), foto('c')])
    fetchMock.mockImplementation(async (url: string) => (url.includes(idDi('b')) ? new Response('no', { status: 500 }) : new Response(BYTE_DI(url), { status: 200 })))

    await expect(scaricaArchivio({ espId: E, config, onProgresso: () => {} })).rejects.toThrow()

    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
  })

  it('un errore di rete a metà è lo stesso: ferma tutto e non si parte con le foto che restano', async () => {
    vi.mocked(listaFoto).mockResolvedValue('abcdefgh'.split('').map(c => foto(c)))
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(idDi('h'))) throw new TypeError('Failed to fetch')
      await new Promise(r => setTimeout(r, 5))
      return new Response(BYTE_DI(url), { status: 200 })
    })
    await expect(scaricaArchivio({ espId: E, config, onProgresso: () => {} })).rejects.toThrow('Failed to fetch')
    // Le tre in corso quando la prima è fallita possono finire, ma nessuna nuova parte dopo l'errore.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
    expect(click).not.toHaveBeenCalled()
  })

  it('una foto senza URL firmato (file non più nello spazio) ferma tutto', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a'), foto('b')])
    vi.mocked(urlFoto).mockResolvedValue(new Map([[`${E}/${idDi('a')}.jpg`, 'https://storage/a']]))
    await expect(scaricaArchivio({ espId: E, config, onProgresso: () => {} })).rejects.toThrow(/non è disponibile/)
    expect(click).not.toHaveBeenCalled()
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
  })

  it('se l\'impacchettamento fallisce non parte nessun download', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a')])
    vi.mocked(zipSync).mockImplementationOnce(() => { throw new Error('zip rotto') })
    await expect(scaricaArchivio({ espId: E, config, onProgresso: () => {} })).rejects.toThrow('zip rotto')
    expect(click).not.toHaveBeenCalled()
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
  })

  it('senza foto con il file non c\'è niente da scaricare', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('z', { archiviata: true, archiviata_il: '2026-10-30T10:00:00Z' })])
    await expect(scaricaArchivio({ espId: E, config, onProgresso: () => {} })).rejects.toThrow(/Non ci sono foto/)
    expect(click).not.toHaveBeenCalled()
  })

  it('segna il download riuscito con gli id delle foto che sono nello zip', async () => {
    vi.mocked(listaFoto).mockResolvedValue([foto('a'), foto('b')])
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })
    expect([...useArchivioSessione.getState().scaricati[E]].sort()).toEqual([idDi('a'), idDi('b')])
  })

  it('libera l\'indirizzo del Blob dopo il download, non subito (alcuni browser lo leggono dopo il click)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    vi.mocked(listaFoto).mockResolvedValue([foto('a')])
    await scaricaArchivio({ espId: E, config, onProgresso: () => {} })
    expect(click).toHaveBeenCalledTimes(1)
    await vi.runAllTimersAsync()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zip')
  })
})

describe('liberaSpazio', () => {
  it('senza un download in questa sessione non fa niente e non tocca lo Storage', async () => {
    await expect(liberaSpazio(E)).rejects.toThrow(/scarica/i)
    expect(archiviaFileFoto).not.toHaveBeenCalled()
  })

  it('archivia solo le foto che erano nello zip: quelle aggiunte dopo il download non si toccano', async () => {
    useArchivioSessione.getState().segna(E, [idDi('a'), idDi('b')])
    vi.mocked(listaFoto).mockResolvedValue([foto('c'), foto('b'), foto('a')])
    vi.mocked(archiviaFileFoto).mockResolvedValue(2)

    expect(await liberaSpazio(E)).toBe(2)

    expect(vi.mocked(archiviaFileFoto).mock.calls[0][1].map(f => f.id).sort()).toEqual([idDi('a'), idDi('b')])
  })

  it('una foto dello zip già archiviata o eliminata nel frattempo non si ripropone', async () => {
    useArchivioSessione.getState().segna(E, [idDi('a'), idDi('b'), idDi('d')])
    vi.mocked(listaFoto).mockResolvedValue([foto('a', { archiviata: true, archiviata_il: '2026-11-02T10:00:00Z' }), foto('b')])
    vi.mocked(archiviaFileFoto).mockResolvedValue(1)

    await liberaSpazio(E)

    expect(vi.mocked(archiviaFileFoto).mock.calls[0][1].map(f => f.id)).toEqual([idDi('b')])
  })

  it('a buon fine dimentica il download: «Libera» non si offre più', async () => {
    useArchivioSessione.getState().segna(E, [idDi('a')])
    vi.mocked(listaFoto).mockResolvedValue([foto('a')])
    vi.mocked(archiviaFileFoto).mockResolvedValue(1)
    await liberaSpazio(E)
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
    await expect(liberaSpazio(E)).rejects.toThrow()
  })

  it('se si ferma a metà il download resta valido e un nuovo giro completa', async () => {
    useArchivioSessione.getState().segna(E, [idDi('a'), idDi('b')])
    vi.mocked(listaFoto).mockResolvedValue([foto('a'), foto('b')])
    vi.mocked(archiviaFileFoto).mockRejectedValueOnce(new Error('rete')).mockResolvedValueOnce(2)

    await expect(liberaSpazio(E)).rejects.toThrow('rete')
    expect(useArchivioSessione.getState().scaricati[E]).toEqual([idDi('a'), idDi('b')])

    expect(await liberaSpazio(E)).toBe(2)
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
  })

  it('con tutte le foto dello zip già archiviate dimentica il download e dice 0', async () => {
    useArchivioSessione.getState().segna(E, [idDi('a')])
    vi.mocked(listaFoto).mockResolvedValue([foto('a', { archiviata: true, archiviata_il: '2026-11-02T10:00:00Z' })])
    expect(await liberaSpazio(E)).toBe(0)
    expect(archiviaFileFoto).not.toHaveBeenCalled()
    expect(useArchivioSessione.getState().scaricati[E]).toBeUndefined()
  })
})
