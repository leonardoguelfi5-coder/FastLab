import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn() }))
vi.mock('@/api/auth', () => ({ useSessione: vi.fn() }))

import { useSessione } from '@/api/auth'
import { ruoloIn } from '@/api/persone'
import { usePermessi } from './usePermessi'

let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function leggi(ruolo: 'proprietario' | 'rilevatore' | 'lettore' | null | 'errore') {
  if (ruolo === 'errore') vi.mocked(ruoloIn).mockRejectedValue(new Error('Failed to fetch'))
  else vi.mocked(ruoloIn).mockResolvedValue(ruolo)
  const { result } = renderHook(() => usePermessi('E'), { wrapper })
  await waitFor(() => expect(result.current.caricamento).toBe(false))
  return result.current
}

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'io' } } as Session, caricamento: false })
})

describe('usePermessi', () => {
  it('proprietario: misura, configura e corregge tutto', async () => {
    const p = await leggi('proprietario')
    expect(p).toMatchObject({ ruoloNoto: true, puoMisurare: true, soloProprietario: false })
    expect(p.puoCorreggere('altro')).toBe(true)
    expect(p.puoCorreggere('io')).toBe(true)
  })

  it('rilevatore: misura, non configura, corregge solo le proprie (anche quelle senza autore: nate sul telefono)', async () => {
    const p = await leggi('rilevatore')
    expect(p).toMatchObject({ ruoloNoto: true, puoMisurare: true, soloProprietario: true })
    expect(p.puoCorreggere('io')).toBe(true)
    expect(p.puoCorreggere(undefined)).toBe(true)
    expect(p.puoCorreggere('altro')).toBe(false)
  })

  it('lettore: non misura, non corregge nulla, non configura', async () => {
    const p = await leggi('lettore')
    expect(p).toMatchObject({ ruoloNoto: true, puoMisurare: false, soloProprietario: true })
    expect(p.puoCorreggere('io')).toBe(false)
    expect(p.puoCorreggere(undefined)).toBe(false)
  })

  it('ruolo ignoto per un errore (senza rete e senza copia): non si nasconde nulla, la guardia è il database', async () => {
    const p = await leggi('errore')
    expect(p).toMatchObject({ ruoloNoto: false, puoMisurare: true, soloProprietario: false })
    expect(p.puoCorreggere('altro')).toBe(true)
  })

  it('mentre il ruolo si legge non si nasconde nulla: il giro non aspetta', () => {
    vi.mocked(ruoloIn).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePermessi('E'), { wrapper })
    expect(result.current).toMatchObject({ caricamento: true, ruoloNoto: false, puoMisurare: true, soloProprietario: false })
  })
})
