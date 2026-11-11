import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/api/esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn() }))
vi.mock('@/api/pesatura', () => ({
  listaAnalisi: vi.fn(), salvaAnalisi: vi.fn(), listaPesatura: vi.fn(), creaSessione: vi.fn(),
}))

import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { creaSessione, listaAnalisi, listaPesatura } from '@/api/pesatura'
import { IMPOSTAZIONI_PREDEFINITE, type AnalisiPesatura } from '@/domain/pesatura/tipi'
import { oggiLocale } from '@/lib/date'
import { NuovaSessione } from './NuovaSessione'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const analisi = (id: string, extra: Partial<AnalisiPesatura> = {}): AnalisiPesatura => ({
  id, titolo: 'RWC foglie', tipo: 'rwc', unita: 'mg', impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, repliche: 3 }, archiviata: false, creato_da: 'io', ...extra,
})

// 2 trattamenti x 8 piante = 16 piante. Le piante arrivano volutamente fuori ordine: conta `ordine`.
const trattamenti = [
  { id: 'tA', etichetta: 'Controllo', ordine: 1, livello_ids: [] },
  { id: 'tB', etichetta: 'Sale', ordine: 2, livello_ids: [] },
]
const piante = Array.from({ length: 16 }, (_, i) => ({
  id: `p${i + 1}`, trattamento_id: i < 8 ? 'tA' : 'tB', etichetta: String(i + 1), blocco: null, ordine: i + 1,
})).reverse()

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function apri(ricerca = '?analisi=a1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/esperimenti/E/laboratorio/pesatura/nuova${ricerca}`]}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/pesatura/nuova" element={<NuovaSessione />} />
          <Route path="/esperimenti/:espId/laboratorio/pesatura" element={<p>Elenco Pesatura</p>} />
          <Route path="/esperimenti/:espId/laboratorio/pesatura/:sessioneId/pesa/:fase" element={<p>Pagina pesata</p>} />
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
  vi.mocked(listaAnalisi).mockResolvedValue([
    analisi('a1'),
    analisi('v1', { tipo: 'vasi', unita: 'g', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'umidita', unita: '%' } } }),
  ])
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [], campioni: [], pesi: [] })
  vi.mocked(caricaConfig).mockResolvedValue({ trattamenti, piante } as never)
  vi.mocked(creaSessione).mockResolvedValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

const inizia = () => screen.findByRole('button', { name: 'Inizia la pesata' })

describe('NuovaSessione', () => {
  it('senza analisi nell\'indirizzo dice che non c\'è e rimanda a Pesatura', async () => {
    apri('')
    expect(await screen.findByText('Analisi non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla Pesatura' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura')
  })

  it('con un\'analisi che non esiste dice lo stesso', async () => {
    apri('?analisi=zzz')
    expect(await screen.findByText('Analisi non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla Pesatura' })).toBeInTheDocument()
  })

  it('un lettore non può iniziare: spiegazione al posto del modulo', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    apri()
    expect(await screen.findByText(/hai solo la lettura/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inizia la pesata' })).not.toBeInTheDocument()
  })

  it('la data parte da oggi ed è modificabile; la nota è facoltativa', async () => {
    const utente = apri()
    await inizia()
    const data = screen.getByLabelText('Data')
    expect(data).toHaveValue(oggiLocale())
    await utente.clear(data)
    await utente.type(data, '2026-10-05')
    expect(data).toHaveValue('2026-10-05')
    expect(screen.getByLabelText(/^Nota/)).toHaveValue('')
  })

  it('di default sono tutte le piante, con il contatore', async () => {
    apri()
    await inizia()
    expect(screen.getByRole('radio', { name: 'Tutte le piante' })).toBeChecked()
    expect(screen.getByText('16 piante')).toBeInTheDocument()
  })

  it('per trattamento: le spunte scelgono le piante', async () => {
    const utente = apri()
    await inizia()
    await utente.click(screen.getByRole('radio', { name: 'Per trattamento' }))
    expect(screen.getByText('0 piante')).toBeInTheDocument()
    await utente.click(screen.getByRole('checkbox', { name: 'Sale' }))
    expect(screen.getByText('8 piante')).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    const campioni = vi.mocked(creaSessione).mock.calls[0][1]
    expect(campioni.map(c => c.pianta_id)).toEqual(['p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16'])
  })

  it('scegli a mano: spunte sulle piante; "1 pianta" al singolare', async () => {
    const utente = apri()
    await inizia()
    await utente.click(screen.getByRole('radio', { name: 'Scegli a mano' }))
    await utente.click(screen.getByRole('checkbox', { name: 'P3' }))
    expect(screen.getByText('1 pianta')).toBeInTheDocument()
  })

  it('non si salva senza piante né righe', async () => {
    const utente = apri()
    await inizia()
    await utente.click(screen.getByRole('radio', { name: 'Scegli a mano' }))
    await utente.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(creaSessione).not.toHaveBeenCalled()
    expect(await screen.findByText('Scegli almeno una pianta o aggiungi una riga.')).toBeInTheDocument()
  })

  it('Inizia la pesata copia l\'analisi, ordina le piante e poi le righe libere, e porta alla prima fase', async () => {
    const utente = apri()
    await inizia()
    await utente.type(screen.getByLabelText(/^Nota/), 'Mattina')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi riga libera' }))
    await utente.click(screen.getByRole('button', { name: 'Aggiungi riga libera' }))
    await utente.type(screen.getByLabelText('Nome riga 1'), 'Bianco')
    // la seconda riga resta vuota: non si salva
    await utente.click(screen.getByRole('button', { name: 'Inizia la pesata' }))

    await waitFor(() => expect(creaSessione).toHaveBeenCalledTimes(1))
    const [s, campioni] = vi.mocked(creaSessione).mock.calls[0]
    expect(s).toEqual({
      id: expect.stringMatching(UUID), esperimento_id: 'E', analisi_id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'mg',
      impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, repliche: 3 }, data: oggiLocale(), nota: 'Mattina', conclusa: false,
    })
    expect(campioni).toHaveLength(17)
    expect(campioni.slice(0, 16).map(c => c.pianta_id)).toEqual(Array.from({ length: 16 }, (_, i) => `p${i + 1}`))
    expect(campioni.slice(0, 16).every(c => c.nome === null && c.substrato === null)).toBe(true)
    expect(campioni[16]).toMatchObject({ pianta_id: null, nome: 'Bianco', ordine: 17 })
    expect(campioni.map(c => c.ordine)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1))
    expect(campioni.every(c => c.sessione_id === s.id && UUID.test(c.id))).toBe(true)
    expect(await screen.findByText('Pagina pesata')).toBeInTheDocument()
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/laboratorio/pesatura/${s.id}/pesa/fresco`)
  })

  it('una nota vuota si salva come null', async () => {
    const utente = apri()
    await utente.click(await inizia())
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    expect(vi.mocked(creaSessione).mock.calls[0][0].nota).toBeNull()
  })

  it('un errore lascia il modulo compilato e un nuovo tentativo riscrive le stesse righe', async () => {
    vi.mocked(creaSessione).mockRejectedValueOnce(new Error('rete caduta'))
    const utente = apri()
    await inizia()
    await utente.type(screen.getByLabelText(/^Nota/), 'Mattina')
    await utente.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nota/)).toHaveValue('Mattina')
    expect(screen.queryByText('Pagina pesata')).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalledTimes(2))
    const [prima, seconda] = vi.mocked(creaSessione).mock.calls
    expect(seconda[0].id).toBe(prima[0].id)
    expect(seconda[1].map(c => c.id)).toEqual(prima[1].map(c => c.id))
  })

  it('un doppio tocco scrive una volta sola', async () => {
    let finisci: () => void = () => {}
    vi.mocked(creaSessione).mockReturnValue(new Promise<void>(r => { finisci = r }))
    const utente = apri()
    const pulsante = await inizia()
    await utente.dblClick(pulsante)
    expect(creaSessione).toHaveBeenCalledTimes(1)
    finisci()
    expect(await screen.findByText('Pagina pesata')).toBeInTheDocument()
  })

  it('senza rete lo dice e non si salva', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const utente = apri()
    expect(await screen.findByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
    const pulsante = await inizia()
    expect(pulsante).toBeDisabled()
    await utente.click(pulsante)
    expect(creaSessione).not.toHaveBeenCalled()
  })
})

describe('NuovaSessione: vasi', () => {
  const apriVasi = () => apri('?analisi=v1')

  it('niente piante: un elenco di vasi con Nome e Substrato', async () => {
    apriVasi()
    await inizia()
    expect(screen.queryByRole('radio', { name: 'Tutte le piante' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome vaso 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Substrato vaso 1')).toBeInTheDocument()
  })

  it('Aggiungi vaso propone il substrato dell\'ultimo', async () => {
    const utente = apriVasi()
    await inizia()
    await utente.type(screen.getByLabelText('Substrato vaso 1'), 'Torba')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi vaso' }))
    expect(screen.getByLabelText('Substrato vaso 2')).toHaveValue('Torba')
  })

  it('serve almeno un vaso con il nome', async () => {
    const utente = apriVasi()
    await utente.click(await inizia())
    expect(creaSessione).not.toHaveBeenCalled()
    expect(await screen.findByText('Aggiungi almeno un vaso.')).toBeInTheDocument()
  })

  it('salva i vasi come righe con substrato, in ordine', async () => {
    const utente = apriVasi()
    await inizia()
    await utente.type(screen.getByLabelText('Nome vaso 1'), 'V1')
    await utente.type(screen.getByLabelText('Substrato vaso 1'), 'Torba')
    await utente.click(screen.getByRole('button', { name: 'Aggiungi vaso' }))
    await utente.type(screen.getByLabelText('Nome vaso 2'), 'V2')
    await utente.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    const [s, campioni] = vi.mocked(creaSessione).mock.calls[0]
    expect(s).toMatchObject({ tipo: 'vasi', unita: 'g', analisi_id: 'v1' })
    expect(s.impostazioni.sensore).toEqual({ tipo: 'umidita', unita: '%' })
    expect(campioni).toMatchObject([
      { pianta_id: null, nome: 'V1', substrato: 'Torba', ordine: 1 },
      { pianta_id: null, nome: 'V2', substrato: 'Torba', ordine: 2 },
    ])
    expect(await screen.findByText('Pagina pesata')).toBeInTheDocument()
    expect(screen.getByTestId('posizione')).toHaveTextContent('/secco')
  })
})
