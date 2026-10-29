import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

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
import { caricaConfig } from '@/api/esperimenti'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento } from '@/domain/tipi'
import { ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { ElencoPiante } from './ElencoPiante'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

let config: ConfigEsperimento

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/piante']}>
        <Routes>
          <Route path="/esperimenti/:espId/piante" element={<ElencoPiante />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockResolvedValue(config)
})

describe('ElencoPiante', () => {
  it('ha il titolo "Piante" e la freccia indietro alla home dell\'esperimento', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Piante' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })

  it('elenca le piante in ordine, con etichetta e trattamento', async () => {
    vaiAllaPagina()
    const elenco = await screen.findByRole('list', { name: 'Piante' })
    const righe = within(elenco).getAllByRole('link')
    expect(righe).toHaveLength(56)
    expect(righe[0]).toHaveTextContent('1')
    expect(righe[0]).toHaveTextContent('Controllo')
    const trattamento = config.trattamenti.find(t => t.id === config.piante[55].trattamento_id)!
    expect(righe[55]).toHaveTextContent('56')
    expect(righe[55]).toHaveTextContent(trattamento.etichetta)
  })

  it('segue l\'ordine delle piante anche se arrivano mescolate', async () => {
    config.piante = [...config.piante].reverse()
    vaiAllaPagina()
    const righe = within(await screen.findByRole('list', { name: 'Piante' })).getAllByRole('link')
    expect(righe[0]).toHaveTextContent(/^1/)
    expect(righe[1]).toHaveTextContent(/^2/)
  })

  it('una riga apre la scheda della pianta', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    const righe = within(await screen.findByRole('list', { name: 'Piante' })).getAllByRole('link')
    expect(righe[2]).toHaveAttribute('href', `/esperimenti/E/piante/${config.piante[2].id}`)
    await utente.click(righe[2])
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/piante/${config.piante[2].id}`)
  })

  it('senza piante lo dice', async () => {
    config.piante = []
    vaiAllaPagina()
    expect(await screen.findByText('Questo esperimento non ha piante.')).toBeInTheDocument()
  })

  it('mentre carica mostra "Caricamento…"', () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('se la configurazione non arriva permette di riprovare', async () => {
    const utente = userEvent.setup()
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    await utente.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('list', { name: 'Piante' })).toBeInTheDocument()
  })

  it('un esperimento che non c\'è porta all\'elenco degli esperimenti', async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error(ESPERIMENTO_NON_TROVATO))
    vaiAllaPagina()
    expect(await screen.findByRole('link', { name: 'I miei esperimenti' })).toHaveAttribute('href', '/')
  })
})
