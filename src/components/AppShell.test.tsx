import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/query', () => ({ useSonoAdmin: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { toast } from 'sonner'
import { esci, useSessione } from '@/api/auth'
import { useSonoAdmin } from '@/api/query'
import { accoda, impostaUtenteCoda } from '@/lib/coda/codaMisure'
import { AppShell } from './AppShell'

type Utente = ReturnType<typeof userEvent.setup>

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

function impostaAdmin(admin: boolean) {
  vi.mocked(useSonoAdmin).mockReturnValue({ data: admin } as never)
}

function mostra(shell: ReactElement) {
  render(
    <MemoryRouter initialEntries={['/campo']}>
      <Routes>
        <Route path="/campo" element={shell} />
        <Route path="/" element={<p>Elenco esperimenti</p>} />
        <Route path="/admin/inviti" element={<p>Pagina inviti</p>} />
        <Route path="/catalogo" element={<p>Pagina catalogo</p>} />
      </Routes>
    </MemoryRouter>,
  )
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

  it('"Catalogo strumenti" è nel menu di tutti e porta a /catalogo', async () => {
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
    expect(screen.queryByRole('link', { name: 'Catalogo strumenti' })).not.toBeInTheDocument()
    await apriMenu(utente)
    await utente.click(screen.getByRole('link', { name: 'Catalogo strumenti' }))
    expect(await screen.findByText('Pagina catalogo')).toBeInTheDocument()
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

  it('"Esci" chiama esci e chiude il menu (il resto lo fanno RequireAuth e la cache centrale)', async () => {
    vi.mocked(esci).mockResolvedValue(undefined)
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)

    await apriMenu(utente)
    await utente.click(screen.getByRole('button', { name: 'Esci' }))

    expect(esci).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Esci' })).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('se "esci" fallisce mostra l\'errore tradotto e resta dov\'è', async () => {
    vi.mocked(esci).mockRejectedValue({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)

    await apriMenu(utente)
    await utente.click(screen.getByRole('button', { name: 'Esci' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/Rete debole/)
    expect(screen.getByText('Corpo')).toBeInTheDocument()
  })

  describe('con misure in coda d\'invio (Piano E, Task E6)', () => {
    const misura = (id: string) => ({ id, pianta_id: 'p', strumento_id: 's', data_rilievo: '2026-10-28', ora: '09:12', valori: {} })
    const metti = (utente: string, id: string) => accoda(utente, 'E', misura(id), { etichetta: '35', strumento: 'SPAD', sulServer: false })
    beforeEach(() => {
      localStorage.clear()
      impostaUtenteCoda('u1')
    })
    afterEach(() => impostaUtenteCoda(null))

    it('l\'intestazione dice quante misure sono da inviare', () => {
      metti('u1', 'm1')
      metti('u1', 'm2')
      metti('u1', 'm3')
      mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
      expect(screen.getByRole('button', { name: '3 misure da inviare' })).toBeInTheDocument()
    })

    it('un altro utente non vede la coda del primo', () => {
      metti('u2', 'm1')
      mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
      expect(screen.queryByRole('button', { name: /da inviare/ })).not.toBeInTheDocument()
    })

    it('"Esci" con misure in coda chiede conferma e dice quando partiranno', async () => {
      vi.mocked(esci).mockResolvedValue(undefined)
      metti('u1', 'm1')
      metti('u1', 'm2')
      metti('u1', 'm3')
      const utente = userEvent.setup({ delay: null })
      mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)

      await apriMenu(utente)
      await utente.click(screen.getByRole('button', { name: 'Esci' }))
      const dialogo = await screen.findByRole('dialog', { name: 'Uscire con misure da inviare?' })
      expect(dialogo).toHaveTextContent('Ci sono 3 misure da inviare: partiranno al tuo prossimo accesso su questo telefono.')
      expect(esci).not.toHaveBeenCalled()

      await utente.click(screen.getByRole('button', { name: 'Resta' }))
      expect(esci).not.toHaveBeenCalled()

      await apriMenu(utente)
      await utente.click(screen.getByRole('button', { name: 'Esci' }))
      await utente.click(await screen.findByRole('button', { name: 'Esci comunque' }))
      expect(esci).toHaveBeenCalledOnce()
    })

    it('con una misura sola la frase è al singolare', async () => {
      metti('u1', 'm1')
      const utente = userEvent.setup({ delay: null })
      mostra(<AppShell titolo="Campo"><p>Corpo</p></AppShell>)
      await apriMenu(utente)
      await utente.click(screen.getByRole('button', { name: 'Esci' }))
      expect(await screen.findByRole('dialog')).toHaveTextContent('C\'è 1 misura da inviare: partirà al tuo prossimo accesso su questo telefono.')
    })
  })
})
