import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))

import { accedi } from '@/api/auth'
import { Accedi } from './Accedi'

type Utente = ReturnType<typeof userEvent.setup>

function vaiAllaPagina() {
  render(
    <MemoryRouter initialEntries={['/accedi']}>
      <Routes>
        <Route path="/accedi" element={<Accedi />} />
        <Route path="/" element={<p>Home</p>} />
        <Route path="/registrati" element={<p>Pagina registrazione</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function compilaEInvia(utente: Utente) {
  await utente.type(screen.getByLabelText('Email'), 'a@b.it')
  await utente.type(screen.getByLabelText('Password'), 'segreta123')
  await utente.click(screen.getByRole('button', { name: 'Accedi' }))
}

beforeEach(() => { vi.clearAllMocks() })

describe('Accedi', () => {
  it('con credenziali valide chiama accedi e va in /', async () => {
    vi.mocked(accedi).mockResolvedValue(undefined)
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compilaEInvia(utente)

    expect(await screen.findByText('Home')).toBeInTheDocument()
    expect(accedi).toHaveBeenCalledExactlyOnceWith('a@b.it', 'segreta123')
  })

  it('con credenziali errate mostra il messaggio sotto il modulo e resta sulla pagina', async () => {
    vi.mocked(accedi).mockRejectedValue({ message: 'Invalid login credentials' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compilaEInvia(utente)

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o password errate.')
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accedi' })).toBeEnabled()
  })

  it('"Password dimenticata?" apre il testo per l\'amministratore', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    expect(screen.queryByText('Chiedi all\'amministratore di reimpostarla.')).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Password dimenticata?' }))
    expect(screen.getByText('Chiedi all\'amministratore di reimpostarla.')).toBeInTheDocument()
  })

  it('il link porta alla registrazione', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await utente.click(screen.getByRole('link', { name: /Registrati \(serve un invito\)/ }))
    expect(await screen.findByText('Pagina registrazione')).toBeInTheDocument()
  })
})
