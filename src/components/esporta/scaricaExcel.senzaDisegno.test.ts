import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

// Il chunk di react-dom/server che non arriva: i grafici non si disegnano, ma il file con i dati parte e lo dice.
vi.mock('react-dom/server', () => { throw new Error('Failed to fetch dynamically imported module') })
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/esperimenti', () => ({ caricaConfig: vi.fn() }))
vi.mock('@/api/misure', () => ({ misureStrumento: vi.fn(), ultimaMisuraPerStrumento: vi.fn() }))
vi.mock('@/api/note', () => ({ listaNote: vi.fn(), eliminaNota: vi.fn() }))
vi.mock('@/lib/graficoPng', () => ({ svgInPng: vi.fn(), fontDati: vi.fn() }))
vi.mock('@/lib/scaricaFile', () => ({ consegna: vi.fn() }))
vi.mock('@/lib/excel/scriviXlsx', () => ({ scriviCartella: vi.fn(), LARGHEZZA_IMMAGINE: 800, ALTEZZA_IMMAGINE: 450 }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))

import { toast } from 'sonner'
import { caricaConfig } from '@/api/esperimenti'
import { misureStrumento, ultimaMisuraPerStrumento } from '@/api/misure'
import { listaNote } from '@/api/note'
import { SCELTA_TUTTO } from '@/domain/export/scelte'
import { configExport, misura, p1, p2, sSpad, spad, uuid } from '@/domain/export/test-helpers'
import { scriviCartella } from '@/lib/excel/scriviXlsx'
import { svgInPng } from '@/lib/graficoPng'
import { consegna } from '@/lib/scaricaFile'
import { scaricaExcel } from './scaricaExcel'

describe('scaricaExcel senza react-dom/server', () => {
  it('il file parte senza immagini e il toast lo dice', async () => {
    vi.mocked(caricaConfig).mockResolvedValue(configExport())
    vi.mocked(misureStrumento).mockImplementation(async (_e, id) => (id === sSpad.id
      ? [misura(p1, sSpad, '2026-10-20', '09:00', { [spad.id]: [40, 42] }), misura(p2, sSpad, '2026-10-20', '09:10', { [spad.id]: [38] })]
      : []))
    vi.mocked(listaNote).mockResolvedValue([])
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map())
    vi.mocked(scriviCartella).mockResolvedValue(new Blob(['xlsx']))
    const esito = await scaricaExcel({ queryClient: new QueryClient(), espId: uuid(900), scelta: SCELTA_TUTTO, oggi: '2026-11-02' })
    expect(esito).toMatchObject({ grafici: 1, graficiNelFile: 0 })
    expect(svgInPng).not.toHaveBeenCalled()
    expect(vi.mocked(scriviCartella).mock.calls[0][1].size).toBe(0)
    expect(consegna).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.success).mock.calls[0][1]?.description).toBe('I grafici non sono nel file: questo browser non li ha disegnati.')
  })
})
