import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))

import { useSessione } from '@/api/auth'
import { RequireAuth } from './RequireAuth'

const SESSIONE = { user: { email: 'a@b.it' } } as Session

function vaiA(percorso: string) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/accedi" element={<p>Pagina accesso</p>} />
        <Route path="/privata" element={<RequireAuth><p>Contenuto riservato</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('RequireAuth', () => {
  it('senza sessione reindirizza a /accedi', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: false })
    vaiA('/privata')
    expect(screen.getByText('Pagina accesso')).toBeInTheDocument()
    expect(screen.queryByText('Contenuto riservato')).not.toBeInTheDocument()
  })

  it('con la sessione mostra i figli', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/privata')
    expect(screen.getByText('Contenuto riservato')).toBeInTheDocument()
    expect(screen.queryByText('Pagina accesso')).not.toBeInTheDocument()
  })

  it('durante il caricamento mostra uno spinner e non reindirizza né mostra i figli', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: null, caricamento: true })
    vaiA('/privata')
    expect(screen.getByRole('status', { name: 'Caricamento' })).toBeInTheDocument()
    expect(screen.queryByText('Pagina accesso')).not.toBeInTheDocument()
    expect(screen.queryByText('Contenuto riservato')).not.toBeInTheDocument()
  })
})
