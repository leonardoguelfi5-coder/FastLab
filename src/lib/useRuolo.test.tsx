import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn() }))

import { ruoloIn } from '@/api/persone'
import { chiavi } from '@/api/query'
import { ePersistente } from './cachePersistente'
import { useRuolo } from './useRuolo'

let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useRuolo', () => {
  it.each([
    ['proprietario', true, true],
    ['rilevatore', true, false],
    ['lettore', false, false],
  ] as const)('%s: puoScrivere %s, puoConfigurare %s', async (ruolo, puoScrivere, puoConfigurare) => {
    vi.mocked(ruoloIn).mockResolvedValue(ruolo)
    const { result } = renderHook(() => useRuolo('E'), { wrapper })
    await waitFor(() => expect(result.current.caricamento).toBe(false))
    expect(result.current).toEqual({ ruolo, puoScrivere, puoConfigurare, caricamento: false })
    expect(ruoloIn).toHaveBeenCalledWith('E')
  })

  it('chi non è membro: nessun ruolo, nessun permesso', async () => {
    vi.mocked(ruoloIn).mockResolvedValue(null)
    const { result } = renderHook(() => useRuolo('E'), { wrapper })
    await waitFor(() => expect(result.current.caricamento).toBe(false))
    expect(result.current).toEqual({ ruolo: null, puoScrivere: false, puoConfigurare: false, caricamento: false })
  })

  it('mentre legge, nessun permesso (l\'interfaccia aspetta: la guardia vera è il database)', () => {
    vi.mocked(ruoloIn).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useRuolo('E'), { wrapper })
    expect(result.current).toEqual({ ruolo: null, puoScrivere: false, puoConfigurare: false, caricamento: true })
  })

  it('senza esperimento non legge nulla', () => {
    const { result } = renderHook(() => useRuolo(undefined), { wrapper })
    expect(ruoloIn).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ ruolo: null, puoScrivere: false, puoConfigurare: false })
  })

  it('usa la chiave sotto la configurazione, che la copia sul telefono conserva (senza rete il lettore resta lettore)', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    const { result } = renderHook(() => useRuolo('E'), { wrapper })
    await waitFor(() => expect(result.current.caricamento).toBe(false))
    expect(chiavi.ruolo('E')).toEqual(['config', 'E', 'ruolo'])
    expect(client.getQueryData(chiavi.ruolo('E'))).toBe('lettore')
    expect(ePersistente(chiavi.ruolo('E'))).toBe(true)
  })

  it('un ruolo già in memoria (ripristinato dalla copia) vale subito', () => {
    client.setQueryData(chiavi.ruolo('E'), 'rilevatore')
    vi.mocked(ruoloIn).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useRuolo('E'), { wrapper })
    expect(result.current).toEqual({ ruolo: 'rilevatore', puoScrivere: true, puoConfigurare: false, caricamento: false })
  })
})
