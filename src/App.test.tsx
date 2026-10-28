import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/query', () => ({ useSonoAdmin: vi.fn() }))

import { useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { AppRoutes } from './App'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

const PERCORSI_PRIVATI = [
  '/',
  '/esperimenti/nuovo',
  '/esperimenti/x',
  '/esperimenti/x/piante/p',
  '/esperimenti/x/misure/m',
  '/esperimenti/x/impostazioni',
  '/admin/inviti',
]

function vaiA(percorso: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[percorso]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSonoAdmin).mockReturnValue({ data: false } as never)
})

describe('AppRoutes', () => {
  it.each(PERCORSI_PRIVATI)('senza sessione %s porta a /accedi', (percorso) => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: false })
    vaiA(percorso)
    expect(screen.getByRole('button', { name: 'Accedi' })).toBeInTheDocument()
    expect(screen.queryByText('In costruzione')).not.toBeInTheDocument()
  })

  it('/accedi e /registrati sono pubbliche', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: false })
    vaiA('/registrati')
    expect(screen.getByLabelText('Codice invito')).toBeInTheDocument()
  })

  it.each(PERCORSI_PRIVATI)('con la sessione %s mostra la pagina (segnaposto) nel guscio', (percorso) => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA(percorso)
    expect(screen.getByText('In costruzione')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
  })

  it('un percorso sconosciuto con la sessione torna a /', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/boh')
    expect(screen.getByRole('heading', { level: 1, name: 'Esperimenti' })).toBeInTheDocument()
  })
})
