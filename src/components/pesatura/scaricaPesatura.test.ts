import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/graficoPng', () => ({ svgInPng: vi.fn(), fontDati: vi.fn() }))
vi.mock('@/lib/scaricaFile', () => ({ consegna: vi.fn() }))
vi.mock('@/lib/excel/scriviXlsx', () => ({ scriviCartella: vi.fn(), LARGHEZZA_IMMAGINE: 800, ALTEZZA_IMMAGINE: 450 }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { toast } from 'sonner'
import type { DatiPesatura } from '@/api/pesatura'
import { IMPOSTAZIONI_PREDEFINITE, type Peso, type SessionePesatura } from '@/domain/pesatura/tipi'
import type { ConfigEsperimento } from '@/domain/tipi'
import { ErroreApp } from '@/lib/errori'
import { scriviCartella } from '@/lib/excel/scriviXlsx'
import { fontDati, svgInPng } from '@/lib/graficoPng'
import { consegna } from '@/lib/scaricaFile'
import { GRAFICO_NON_DISEGNATO, scaricaGraficoPng, scaricaPesatura, SCRITTURA_NON_RIUSCITA } from './scaricaPesatura'

const config = {
  esperimento: { id: 'E', nome: 'Prova', data_inizio: null, note: '', stato: 'in_corso' }, fattori: [], trattamenti: [], piante: [], parametri: [], strumenti: [],
} as ConfigEsperimento
const sessione = (extra: Partial<SessionePesatura>): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', analisi_id: 'a1', titolo: 'Curve vasi', tipo: 'vasi', unita: 'g',
  impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, sensore: { tipo: 'tensione', unita: 'kPa' } }, data: '2026-11-11', nota: null, conclusa: false, ...extra,
})
const peso = (id: string, tipo: Peso['tipo'], valore: number, lettura: number | null = null): Peso => ({
  id, campione_id: 'v1', replica: 1, tipo, valore, lettura, misurato_il: `2026-11-11T0${id}:00:00Z`,
})
const vasi: DatiPesatura = {
  sessioni: [sessione({})],
  campioni: [{ id: 'v1', sessione_id: 'S', pianta_id: null, nome: 'V1', substrato: 'Torba', ordine: 1 }],
  pesi: [peso('1', 'secco', 100), peso('2', 'capacita_campo', 200), peso('3', 'asciugatura', 190, 5), peso('4', 'asciugatura', 150, 20), peso('5', 'asciugatura', 120, 50)],
}
const PNG = new Uint8Array([137, 80, 78, 71])
const BLOB = new Blob(['x'])

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fontDati).mockResolvedValue(null)
  vi.mocked(svgInPng).mockResolvedValue(PNG)
  vi.mocked(scriviCartella).mockResolvedValue(BLOB)
})

describe('scaricaPesatura', () => {
  it('vasi: disegna le curve, scrive il file con l\'immagine e lo consegna', async () => {
    const esito = await scaricaPesatura({ sessioni: vasi.sessioni, dati: vasi, config, oggi: '2026-11-12' })
    expect(svgInPng).toHaveBeenCalledTimes(1)
    const svg = vi.mocked(svgInPng).mock.calls[0][0]
    expect(svg).toContain('<svg')
    expect(svg).toContain('Torba')
    const immagini = vi.mocked(scriviCartella).mock.calls[0][1]
    expect(immagini.get('curve')).toBe(PNG)
    expect(consegna).toHaveBeenCalledWith(BLOB, 'Pesatura_Curve-vasi_2026-11-12.xlsx')
    expect(esito).toEqual({ nomeFile: 'Pesatura_Curve-vasi_2026-11-12.xlsx', grafici: 1, graficiNelFile: 1 })
    expect(toast.success).toHaveBeenCalledWith('Excel scaricato: Pesatura_Curve-vasi_2026-11-12.xlsx')
  })

  it('se il PNG è null il file parte lo stesso e lo dice', async () => {
    vi.mocked(svgInPng).mockResolvedValue(null)
    const esito = await scaricaPesatura({ sessioni: vasi.sessioni, dati: vasi, config, oggi: '2026-11-12' })
    expect(vi.mocked(scriviCartella).mock.calls[0][1].size).toBe(0)
    expect(consegna).toHaveBeenCalledTimes(1)
    expect(esito.graficiNelFile).toBe(0)
    expect(vi.mocked(toast.success).mock.calls[0][1]).toMatchObject({ description: expect.stringContaining('Il grafico non è nel file') })
  })

  it('senza vasi non disegna nulla', async () => {
    const s = sessione({ tipo: 'sostanza_secca', impostazioni: IMPOSTAZIONI_PREDEFINITE })
    await scaricaPesatura({ sessioni: [s], dati: { sessioni: [s], campioni: [], pesi: [] }, config, oggi: '2026-11-12' })
    expect(svgInPng).not.toHaveBeenCalled()
    expect(consegna).toHaveBeenCalledWith(BLOB, 'Pesatura_Curve-vasi_2026-11-12.xlsx')
  })

  it('una scrittura che fallisce dà un errore leggibile e non consegna', async () => {
    vi.mocked(scriviCartella).mockRejectedValue(new Error('boom'))
    await expect(scaricaPesatura({ sessioni: vasi.sessioni, dati: vasi, config })).rejects.toEqual(new ErroreApp(SCRITTURA_NON_RIUSCITA))
    expect(consegna).not.toHaveBeenCalled()
  })
})

describe('scaricaGraficoPng', () => {
  const gruppiEsito = async () => (await import('@/domain/pesatura/export')).gruppiDeiVasi(vasi.sessioni, vasi)

  it('consegna il PNG con un nome pulito', async () => {
    const { gruppi, sensore } = await gruppiEsito()
    const nome = await scaricaGraficoPng({ gruppi, sensore, titolo: 'Curve vasi', oggi: '2026-11-12' })
    expect(nome).toBe('Pesatura_Curve-vasi_curve_2026-11-12.png')
    const [blob, nomeFile] = vi.mocked(consegna).mock.calls[0]
    expect(nomeFile).toBe(nome)
    expect((blob as Blob).type).toBe('image/png')
  })

  it('se il browser non disegna il grafico lancia un errore e non consegna', async () => {
    vi.mocked(svgInPng).mockResolvedValue(null)
    const { gruppi, sensore } = await gruppiEsito()
    await expect(scaricaGraficoPng({ gruppi, sensore, titolo: 'Curve vasi' })).rejects.toEqual(new ErroreApp(GRAFICO_NON_DISEGNATO))
    expect(consegna).not.toHaveBeenCalled()
  })
})
