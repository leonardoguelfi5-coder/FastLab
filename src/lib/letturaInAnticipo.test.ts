import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/misure', () => ({ misureDelGiorno: vi.fn(), misurePianta: vi.fn() }))

import { misureDelGiorno, misurePianta } from '@/api/misure'
import { chiavi } from '@/api/query'
import type { ConfigEsperimento, Pianta } from '@/domain/tipi'
import { ePersistente } from './cachePersistente'
import {
  CONCORRENZA_ANTICIPO, dimenticaLettureInAnticipo, FINESTRA_ANTICIPO_MS, leggiInAnticipo, MASSIMO_PIANTE_ANTICIPO,
} from './letturaInAnticipo'

const ADESSO = Date.parse('2026-11-05T08:00:00Z')
const pianta = (i: number, prefisso = 'p'): Pianta => ({ id: `${prefisso}${i}`, etichetta: String(i), ordine: i } as Pianta)
/** Le piante dell'esperimento E si chiamano p1, p2...; quelle di un altro esperimento f1, f2... */
const configCon = (n: number, espId = 'E'): ConfigEsperimento => ({
  esperimento: { id: espId }, fattori: [], trattamenti: [], parametri: [], strumenti: [],
  piante: Array.from({ length: n }, (_, i) => pianta(i + 1, espId === 'E' ? 'p' : 'f')),
}) as unknown as ConfigEsperimento

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const lette = () => vi.mocked(misurePianta).mock.calls.map(([id]) => id)

beforeEach(() => {
  vi.mocked(misureDelGiorno).mockReset().mockResolvedValue([])
  vi.mocked(misurePianta).mockReset().mockResolvedValue([])
  dimenticaLettureInAnticipo()
  // Solo `Date`: i timer veri servono a React Query.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(ADESSO)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('leggiInAnticipo', () => {
  it('con la rete legge le misure del giorno scelto e quelle di ogni pianta, nell\'elenco della copia sul telefono', async () => {
    const qc = client()
    await leggiInAnticipo(qc, 'E', configCon(56), '2026-11-05')
    expect(misureDelGiorno).toHaveBeenCalledExactlyOnceWith('E', '2026-11-05')
    expect(lette()).toHaveLength(56)
    expect(new Set(lette()).size).toBe(56)
    expect(qc.getQueryData(chiavi.misureGiorno('E', '2026-11-05'))).toEqual([])
    expect(qc.getQueryData(chiavi.misurePianta('p56'))).toEqual([])
    for (const q of qc.getQueryCache().getAll()) expect(ePersistente(q.queryKey), JSON.stringify(q.queryKey)).toBe(true)
  })

  it('non più di 4 letture insieme', async () => {
    let inCorso = 0
    let massimo = 0
    vi.mocked(misurePianta).mockImplementation(async () => {
      inCorso++
      massimo = Math.max(massimo, inCorso)
      await new Promise(r => setTimeout(r, 1))
      inCorso--
      return []
    })
    await leggiInAnticipo(client(), 'E', configCon(20), '2026-11-05')
    expect(lette()).toHaveLength(20)
    expect(CONCORRENZA_ANTICIPO).toBe(4)
    expect(massimo).toBe(4)
  })

  it('senza rete non legge nulla', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await leggiInAnticipo(client(), 'E', configCon(5), '2026-11-05')
    expect(misureDelGiorno).not.toHaveBeenCalled()
    expect(misurePianta).not.toHaveBeenCalled()
  })

  it('senza rete non conta come fatto: con la rete tornata legge', async () => {
    const rete = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const qc = client()
    await leggiInAnticipo(qc, 'E', configCon(5), '2026-11-05')
    rete.mockReturnValue(true)
    await leggiInAnticipo(qc, 'E', configCon(5), '2026-11-05')
    expect(lette()).toHaveLength(5)
  })

  it('le piante non si rileggono entro 30 minuti (riaprendo la home o la scelta dello strumento); dopo sì', async () => {
    const qc = client()
    await leggiInAnticipo(qc, 'E', configCon(5), '2026-11-05')
    vi.setSystemTime(ADESSO + FINESTRA_ANTICIPO_MS - 1)
    await leggiInAnticipo(qc, 'E', configCon(5), '2026-11-05')
    expect(lette()).toHaveLength(5)
    expect(misureDelGiorno).toHaveBeenCalledOnce()
    vi.setSystemTime(ADESSO + FINESTRA_ANTICIPO_MS + 1)
    await leggiInAnticipo(qc, 'E', configCon(5), '2026-11-05')
    expect(lette()).toHaveLength(10)
  })

  it('un altro esperimento ha la sua finestra; un\'altra data di rilievo si legge subito', async () => {
    const qc = client()
    await leggiInAnticipo(qc, 'E', configCon(3), '2026-11-05')
    await leggiInAnticipo(qc, 'F', configCon(2, 'F'), '2026-11-05')
    expect(lette()).toHaveLength(5)
    await leggiInAnticipo(qc, 'E', configCon(3), '2026-11-04')
    expect(misureDelGiorno).toHaveBeenLastCalledWith('E', '2026-11-04')
    expect(lette()).toHaveLength(5)
  })

  it('oltre 300 piante legge solo le prime 300 nell\'ordine del giro', async () => {
    const config = configCon(320)
    config.piante.reverse()
    await leggiInAnticipo(client(), 'E', config, '2026-11-05')
    expect(MASSIMO_PIANTE_ANTICIPO).toBe(300)
    expect(lette()).toHaveLength(300)
    expect(lette()).toContain('p1')
    expect(lette()).not.toContain('p301')
  })

  it('una pianta letta da poco non si rilegge', async () => {
    const qc = client()
    qc.setQueryData(chiavi.misurePianta('p1'), [])
    await leggiInAnticipo(qc, 'E', configCon(3), '2026-11-05')
    expect(lette()).toEqual(['p2', 'p3'])
  })

  it('un fallimento non lancia e non ferma le altre piante', async () => {
    vi.mocked(misurePianta).mockImplementation(async id => { if (id === 'p2') throw new Error('Rete debole'); return [] })
    vi.mocked(misureDelGiorno).mockRejectedValue(new Error('Rete debole'))
    const qc = client()
    await expect(leggiInAnticipo(qc, 'E', configCon(4), '2026-11-05')).resolves.toBeUndefined()
    expect(lette()).toHaveLength(4)
    expect(qc.getQueryData(chiavi.misurePianta('p4'))).toEqual([])
  })

  it('se la rete cade a metà si ferma', async () => {
    const rete = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(misurePianta).mockImplementation(async id => { if (id === 'p4') rete.mockReturnValue(false); return [] })
    await leggiInAnticipo(client(), 'E', configCon(30), '2026-11-05')
    expect(lette().length).toBeLessThan(30)
  })
})
