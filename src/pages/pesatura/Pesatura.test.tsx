import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn() }))
vi.mock('@/api/pesatura', () => ({ listaPesatura: vi.fn() }))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { listaPesatura } from '@/api/pesatura'
import { IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type Peso, type SessionePesatura } from '@/domain/pesatura/tipi'
import { Pesatura } from './Pesatura'

const sessione = (id: string, extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id, esperimento_id: 'E', titolo: `Pesata ${id}`, tipo: 'aliquota', unita: 'g', impostazioni: IMPOSTAZIONI_PREDEFINITE,
  data: '2026-11-01', nota: null, conclusa: false, ...extra,
})
const campione = (id: string, sessioneId: string, ordine: number): CampionePesatura => ({
  id, sessione_id: sessioneId, pianta_id: null, nome: id, substrato: null, ordine,
})
const peso = (id: string, campioneId: string, tipo: Peso['tipo'] = 'aliquota'): Peso => ({
  id, campione_id: campioneId, replica: 1, tipo, valore: 0.1, lettura: null, misurato_il: '2026-11-01T10:00:00Z',
})

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/laboratorio/pesatura']}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/pesatura" element={<Pesatura />} />
          <Route path="*" element={<p>Altra schermata</p>} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ delay: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'io', email: 'giulia@example.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(ruoloIn).mockResolvedValue('proprietario')
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [], campioni: [], pesi: [] })
})

afterEach(() => vi.restoreAllMocks())

describe('Pesatura', () => {
  it('ha il titolo e la freccia indietro verso il Laboratorio', () => {
    apri()
    expect(screen.getByRole('heading', { name: 'Pesatura', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/laboratorio')
  })

  it('Nuova pesata porta al modulo vuoto', async () => {
    const u = apri()
    await u.click(await screen.findByRole('link', { name: 'Nuova pesata' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/laboratorio/pesatura/nuova')
  })

  it('senza pesate lo dice', async () => {
    apri()
    expect(await screen.findByText('Nessuna pesata per ora.')).toBeInTheDocument()
  })

  it('divide le pesate in corso da quelle completate, dalla più recente', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [
        sessione('vecchia', { data: '2026-10-28' }),
        sessione('nuova', { data: '2026-11-05' }),
        sessione('aperta', { data: '2026-11-03' }),
      ],
      campioni: [campione('c1', 'vecchia', 1), campione('c2', 'nuova', 1), campione('c3', 'aperta', 1)],
      pesi: [peso('1', 'c1'), peso('2', 'c2')],
    })
    apri()
    const inCorso = within(await screen.findByRole('list', { name: /In corso/ }))
    const completate = within(screen.getByRole('list', { name: /Completate/ }))
    expect(inCorso.getAllByRole('link', { name: /Pesata/ }).map(l => l.textContent)).toEqual([expect.stringContaining('Pesata aperta')])
    expect(completate.getAllByRole('link', { name: /Pesata/ }).map(l => l.textContent)).toEqual([
      expect.stringContaining('Pesata nuova'), expect.stringContaining('Pesata vecchia'),
    ])
    expect(completate.getAllByText(/Completa · 1 peso/)).toHaveLength(2)
  })

  it('una pesata in corso mostra le sue fasi: fatte, quella da fare e le successive', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [sessione('R', { tipo: 'rwc', titolo: 'RWC foglie' })],
      campioni: [campione('c1', 'R', 1), campione('c2', 'R', 2)],
      pesi: [peso('1', 'c1', 'fresco'), peso('2', 'c2', 'fresco'), peso('3', 'c1', 'turgido')],
    })
    apri()
    const riga = (await screen.findByText('RWC foglie')).closest('a') as HTMLElement
    expect(riga).toHaveTextContent('Fresco')
    expect(riga).toHaveTextContent('Turgido1/2')
    expect(riga).toHaveTextContent('Secco0/2')
    expect(riga).not.toHaveTextContent('Fresco2/2')
  })

  it('sotto il titolo l\'inizio della nota (la prima riga)', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [sessione('S', { nota: 'Dischetti da 1 cm\nstufa a 70 °C' })], campioni: [], pesi: [],
    })
    apri()
    expect(await screen.findByText('Dischetti da 1 cm')).toBeInTheDocument()
    expect(screen.queryByText(/stufa/)).not.toBeInTheDocument()
  })

  it('una taratura dei vasi resta in corso finché non è segnata conclusa', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [sessione('V1', { tipo: 'vasi', titolo: 'Taratura A' }), sessione('V2', { tipo: 'vasi', titolo: 'Taratura B', conclusa: true })],
      campioni: [], pesi: [],
    })
    apri()
    expect(within(await screen.findByRole('list', { name: /In corso/ })).getByText('Taratura A')).toBeInTheDocument()
    const completate = within(screen.getByRole('list', { name: /Completate/ }))
    expect(completate.getByText('Taratura B')).toBeInTheDocument()
    expect(completate.getByText(/Conclusa/)).toBeInTheDocument()
  })

  it('la riga apre la pesata, Ripeti apre il modulo compilato come quella', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [sessione('S')], campioni: [], pesi: [] })
    const u = apri()
    const ripeti = await screen.findByRole('link', { name: 'Ripeti' })
    expect(ripeti).toHaveAccessibleDescription('Pesata S')
    expect(ripeti).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/nuova?da=S')
    await u.click(screen.getByText('Pesata S'))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/laboratorio/pesatura/S')
  })

  it('un lettore vede le pesate ma non Nuova pesata né Ripeti', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [sessione('S')], campioni: [], pesi: [] })
    apri()
    expect(await screen.findByText('Pesata S')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Nuova pesata' })).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Ripeti' })).not.toBeInTheDocument()
  })

  it('un errore di lettura si può riprovare', async () => {
    vi.mocked(listaPesatura).mockRejectedValueOnce(new Error('Rete assente'))
    const u = apri()
    await u.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Nessuna pesata per ora.')).toBeInTheDocument()
  })

  it('senza rete lo dice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    expect(await screen.findByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
  })
})
