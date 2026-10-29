import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache: si finge solo il livello API (e il client Supabase, mai raggiunto).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/inviti', () => ({
  sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { creaInvito, listaInviti, revocaInvito, sonoAdmin, type Invito } from '@/api/inviti'
import { EMAIL_GIA_INVITATA, INVITO_GIA_USATO } from '@/lib/errori'
import { AdminInviti } from './AdminInviti'

type Utente = ReturnType<typeof userEvent.setup>

const SESSIONE = { user: { email: 'admin@example.it' } } as Session

const IN_ATTESA: Invito = {
  id: 'i1', email: 'marco@example.it', codice: 'K7M2QX4P', creato_il: '2026-10-27T09:00:00Z', usato_il: null,
}
const USATO: Invito = {
  id: 'i2', email: 'giulia@example.it', codice: 'ZZ99ZZ99', creato_il: '2026-10-20T09:00:00Z', usato_il: '2026-10-28T12:00:00Z',
}
const NUOVO: Invito = {
  id: 'i3', email: 'elena@example.it', codice: 'N3W5C0DE', creato_il: '2026-10-28T10:00:00Z', usato_il: null,
}

const MESSAGGIO_MARCO =
  `Ciao! Ti ho invitato su FastLab. Registrati qui: ${window.location.origin}/registrati usando l'email marco@example.it e il codice invito K7M2QX4P.`

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/inviti']}>
        <Routes>
          <Route path="/admin/inviti" element={<AdminInviti />} />
          <Route path="/" element={<p>Elenco esperimenti</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Sostituisce gli appunti del browser (userEvent ne installa uno suo a ogni `setup`, quindi si chiama dopo). */
function simulaAppunti(appunti: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: appunti, configurable: true })
}

const riga = (email: string) => screen.getByText(email).closest('li') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(true)
  vi.mocked(listaInviti).mockResolvedValue([IN_ATTESA, USATO])
})

describe('AdminInviti: accesso', () => {
  it('ha il titolo "Inviti" e la freccia indietro verso l\'elenco', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    expect(screen.getByRole('heading', { level: 1, name: 'Inviti' })).toBeInTheDocument()
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    expect(await screen.findByText('Elenco esperimenti')).toBeInTheDocument()
  })

  it('a chi non è amministratore mostra solo il messaggio di accesso negato', async () => {
    vi.mocked(sonoAdmin).mockResolvedValue(false)
    vaiAllaPagina()

    expect(await screen.findByText('Questa pagina è riservata all\'amministratore.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invita' })).not.toBeInTheDocument()
    expect(listaInviti).not.toHaveBeenCalled()
  })

  it('mentre non sa ancora se si è amministratori non dice "riservata"', () => {
    vi.mocked(sonoAdmin).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByText('Caricamento…')).toBeInTheDocument()
    expect(screen.queryByText('Questa pagina è riservata all\'amministratore.')).not.toBeInTheDocument()
  })

  it('se non riesce a verificare il ruolo lo dice (non è un "accesso negato") e permette di riprovare', async () => {
    vi.mocked(sonoAdmin).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()

    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
    expect(screen.queryByText('Questa pagina è riservata all\'amministratore.')).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('button', { name: 'Invita' })).toBeInTheDocument()
  })
})

describe('AdminInviti: elenco', () => {
  it('mostra email e stato di ogni invito, e il codice solo di quelli in attesa', async () => {
    vaiAllaPagina()

    const attesa = within(await screen.findByText('marco@example.it').then(e => e.closest('li') as HTMLElement))
    expect(attesa.getByText('In attesa')).toBeInTheDocument()
    expect(attesa.getByText('K7M2QX4P')).toBeInTheDocument()

    const usato = within(riga('giulia@example.it'))
    expect(usato.getByText('Registrato il 28/10/2026')).toBeInTheDocument()
    expect(screen.queryByText('ZZ99ZZ99')).not.toBeInTheDocument()
  })

  it('per un invito già usato non ci sono né "Revoca" né "Copia messaggio"', async () => {
    vaiAllaPagina()
    await screen.findByText('giulia@example.it')

    const usato = within(riga('giulia@example.it'))
    expect(usato.queryByRole('button', { name: 'Revoca' })).not.toBeInTheDocument()
    expect(usato.queryByRole('button', { name: 'Copia messaggio' })).not.toBeInTheDocument()

    const attesa = within(riga('marco@example.it'))
    expect(attesa.getByRole('button', { name: 'Revoca' })).toBeInTheDocument()
    expect(attesa.getByRole('button', { name: 'Copia messaggio' })).toBeInTheDocument()
  })

  it('senza inviti lo dice', async () => {
    vi.mocked(listaInviti).mockResolvedValue([])
    vaiAllaPagina()
    expect(await screen.findByText('Nessun invito ancora.')).toBeInTheDocument()
  })

  it('se l\'elenco non si carica mostra l\'errore tradotto e permette di riprovare', async () => {
    vi.mocked(listaInviti).mockRejectedValueOnce({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()

    expect(await screen.findByText(/Il server non risponde/)).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('marco@example.it')).toBeInTheDocument()
  })
})

describe('AdminInviti: nuovo invito', () => {
  async function invita(utente: Utente, email: string) {
    await utente.type(await screen.findByLabelText('Email'), email)
    await utente.click(screen.getByRole('button', { name: 'Invita' }))
  }

  it('crea l\'invito con l\'email scritta, svuota il campo, avvisa e mostra subito il nuovo codice', async () => {
    vi.mocked(creaInvito).mockResolvedValue(NUOVO)
    vi.mocked(listaInviti).mockResolvedValueOnce([IN_ATTESA, USATO]).mockResolvedValue([NUOVO, IN_ATTESA, USATO])
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await invita(utente, 'elena@example.it')

    expect(creaInvito).toHaveBeenCalledExactlyOnceWith('elena@example.it')
    expect(await screen.findByText('N3W5C0DE')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Invito creato.')
    expect(screen.getByLabelText('Email')).toHaveValue('')

    // Il nuovo invito è in cima ed è evidenziato; gli altri no.
    const nuovo = riga('elena@example.it')
    expect(within(nuovo).getByText('Nuovo')).toBeInTheDocument()
    expect(within(riga('marco@example.it')).queryByText('Nuovo')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[0]).toBe(nuovo)

    // L'elenco viene riletto dal database.
    await vi.waitFor(() => expect(listaInviti).toHaveBeenCalledTimes(2))
  })

  it('se l\'invito esiste già mostra l\'errore sotto il modulo e lascia l\'email scritta', async () => {
    vi.mocked(creaInvito).mockRejectedValue(new Error(EMAIL_GIA_INVITATA))
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await invita(utente, 'marco@example.it')

    expect(await screen.findByRole('alert')).toHaveTextContent('Questa email è già stata invitata: trovi l\'invito nell\'elenco.')
    expect(screen.getByLabelText('Email')).toHaveValue('marco@example.it')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('con un\'email non valida non chiama il database', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    await invita(utente, 'non-un-indirizzo')
    expect(creaInvito).not.toHaveBeenCalled()
  })
})

describe('AdminInviti: copia messaggio', () => {
  it('copia negli appunti il messaggio con email, codice e indirizzo di registrazione', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const utente = userEvent.setup({ delay: null })
    simulaAppunti({ writeText })
    vaiAllaPagina()
    await screen.findByText('marco@example.it')

    await utente.click(within(riga('marco@example.it')).getByRole('button', { name: 'Copia messaggio' }))

    expect(writeText).toHaveBeenCalledExactlyOnceWith(MESSAGGIO_MARCO)
    expect(toast.success).toHaveBeenCalledWith('Messaggio copiato.')
    expect(screen.queryByRole('textbox', { name: 'Messaggio da copiare' })).not.toBeInTheDocument()
  })

  it('se gli appunti non rispondono mostra il messaggio da copiare a mano, senza dire "copiato"', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const utente = userEvent.setup({ delay: null })
    simulaAppunti({ writeText })
    vaiAllaPagina()
    await screen.findByText('marco@example.it')

    await utente.click(within(riga('marco@example.it')).getByRole('button', { name: 'Copia messaggio' }))

    const casella = await screen.findByRole('textbox', { name: 'Messaggio da copiare' })
    expect(casella).toHaveValue(MESSAGGIO_MARCO)
    expect(casella).toHaveAttribute('readonly')
    expect(toast.success).not.toHaveBeenCalled()

    await utente.click(screen.getByRole('button', { name: 'Fatto' }))
    expect(screen.queryByRole('textbox', { name: 'Messaggio da copiare' })).not.toBeInTheDocument()
  })

  it('se il browser non ha gli appunti (pagina non sicura) vale lo stesso ripiego', async () => {
    const utente = userEvent.setup({ delay: null })
    simulaAppunti(undefined)
    vaiAllaPagina()
    await screen.findByText('marco@example.it')

    await utente.click(within(riga('marco@example.it')).getByRole('button', { name: 'Copia messaggio' }))

    expect(await screen.findByRole('textbox', { name: 'Messaggio da copiare' })).toHaveValue(MESSAGGIO_MARCO)
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('AdminInviti: revoca', () => {
  async function apriConferma(utente: Utente) {
    await screen.findByText('marco@example.it')
    await utente.click(within(riga('marco@example.it')).getByRole('button', { name: 'Revoca' }))
    return await screen.findByRole('dialog')
  }

  it('chiede conferma e, confermata, revoca l\'invito e lo toglie dall\'elenco', async () => {
    vi.mocked(revocaInvito).mockResolvedValue(undefined)
    vi.mocked(listaInviti).mockResolvedValueOnce([IN_ATTESA, USATO]).mockResolvedValue([USATO])
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    const dialogo = await apriConferma(utente)

    expect(within(dialogo).getByText(/marco@example\.it/)).toBeInTheDocument()
    expect(revocaInvito).not.toHaveBeenCalled()

    await utente.click(within(dialogo).getByRole('button', { name: 'Revoca invito' }))

    expect(revocaInvito).toHaveBeenCalledExactlyOnceWith('i1')
    await vi.waitFor(() => expect(screen.queryByText('marco@example.it')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Invito revocato.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('giulia@example.it')).toBeInTheDocument()
  })

  it('"Annulla" chiude la conferma senza revocare', async () => {
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    const dialogo = await apriConferma(utente)

    await utente.click(within(dialogo).getByRole('button', { name: 'Annulla' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(revocaInvito).not.toHaveBeenCalled()
    expect(screen.getByText('marco@example.it')).toBeInTheDocument()
  })

  it('se la revoca fallisce l\'errore resta nella conferma e l\'invito resta in elenco', async () => {
    vi.mocked(revocaInvito).mockRejectedValue({ message: 'Failed to fetch' })
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    const dialogo = await apriConferma(utente)

    await utente.click(within(dialogo).getByRole('button', { name: 'Revoca invito' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('se l\'invito è stato usato nel frattempo lo dice e rilegge l\'elenco', async () => {
    vi.mocked(revocaInvito).mockRejectedValue(new Error(INVITO_GIA_USATO))
    vi.mocked(listaInviti)
      .mockResolvedValueOnce([IN_ATTESA, USATO])
      .mockResolvedValue([{ ...IN_ATTESA, usato_il: '2026-10-28T13:00:00Z' }, USATO])
    const utente = userEvent.setup({ delay: null })
    vaiAllaPagina()
    const dialogo = await apriConferma(utente)

    await utente.click(within(dialogo).getByRole('button', { name: 'Revoca invito' }))

    expect(await within(dialogo).findByRole('alert'))
      .toHaveTextContent('Questo invito è già stato usato o non c\'è più: ricarica la pagina.')
    await vi.waitFor(() => expect(listaInviti).toHaveBeenCalledTimes(2))
    expect(toast.success).not.toHaveBeenCalled()
  })
})
