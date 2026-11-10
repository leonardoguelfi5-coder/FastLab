import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))

import { registrati } from '@/api/auth'
import { Registrati } from './Registrati'

type Utente = ReturnType<typeof userEvent.setup>

function vaiAllaPagina() {
  render(
    <MemoryRouter initialEntries={['/registrati']}>
      <Routes>
        <Route path="/registrati" element={<Registrati />} />
        <Route path="/" element={<p>Home</p>} />
        <Route path="/accedi" element={<p>Pagina accesso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function compila(utente: Utente, v: { email?: string; password?: string; conferma?: string; codice?: string }) {
  if (v.email !== undefined) await utente.type(screen.getByLabelText('Email'), v.email)
  if (v.password !== undefined) await utente.type(screen.getByLabelText('Password'), v.password)
  if (v.conferma !== undefined) await utente.type(screen.getByLabelText('Conferma password'), v.conferma)
  if (v.codice !== undefined) await utente.type(screen.getByLabelText('Codice invito'), v.codice)
}

const inviaModulo = (utente: Utente) => utente.click(screen.getByRole('button', { name: 'Registrati' }))

beforeEach(() => { vi.clearAllMocks() })

describe('Registrati', () => {
  it('ha i quattro campi; il codice invito ha il suggerimento e non usa autocompletamento', () => {
    vaiAllaPagina()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Conferma password')).toBeInTheDocument()
    const codice = screen.getByLabelText('Codice invito')
    expect(codice).toHaveAttribute('autocapitalize', 'characters')
    expect(codice).toHaveAttribute('autocomplete', 'off')
    expect(codice).toHaveAccessibleDescription('Lo trovi nel messaggio di invito.')
  })

  it('mostra "Le password non coincidono." e non chiama registrati', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compila(utente, { email: 'a@b.it', password: 'abcdefgh', conferma: 'abcdefgX', codice: 'K7Q2' })
    await inviaModulo(utente)

    expect(await screen.findByText('Le password non coincidono.')).toBeInTheDocument()
    expect(registrati).not.toHaveBeenCalled()
  })

  it('con meno di 8 caratteri mostra il messaggio sulla lunghezza e non chiama registrati', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compila(utente, { email: 'a@b.it', password: 'abc1234', conferma: 'abc1234', codice: 'K7Q2' })
    await inviaModulo(utente)

    expect(await screen.findByText('La password deve avere almeno 8 caratteri.')).toBeInTheDocument()
    expect(registrati).not.toHaveBeenCalled()
  })

  it('con il codice vuoto (o di soli spazi) chiede il codice e non chiama registrati', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compila(utente, { email: 'a@b.it', password: 'abcdefgh', conferma: 'abcdefgh', codice: '  ' })
    await inviaModulo(utente)

    expect(await screen.findByText('Inserisci il codice invito.')).toBeInTheDocument()
    expect(registrati).not.toHaveBeenCalled()
  })

  it('se registrati rifiuta con INVITO_MANCANTE mostra il messaggio d\'errore tradotto e resta sulla pagina', async () => {
    vi.mocked(registrati).mockRejectedValue({ message: 'INVITO_MANCANTE' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compila(utente, { email: 'a@b.it', password: 'abcdefgh', conferma: 'abcdefgh', codice: 'K7Q2' })
    await inviaModulo(utente)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Email o codice invito non validi/)
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    // dopo l'errore si può riprovare
    expect(screen.getByRole('button', { name: 'Registrati' })).toBeEnabled()
  })

  it('a registrazione riuscita passa i dati a registrati e va in /', async () => {
    vi.mocked(registrati).mockResolvedValue({ user: { id: 'u1' } } as Session)
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compila(utente, { email: 'a@b.it', password: 'abcdefgh', conferma: 'abcdefgh', codice: 'k7q2' })
    await inviaModulo(utente)

    expect(await screen.findByText('Home')).toBeInTheDocument()
    expect(registrati).toHaveBeenCalledExactlyOnceWith('a@b.it', 'abcdefgh', 'k7q2')
  })

  it('senza sessione (email da confermare) non va in /: chiede di controllare l\'email e rimanda all\'accesso', async () => {
    vi.mocked(registrati).mockResolvedValue(null)
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await compila(utente, { email: 'a@b.it', password: 'abcdefgh', conferma: 'abcdefgh', codice: 'K7Q2' })
    await inviaModulo(utente)

    expect(await screen.findByRole('status')).toHaveTextContent('Controlla la tua email per confermare l\'account, poi accedi.')
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Codice invito')).not.toBeInTheDocument()
    expect(registrati).toHaveBeenCalledOnce()

    await utente.click(screen.getByRole('link', { name: 'Accedi' }))
    expect(await screen.findByText('Pagina accesso')).toBeInTheDocument()
  })

  it('ha un link per chi ha già un account', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await utente.click(screen.getByRole('link', { name: /Accedi/ }))
    expect(await screen.findByText('Pagina accesso')).toBeInTheDocument()
  })
})
