import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/query', () => ({ useSonoAdmin: vi.fn() }))
// La pagina inviti ha i suoi test: qui interessa solo che il percorso la mostri.
vi.mock('@/pages/AdminInviti', () => ({
  AdminInviti: () => <h1>Pagina inviti (prova)</h1>,
}))
vi.mock('@/pages/Esperimenti', () => ({
  Esperimenti: () => <h1>Elenco esperimenti (prova)</h1>,
}))
vi.mock('@/pages/NuovoEsperimento', () => ({
  NuovoEsperimento: () => <h1>Procedura nuovo esperimento (prova)</h1>,
}))

import { useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { AppRoutes } from './App'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

/** Percorsi privati ancora segnaposto. */
const PERCORSI_SEGNAPOSTO = [
  '/esperimenti/x',
  '/esperimenti/x/piante/p',
  '/esperimenti/x/misure/m',
  '/esperimenti/x/impostazioni',
]
const PERCORSI_PRIVATI = ['/', ...PERCORSI_SEGNAPOSTO, '/esperimenti/nuovo', '/admin/inviti']

function vaiA(percorso: string) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <AppRoutes />
    </MemoryRouter>,
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

  it.each(PERCORSI_SEGNAPOSTO)('con la sessione %s mostra la pagina (segnaposto) nel guscio', (percorso) => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA(percorso)
    expect(screen.getByText('In costruzione')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
  })

  it('con la sessione / mostra l\'elenco degli esperimenti', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Elenco esperimenti (prova)' })).toBeInTheDocument()
    expect(screen.queryByText('In costruzione')).not.toBeInTheDocument()
  })

  it('con la sessione /admin/inviti mostra la pagina degli inviti', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/admin/inviti')
    expect(screen.getByRole('heading', { level: 1, name: 'Pagina inviti (prova)' })).toBeInTheDocument()
    expect(screen.queryByText('In costruzione')).not.toBeInTheDocument()
  })

  it('con la sessione /esperimenti/nuovo mostra la procedura guidata', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/esperimenti/nuovo')
    expect(screen.getByRole('heading', { level: 1, name: 'Procedura nuovo esperimento (prova)' })).toBeInTheDocument()
    expect(screen.queryByText('In costruzione')).not.toBeInTheDocument()
  })

  it('un percorso sconosciuto con la sessione torna a /', () => {
    vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
    vaiA('/boh')
    expect(screen.getByRole('heading', { level: 1, name: 'Elenco esperimenti (prova)' })).toBeInTheDocument()
  })
})
