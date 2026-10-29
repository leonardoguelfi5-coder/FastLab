import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache: si finge solo il livello API (e il client Supabase, mai raggiunto).
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
import { listaEsperimenti, type RiepilogoEsperimento } from '@/api/esperimenti'
import { Esperimenti } from './Esperimenti'

type Utente = ReturnType<typeof userEvent.setup>

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

/** "Oggi" nei test: 30 ottobre 2026, a metà mattina (ora locale). */
const ORA = new Date(2026, 9, 30, 10, 0, 0)

const HYDROCHAR: RiepilogoEsperimento = {
  id: 'e1', nome: 'Hydrochar × Cuore di Bue', stato: 'in_corso', data_inizio: '2026-10-01',
  n_piante: 56, n_trattamenti: 4, ultima_data: '2026-10-30', piante_ultima_data: 34,
}
const SERRA: RiepilogoEsperimento = {
  id: 'e2', nome: 'Prova serra', stato: 'concluso', data_inizio: null,
  n_piante: 12, n_trattamenti: 3, ultima_data: '2026-10-28', piante_ultima_data: 12,
}
const VUOTO: RiepilogoEsperimento = {
  id: 'e3', nome: 'Appena creato', stato: 'in_corso', data_inizio: null,
  n_piante: 8, n_trattamenti: 2, ultima_data: null, piante_ultima_data: 0,
}

/** Mostra dove si è finiti dopo un tocco (percorso e parametri). */
function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Esperimenti />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const posizione = () => screen.getByTestId('posizione').textContent
const scheda = (nome: string) => screen.getByRole('heading', { level: 2, name: nome }).closest('li') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  // Solo `Date`: i timer veri servono a React Query e a userEvent.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(ORA)
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(listaEsperimenti).mockResolvedValue([HYDROCHAR, SERRA, VUOTO])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Esperimenti: pagina', () => {
  it('ha il titolo "Esperimenti" e nessuna freccia indietro', async () => {
    vaiAllaPagina()
    expect(screen.getByRole('heading', { level: 1, name: 'Esperimenti' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Indietro' })).not.toBeInTheDocument()
    await screen.findByRole('heading', { level: 2, name: HYDROCHAR.nome })
  })

  it('mentre carica mostra "Caricamento…"', () => {
    vi.mocked(listaEsperimenti).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('mostra una scheda per esperimento con nome, piante, trattamenti e stato', async () => {
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: HYDROCHAR.nome })

    expect(within(scheda(HYDROCHAR.nome)).getByText('56 piante · 4 trattamenti · in corso')).toBeInTheDocument()
    expect(within(scheda(SERRA.nome)).getByText('12 piante · 3 trattamenti · concluso')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3)
  })

  it('con una sola pianta o un solo trattamento usa il singolare', async () => {
    vi.mocked(listaEsperimenti).mockResolvedValue([{ ...VUOTO, n_piante: 1, n_trattamenti: 1 }])
    vaiAllaPagina()
    expect(await screen.findByText('1 pianta · 1 trattamento · in corso')).toBeInTheDocument()
  })
})

describe('Esperimenti: ultimo rilievo', () => {
  it('di oggi: "oggi" con le piante misurate sul totale', async () => {
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: HYDROCHAR.nome })
    expect(within(scheda(HYDROCHAR.nome)).getByText('Ultimo rilievo: oggi, 34/56 piante')).toBeInTheDocument()
  })

  it('di ieri: "ieri"', async () => {
    vi.mocked(listaEsperimenti).mockResolvedValue([{ ...HYDROCHAR, ultima_data: '2026-10-29', piante_ultima_data: 20 }])
    vaiAllaPagina()
    expect(await screen.findByText('Ultimo rilievo: ieri, 20/56 piante')).toBeInTheDocument()
  })

  it('di un altro giorno: la data GG/MM/AAAA', async () => {
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: SERRA.nome })
    expect(within(scheda(SERRA.nome)).getByText('Ultimo rilievo: 28/10/2026, 12/12 piante')).toBeInTheDocument()
  })

  it('"ieri" vale anche a cavallo del mese (si ragiona sulla data locale)', async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 0, 30, 0))
    vi.mocked(listaEsperimenti).mockResolvedValue([{ ...HYDROCHAR, ultima_data: '2026-10-31', piante_ultima_data: 5 }])
    vaiAllaPagina()
    expect(await screen.findByText('Ultimo rilievo: ieri, 5/56 piante')).toBeInTheDocument()
  })

  it('senza misure la riga non c\'è', async () => {
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: VUOTO.nome })
    expect(within(scheda(VUOTO.nome)).queryByText(/Ultimo rilievo/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Ultimo rilievo/)).toHaveLength(2)
  })
})

describe('Esperimenti: navigazione', () => {
  it('toccare la scheda apre l\'esperimento', async () => {
    const utente: Utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: SERRA.nome })

    await utente.click(within(scheda(SERRA.nome)).getByRole('link', { name: /Prova serra/ }))
    expect(posizione()).toBe('/esperimenti/e2')
  })

  it('"+ Nuovo esperimento" porta alla procedura guidata', async () => {
    const utente: Utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: SERRA.nome })

    await utente.click(screen.getByRole('link', { name: '+ Nuovo esperimento' }))
    expect(posizione()).toBe('/esperimenti/nuovo')
  })
})

describe('Esperimenti: menu ⋯ della scheda', () => {
  async function conSchede() {
    const utente: Utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await screen.findByRole('heading', { level: 2, name: HYDROCHAR.nome })
    return utente
  }
  const pulsante = (nome: string) => screen.getByRole('button', { name: `Altre azioni per ${nome}` })

  it('ha un pulsante che nomina l\'esperimento, chiuso all\'inizio', async () => {
    await conSchede()
    expect(pulsante(HYDROCHAR.nome)).toHaveAttribute('aria-expanded', 'false')
    expect(pulsante(SERRA.nome)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Duplica' })).not.toBeInTheDocument()
  })

  it('aprirlo mostra "Duplica" ma non apre l\'esperimento', async () => {
    const utente = await conSchede()

    await utente.click(pulsante(SERRA.nome))
    expect(pulsante(SERRA.nome)).toHaveAttribute('aria-expanded', 'true')
    expect(within(scheda(SERRA.nome)).getByRole('link', { name: 'Duplica' })).toBeInTheDocument()
    // Si è ancora sull'elenco: nessuna navigazione.
    expect(screen.queryByTestId('posizione')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Esperimenti' })).toBeInTheDocument()
  })

  it('"Duplica" porta alla procedura con ?da=<id>', async () => {
    const utente = await conSchede()

    await utente.click(pulsante(SERRA.nome))
    await utente.click(within(scheda(SERRA.nome)).getByRole('link', { name: 'Duplica' }))
    expect(posizione()).toBe('/esperimenti/nuovo?da=e2')
  })

  it('si chiude con Escape riportando il focus sul pulsante', async () => {
    const utente = await conSchede()

    await utente.click(pulsante(HYDROCHAR.nome))
    expect(screen.getByRole('link', { name: 'Duplica' })).toBeInTheDocument()

    await utente.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'Duplica' })).not.toBeInTheDocument()
    expect(pulsante(HYDROCHAR.nome)).toHaveFocus()
    expect(pulsante(HYDROCHAR.nome)).toHaveAttribute('aria-expanded', 'false')
  })

  it('si chiude toccando fuori', async () => {
    const utente = await conSchede()

    await utente.click(pulsante(HYDROCHAR.nome))
    await utente.click(screen.getByRole('heading', { level: 1, name: 'Esperimenti' }))
    expect(screen.queryByRole('link', { name: 'Duplica' })).not.toBeInTheDocument()
  })

  it('aprendo il menu di un\'altra scheda, quello della prima si chiude', async () => {
    const utente = await conSchede()

    await utente.click(pulsante(HYDROCHAR.nome))
    await utente.click(pulsante(SERRA.nome))
    expect(screen.getAllByRole('link', { name: 'Duplica' })).toHaveLength(1)
    expect(within(scheda(SERRA.nome)).getByRole('link', { name: 'Duplica' })).toBeInTheDocument()
  })
})

describe('Esperimenti: nessun esperimento', () => {
  beforeEach(() => {
    vi.mocked(listaEsperimenti).mockResolvedValue([])
  })

  it('spiega che non ce ne sono e offre di crearne uno', async () => {
    const utente: Utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    expect(await screen.findByText('Non hai ancora esperimenti.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Nuovo esperimento' })).not.toBeInTheDocument()

    await utente.click(screen.getByRole('link', { name: 'Crea esperimento' }))
    expect(posizione()).toBe('/esperimenti/nuovo')
  })

  it('"Usa il modello Hydrochar" parte dal modello', async () => {
    const utente: Utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await utente.click(await screen.findByRole('link', { name: 'Usa il modello Hydrochar' }))
    expect(posizione()).toBe('/esperimenti/nuovo?modello=hydrochar')
  })
})

describe('Esperimenti: errore', () => {
  it('mostra il messaggio e "Riprova" rilegge l\'elenco', async () => {
    const utente: Utente = userEvent.setup({ delay: null })
    vi.mocked(listaEsperimenti).mockRejectedValueOnce(new Error('boom'))
    vaiAllaPagina()

    expect(await screen.findByRole('alert')).toHaveTextContent('Errore imprevisto: boom')
    expect(screen.queryByText('Non hai ancora esperimenti.')).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('heading', { level: 2, name: HYDROCHAR.nome })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(listaEsperimenti).toHaveBeenCalledTimes(2)
  })
})
