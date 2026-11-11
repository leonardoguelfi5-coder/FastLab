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
vi.mock('@/api/pesatura', () => ({
  listaAnalisi: vi.fn(), salvaAnalisi: vi.fn(), listaPesatura: vi.fn(),
}))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { listaAnalisi, listaPesatura } from '@/api/pesatura'
import { IMPOSTAZIONI_PREDEFINITE, type AnalisiPesatura, type CampionePesatura, type Peso, type SessionePesatura } from '@/domain/pesatura/tipi'
import { Pesatura } from './Pesatura'

const analisi = (id: string, extra: Partial<AnalisiPesatura> = {}): AnalisiPesatura => ({
  id, titolo: `Analisi ${id}`, tipo: 'aliquota', unita: 'g', impostazioni: IMPOSTAZIONI_PREDEFINITE, archiviata: false, creato_da: 'io', ...extra,
})
const sessione = (id: string, extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id, esperimento_id: 'E', analisi_id: 'a1', titolo: `Sessione ${id}`, tipo: 'aliquota', unita: 'g', impostazioni: IMPOSTAZIONI_PREDEFINITE,
  data: '2026-11-01', nota: null, conclusa: false, ...extra,
})
const campione = (id: string, sessioneId: string, ordine: number): CampionePesatura => ({
  id, sessione_id: sessioneId, pianta_id: null, nome: id, substrato: null, ordine,
})
const peso = (id: string, campioneId: string): Peso => ({
  id, campione_id: campioneId, replica: 1, tipo: 'aliquota', valore: 0.1, lettura: null, misurato_il: '2026-11-01T10:00:00Z',
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
  vi.mocked(listaAnalisi).mockResolvedValue([])
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [], campioni: [], pesi: [] })
})

afterEach(() => vi.restoreAllMocks())

describe('Pesatura', () => {
  it('ha il titolo e la freccia indietro verso il Laboratorio', () => {
    apri()
    expect(screen.getByRole('heading', { name: 'Pesatura', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/laboratorio')
  })

  it('elenca le analisi non archiviate con il tipo accanto e porta alla nuova sessione', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([
      analisi('a1', { titolo: 'Antociani foglie', tipo: 'aliquota' }),
      analisi('a2', { titolo: 'Vecchia', archiviata: true }),
    ])
    const utente = apri()
    const voce = await screen.findByRole('link', { name: 'Antociani foglie · Aliquota' })
    expect(screen.queryByRole('link', { name: /Vecchia/ })).not.toBeInTheDocument()
    await utente.click(voce)
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/laboratorio/pesatura/nuova?analisi=a1')
  })

  it('mette le analisi archiviate in una sezione comprimibile', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a2', { titolo: 'Vecchia', archiviata: true })])
    const utente = apri()
    const bottone = await screen.findByRole('button', { name: /Archiviate/ })
    expect(bottone).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Vecchia · Aliquota' })).not.toBeInTheDocument()
    await utente.click(bottone)
    expect(await screen.findByRole('link', { name: 'Vecchia · Aliquota' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/analisi?id=a2')
  })

  it('ha "Nuova analisi" che porta all\'editor, e un link Modifica per ogni analisi', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1', { titolo: 'Antociani foglie' })])
    const utente = apri()
    expect(await screen.findByRole('link', { name: 'Modifica' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/analisi?id=a1')
    await utente.click(screen.getByRole('link', { name: 'Nuova analisi' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/laboratorio/pesatura/analisi')
  })

  it('a un lettore non mostra "Nuova analisi" né Modifica', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1', { titolo: 'Antociani foglie' })])
    apri()
    await screen.findByText('Antociani foglie · Aliquota')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Nuova analisi' })).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Modifica' })).not.toBeInTheDocument()
  })

  it('l\'archivio ha le sessioni dalla più recente, con data, titolo e avanzamento', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [
        sessione('s1', { titolo: 'Vecchia sessione', data: '2026-10-01' }),
        sessione('s2', { titolo: 'Sessione a metà', data: '2026-11-05' }),
        sessione('s3', { titolo: 'Sessione finita', data: '2026-11-02' }),
        sessione('s4', { titolo: 'Sessione chiusa', data: '2026-10-20', conclusa: true }),
      ],
      campioni: [
        campione('c1', 's1', 1),
        campione('c2', 's2', 1), campione('c3', 's2', 2), campione('c4', 's2', 3),
        campione('c5', 's3', 1),
        campione('c6', 's4', 1),
      ],
      pesi: [peso('p1', 'c2'), peso('p2', 'c3'), peso('p3', 'c5'), peso('p4', 'c6')],
    })
    apri()
    const elenco = await screen.findByRole('list', { name: 'Archivio' })
    const voci = within(elenco).getAllByRole('link')
    expect(voci).toHaveLength(4)
    expect(voci[0]).toHaveTextContent('05/11/2026')
    expect(voci[0]).toHaveTextContent('Sessione a metà')
    expect(voci[0]).toHaveTextContent('2/3 pesati')
    expect(voci[0]).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/s2')
    expect(voci[1]).toHaveTextContent('Sessione finita')
    expect(voci[1]).toHaveTextContent('Completa')
    expect(voci[2]).toHaveTextContent('Sessione chiusa')
    expect(voci[2]).toHaveTextContent('Conclusa')
    expect(voci[3]).toHaveTextContent('Vecchia sessione')
    expect(voci[3]).toHaveTextContent('0/1 pesati')
  })

  it('i vasi non contano l\'asciugatura nei "pesati"', async () => {
    vi.mocked(listaPesatura).mockResolvedValue({
      sessioni: [sessione('s1', { tipo: 'vasi' })],
      campioni: [campione('c1', 's1', 1), campione('c2', 's1', 2)],
      pesi: [
        { ...peso('p1', 'c1'), tipo: 'secco' },
        { ...peso('p2', 'c1'), tipo: 'capacita_campo' },
        { ...peso('p3', 'c1'), tipo: 'asciugatura', lettura: 30 },
      ],
    })
    apri()
    expect(await screen.findByText('2/4 pesati')).toBeInTheDocument()
  })

  it('senza rete lo dice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    expect(await screen.findByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
  })

  it('se la lettura fallisce mostra l\'errore con Riprova', async () => {
    vi.mocked(listaAnalisi).mockRejectedValue(new Error('boom'))
    const utente = apri()
    await utente.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(listaAnalisi).toHaveBeenCalledTimes(2)
  })
})
