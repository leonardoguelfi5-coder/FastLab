import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn() }))
vi.mock('./misure', () => ({ misureDelGiorno: vi.fn(), misurePianta: vi.fn() }))
vi.mock('./inviti', () => ({ sonoAdmin: vi.fn() }))

import { caricaConfig, listaEsperimenti } from './esperimenti'
import { sonoAdmin } from './inviti'
import { misureDelGiorno, misurePianta } from './misure'
import {
  chiavi, creaQueryClient, useConfig, useEsperimenti, useMisureGiorno, useMisurePianta, useSonoAdmin,
} from './query'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => { vi.clearAllMocks() })

describe('chiavi', () => {
  it('sono stabili e distinte per esperimento, data e pianta', () => {
    expect(chiavi.esperimenti).toEqual(['esperimenti'])
    expect(chiavi.config('E')).toEqual(['config', 'E'])
    expect(chiavi.config('E')).not.toEqual(chiavi.config('F'))
    expect(chiavi.misureGiorno('E', '2026-10-28')).not.toEqual(chiavi.misureGiorno('E', '2026-10-29'))
    expect(chiavi.misurePianta('p1')).not.toEqual(chiavi.misurePianta('p2'))
    expect(chiavi.inviti).toEqual(['inviti'])
  })

  it('le chiavi delle misure condividono un prefisso, per invalidarle insieme', () => {
    expect(chiavi.misureGiorno('E', '2026-10-28')[0]).toBe('misure')
    expect(chiavi.misurePianta('p1')[0]).toBe('misure')
  })
})

describe('hook di lettura', () => {
  it('useEsperimenti legge l\'elenco', async () => {
    vi.mocked(listaEsperimenti).mockResolvedValue([])
    const { result } = renderHook(() => useEsperimenti(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('useConfig carica la configurazione dell\'esperimento', async () => {
    const config = { esperimento: { id: 'E' } }
    vi.mocked(caricaConfig).mockResolvedValue(config as never)
    const { result } = renderHook(() => useConfig('E'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(caricaConfig).toHaveBeenCalledWith('E')
    expect(result.current.data).toBe(config)
  })

  it('useConfig senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useConfig(undefined), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(caricaConfig).not.toHaveBeenCalled()
  })

  it('useMisureGiorno legge le misure del giorno', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([])
    const { result } = renderHook(() => useMisureGiorno('E', '2026-10-28'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(misureDelGiorno).toHaveBeenCalledWith('E', '2026-10-28')
  })

  it('useMisureGiorno senza esperimento non interroga il database', () => {
    const { result } = renderHook(() => useMisureGiorno(undefined, '2026-10-28'), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(misureDelGiorno).not.toHaveBeenCalled()
  })

  it('useMisurePianta legge la storia della pianta', async () => {
    vi.mocked(misurePianta).mockResolvedValue([])
    const { result } = renderHook(() => useMisurePianta('p1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(misurePianta).toHaveBeenCalledWith('p1')
  })

  it('useSonoAdmin legge il ruolo', async () => {
    vi.mocked(sonoAdmin).mockResolvedValue(true)
    const { result } = renderHook(() => useSonoAdmin(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(true)
  })
})

describe('creaQueryClient', () => {
  it('restituisce un QueryClient nuovo a ogni chiamata', () => {
    const a = creaQueryClient()
    expect(a).toBeInstanceOf(QueryClient)
    expect(creaQueryClient()).not.toBe(a)
  })
})
