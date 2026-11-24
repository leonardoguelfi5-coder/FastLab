import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({ accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn() }))
vi.mock('@/api/inviti', () => ({ sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn() }))
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn() }))
vi.mock('@/api/pesatura', () => ({ listaPesatura: vi.fn() }))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { listaPesatura } from '@/api/pesatura'
import { IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type Peso, type SessionePesatura } from '@/domain/pesatura/tipi'
import { Taratura } from './Taratura'

const tdr = { ...IMPOSTAZIONI_PREDEFINITE, sensore: { tipo: 'tdr' as const, unita: 'raw' } }
const sessione = (id: string, extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id, esperimento_id: 'E', titolo: `Taratura ${id}`, tipo: 'vasi', unita: 'g', impostazioni: tdr,
  data: '2026-11-01', nota: null, conclusa: false, ...extra,
})
const campione = (id: string, sessioneId: string, ordine: number): CampionePesatura => ({
  id, sessione_id: sessioneId, pianta_id: null, nome: id, substrato: 'Torba', ordine,
})
const peso = (id: string, campioneId: string, tipo: Peso['tipo']): Peso => ({
  id, campione_id: campioneId, replica: 1, tipo, valore: 100, lettura: tipo === 'secco' ? null : 30, misurato_il: '2026-11-01T10:00:00Z',
})

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/laboratorio/taratura']}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/taratura" element={<Taratura />} />
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

describe('Taratura', () => {
  it('ha il titolo e la freccia indietro verso il Laboratorio', () => {
    apri()
    expect(screen.getByRole('heading', { name: 'Taratura e stress idrico', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/laboratorio')
  })

  it('senza tarature lo dice', async () => {
    apri()
    expect(await screen.findByText('Nessuna taratura per ora.')).toBeInTheDocument()
  })

  it('Nuova taratura porta al modulo', async () => {
    const u = apri()
    await u.click(await screen.findByRole('link', { name: 'Nuova taratura' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/laboratorio/taratura/nuova')
  })

  it('mostra solo le sessioni dei vasi, dalla più recente', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [
        sessione('vecchia', { data: '2026-10-28' }),
        sessione('R', { tipo: 'rwc', titolo: 'RWC foglie', impostazioni: IMPOSTAZIONI_PREDEFINITE, data: '2026-11-10' }),
        sessione('nuova', { data: '2026-11-05' }),
        sessione('pari', { data: '2026-11-05', creato_il: '2026-11-05T12:00:00Z' }),
      ],
      campioni: [], pesi: [],
    })
    apri()
    const elenco = within(await screen.findByRole('list', { name: 'Tarature' }))
    expect(elenco.getAllByRole('link', { name: /Taratura/ }).map(l => l.textContent)).toEqual([
      expect.stringContaining('Taratura pari'), expect.stringContaining('Taratura nuova'), expect.stringContaining('Taratura vecchia'),
    ])
    expect(screen.queryByText('RWC foglie')).not.toBeInTheDocument()
  })

  it('la riga ha data, sensore, titolo, prima riga della nota e i conteggi', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [sessione('S', { nota: 'Torba e cocco\nseconda riga' })],
      campioni: [campione('v1', 'S', 1), campione('v2', 'S', 2)],
      pesi: [
        peso('1', 'v1', 'secco'), peso('2', 'v1', 'capacita_campo'), peso('3', 'v1', 'asciugatura'),
        peso('4', 'v2', 'secco'), peso('5', 'v2', 'capacita_campo'),
      ],
    })
    apri()
    const riga = (await screen.findByText('Taratura S')).closest('a') as HTMLElement
    expect(riga).toHaveTextContent('01/11/2026 · TDR')
    expect(riga).toHaveTextContent('Torba e cocco')
    expect(riga).not.toHaveTextContent('seconda riga')
    expect(riga).toHaveTextContent('2 vasi · 5 pesate')
    expect(riga).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura/S')
  })

  it('con il tensiometro la riga dice Tensione', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [sessione('S', { impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, sensore: { tipo: 'tensione', unita: 'hPa' } } })],
      campioni: [campione('v1', 'S', 1)], pesi: [peso('1', 'v1', 'secco')],
    })
    apri()
    const riga = (await screen.findByText('Taratura S')).closest('a') as HTMLElement
    expect(riga).toHaveTextContent('· Tensione')
    expect(riga).toHaveTextContent('1 vaso · 1 pesata')
  })

  it('Ripeti apre il modulo compilato come quella taratura', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [sessione('S')], campioni: [], pesi: [] })
    apri()
    const ripeti = await screen.findByRole('link', { name: 'Ripeti' })
    expect(ripeti).toHaveAccessibleDescription('Taratura S')
    expect(ripeti).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura/nuova?da=S')
  })

  it('un lettore vede le tarature ma non Nuova taratura né Ripeti', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [sessione('S')], campioni: [], pesi: [] })
    apri()
    expect(await screen.findByText('Taratura S')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Nuova taratura' })).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Ripeti' })).not.toBeInTheDocument()
  })

  it('un errore di lettura si può riprovare', async () => {
    vi.mocked(listaPesatura).mockRejectedValueOnce(new Error('Rete assente'))
    const u = apri()
    await u.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Nessuna taratura per ora.')).toBeInTheDocument()
  })

  it('senza rete lo dice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    expect(await screen.findByText('Sei senza rete: la Taratura funziona solo online.')).toBeInTheDocument()
  })
})
