import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook: si finge solo il livello API (e il client Supabase, mai raggiunto).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/inviti', () => ({
  sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn(),
}))
vi.mock('@/api/esperimenti', () => ({
  listaEsperimenti: vi.fn(), caricaConfig: vi.fn(), creaEsperimento: vi.fn(), aggiornaEsperimento: vi.fn(),
}))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { Laboratorio } from './Laboratorio'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { email: 'giulia@example.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
})

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/laboratorio']}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio" element={<Laboratorio />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Laboratorio', () => {
  it('ha il titolo e la freccia indietro verso la home dell\'esperimento', () => {
    vaiAllaPagina()
    expect(screen.getByRole('heading', { name: 'Laboratorio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })

  it('ha una sola voce, Pesatura, che porta alla sua sezione', () => {
    vaiAllaPagina()
    const elenco = screen.getByRole('navigation', { name: 'Strumenti di laboratorio' })
    const link = within(elenco).getAllByRole('link')
    expect(link).toHaveLength(1)
    expect(within(elenco).getByRole('link', { name: 'Pesatura' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura')
  })
})
