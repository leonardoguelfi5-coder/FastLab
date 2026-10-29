import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/query', () => ({ useSonoAdmin: vi.fn() }))

import { useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { InArrivo } from './InArrivo'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(useSonoAdmin).mockReturnValue({ data: false } as never)
})

describe('InArrivo', () => {
  it.each(['Oggi', 'Dataset', 'Esporta Excel', 'Diario', 'Foto'])('%s: titolo, avviso e ritorno alla home dell\'esperimento', titolo => {
    render(
      <MemoryRouter initialEntries={['/esperimenti/E/sezione']}>
        <Routes>
          <Route path="/esperimenti/:espId/sezione" element={<InArrivo titolo={titolo} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: titolo })).toBeInTheDocument()
    expect(screen.getByText('Questa sezione arriva con il prossimo aggiornamento.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })
})
