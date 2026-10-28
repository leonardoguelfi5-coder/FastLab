import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/query', () => ({ useSonoAdmin: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { toast } from 'sonner'
import { esci, useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { AppShell } from './AppShell'

type Utente = ReturnType<typeof userEvent.setup>

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

function impostaAdmin(admin: boolean) {
  vi.mocked(useSonoAdmin).mockReturnValue({ data: admin } as never)
}

function mostra(shell: ReactElement, client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/campo']}>
        <Routes>
          <Route path="/campo" element={shell} />
          <Route path="/" element={<p>Elenco esperimenti</p>} />
          <Route path="/accedi" element={<p>Pagina accesso</p>} />
          <Route path="/admin/inviti" element={<p>Pagina inviti</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

const apriMenu = (utente: Utente) => utente.click(screen.getByRole('button', { name: 'Menu' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  impostaAdmin(false)
})

describe('AppShell', () => {
  it('mostra il titolo, il contenuto e le azioni della pagina', () => {
    mostra(<AppShell titolo="Campo" azioni={<button>Azione di pagina</button>}><p>Corpo</p></AppShell>)
    expect(screen.getByRole('heading', { level: 1, name: 'Campo' })).toBeInTheDocument()
    expect(screen.getByText('Corpo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Azione di pagina' })).toBeInTheDocument()
  })

  it('la freccia indietro porta al percorso indicato', async () => {
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo" indietro="/"><p>Corpo</p></AppShell>)
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(await screen.findByText('Elenco esperimenti')).toBeInTheDocument()
  })

  it('senza `indietro` non c\'è la freccia', () => {
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    expect(screen.queryByRole('link', { name: 'Indietro' })).not.toBeInTheDocument()
  })

  it('il menu è chiuso all\'inizio e mostra l\'email dell\'utente quando si apre', async () => {
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    expect(screen.queryByText('giulia@example.it')).not.toBeInTheDocument()
    await apriMenu(utente)
    expect(screen.getByText('giulia@example.it')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esci' })).toBeInTheDocument()
  })

  it('il menu si chiude con Escape', async () => {
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    await apriMenu(utente)
    await utente.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Esci' })).not.toBeInTheDocument()
  })

  it('il menu si chiude toccando fuori', async () => {
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    await apriMenu(utente)
    await utente.click(screen.getByText('Corpo'))
    expect(screen.queryByRole('button', { name: 'Esci' })).not.toBeInTheDocument()
  })

  it('la voce "Inviti" non compare se non si è amministratori', async () => {
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    await apriMenu(utente)
    expect(screen.queryByRole('link', { name: 'Inviti' })).not.toBeInTheDocument()
  })

  it('per l\'amministratore "Inviti" porta a /admin/inviti', async () => {
    impostaAdmin(true)
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    await apriMenu(utente)
    await utente.click(screen.getByRole('link', { name: 'Inviti' }))
    expect(await screen.findByText('Pagina inviti')).toBeInTheDocument()
  })

  it('"Esci" chiama esci, svuota la cache delle query e va su /accedi', async () => {
    vi.mocked(esci).mockResolvedValue(undefined)
    const client = new QueryClient()
    client.setQueryData(['esperimenti'], [{ id: 'e1' }])
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>, client)

    await apriMenu(utente)
    await utente.click(screen.getByRole('button', { name: 'Esci' }))

    expect(await screen.findByText('Pagina accesso')).toBeInTheDocument()
    expect(esci).toHaveBeenCalledOnce()
    expect(client.getQueryData(['esperimenti'])).toBeUndefined()
  })

  it('se "esci" fallisce mostra l\'errore, resta dov\'è e non svuota la cache', async () => {
    vi.mocked(esci).mockRejectedValue({ message: 'Failed to fetch' })
    const client = new QueryClient()
    client.setQueryData(['esperimenti'], [{ id: 'e1' }])
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>, client)

    await apriMenu(utente)
    await utente.click(screen.getByRole('button', { name: 'Esci' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/Il server non risponde/)
    expect(screen.getByText('Corpo')).toBeInTheDocument()
    expect(client.getQueryData(['esperimenti'])).toEqual([{ id: 'e1' }])
  })
})
