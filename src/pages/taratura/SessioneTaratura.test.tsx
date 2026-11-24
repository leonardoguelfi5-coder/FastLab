import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({ accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn() }))
vi.mock('@/api/inviti', () => ({ sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn() }))
vi.mock('@/api/persone', () => ({ ruoloIn: vi.fn(), membriDi: vi.fn() }))
vi.mock('@/api/esperimenti', () => ({ listaEsperimenti: vi.fn(), caricaConfig: vi.fn() }))
vi.mock('@/api/pesatura', () => ({
  listaPesatura: vi.fn(), aggiornaSessione: vi.fn(), eliminaSessione: vi.fn(), salvaPeso: vi.fn(), eliminaPeso: vi.fn(),
}))
vi.mock('@/components/pesatura/scaricaPesatura', () => ({ scaricaPesatura: vi.fn(), scaricaGraficoPng: vi.fn() }))

import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { aggiornaSessione, eliminaPeso, eliminaSessione, listaPesatura, salvaPeso } from '@/api/pesatura'
import { scaricaGraficoPng, scaricaPesatura } from '@/components/pesatura/scaricaPesatura'
import { type CampionePesatura, type Peso, type SessionePesatura } from '@/domain/pesatura/tipi'
import { SESSIONE_CON_PESI_ALTRUI } from '@/lib/errori'
import { SessioneTaratura } from './SessioneTaratura'

const sessione = (extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', titolo: 'Taratura torba', tipo: 'vasi', unita: 'g',
  impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tdr', unita: 'raw' } },
  data: '2026-11-11', nota: 'Vasi da 2 L', conclusa: true, creato_da: 'io', ...extra,
})
const vaso = (id: string, ordine: number, nome: string): CampionePesatura => ({
  id, sessione_id: 'S', pianta_id: null, nome, substrato: 'Torba', ordine,
})
const peso = (id: string, campione_id: string, tipo: Peso['tipo'], valore: number, lettura: number | null, ora = '08'): Peso => ({
  id, campione_id, replica: 1, tipo, valore, lettura, misurato_il: `2026-11-11T${ora}:00:00Z`, creato_da: 'io',
})
/** Gli stessi pesi del test del Calcolatore: a 60 % CC la curva dà 35,50. */
const pesiDi = (c: string): Peso[] => [
  peso(`${c}-s`, c, 'secco', 750, null), peso(`${c}-cc`, c, 'capacita_campo', 4850, 54),
  peso(`${c}-a1`, c, 'asciugatura', 4030, 44.8, '09'), peso(`${c}-a2`, c, 'asciugatura', 3210, 35.2, '10'),
  peso(`${c}-a3`, c, 'asciugatura', 2390, 26.0, '11'), peso(`${c}-a4`, c, 'asciugatura', 1570, 17.5, '12'),
]
const vasi = [vaso('v1', 1, 'V1'), vaso('v2', 2, 'V2')]
const pesi = [...pesiDi('v1'), ...pesiDi('v2')]

function dati(sessioni: SessionePesatura[], c: CampionePesatura[], p: Peso[]) {
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni, campioni: c, pesi: p })
}

function apri(prepara?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  prepara?.(client)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/laboratorio/taratura/S']}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/taratura/:sessioneId" element={<SessioneTaratura />} />
          <Route path="/esperimenti/:espId/laboratorio/taratura" element={<p>Elenco Taratura</p>} />
          <Route path="/esperimenti/:espId/laboratorio/pesatura/:sessioneId" element={<p>Pagina Pesatura</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ delay: null })
}

const pronta = () => screen.findByRole('heading', { level: 2, name: 'Pesate' })
const risultato = () => within(screen.getByRole('region', { name: 'Risultato del calcolatore' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'io', email: 'a@example.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(ruoloIn).mockResolvedValue('proprietario')
  vi.mocked(caricaConfig).mockResolvedValue({ trattamenti: [], piante: [] } as never)
  vi.mocked(aggiornaSessione).mockResolvedValue(undefined)
  vi.mocked(eliminaSessione).mockResolvedValue(undefined)
  vi.mocked(salvaPeso).mockResolvedValue(undefined)
  vi.mocked(eliminaPeso).mockResolvedValue(undefined)
  vi.mocked(scaricaPesatura).mockResolvedValue({ nomeFile: 'x.xlsx', grafici: 0, graficiNelFile: 0 })
  vi.mocked(scaricaGraficoPng).mockResolvedValue('x.png')
  dati([sessione()], vasi, pesi)
})

afterEach(() => vi.restoreAllMocks())

describe('SessioneTaratura', () => {
  it('l\'intestazione ha titolo, data · sensore · unità e la nota', async () => {
    apri()
    await pronta()
    expect(screen.getByRole('heading', { level: 1, name: 'Taratura torba' })).toBeInTheDocument()
    expect(screen.getByText('11/11/2026 · TDR (raw) · g')).toBeInTheDocument()
    expect(screen.getByText('Vasi da 2 L')).toBeInTheDocument()
  })

  it('il titolo della pagina e la freccia indietro portano alla Taratura', async () => {
    apri()
    await pronta()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura')
  })

  it('con due vasi TDR: grafico, equazione, Pesate e Calcolatore; niente pesi target né parametri', async () => {
    apri()
    await pronta()
    expect(screen.getByRole('img', { name: /Curve di ritenzione/ })).toBeInTheDocument()
    expect(screen.getByText(/%CC = .* · TDR/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Pesate' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'V1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Calcolatore' })).toBeInTheDocument()
    expect(screen.queryByText('Pesi a % CC fisse')).not.toBeInTheDocument()
    expect(screen.queryByText(/TDR target/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Deficit/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /^Parametri delle curve/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Segna come conclusa' })).not.toBeInTheDocument()
  })

  it('senza abbastanza letture lo dice al posto dell\'equazione', async () => {
    dati([sessione()], vasi, [peso('s', 'v1', 'secco', 750, null), peso('cc', 'v1', 'capacita_campo', 4850, 54)])
    apri()
    await pronta()
    expect(screen.getByText('servono almeno 3 letture diverse in un vaso per la curva')).toBeInTheDocument()
  })

  it('Scarica grafico (PNG) scarica il PNG del substrato', async () => {
    const u = apri()
    await pronta()
    await u.click(screen.getByRole('button', { name: 'Scarica grafico (PNG), Torba' }))
    await waitFor(() => expect(scaricaGraficoPng).toHaveBeenCalledTimes(1))
    expect(vi.mocked(scaricaGraficoPng).mock.calls[0][0]).toMatchObject({ titolo: 'Taratura torba', gruppo: { substrato: 'Torba' }, sensore: { tipo: 'tdr' } })
  })

  it('modificare una lettura chiama salvaPeso e rilegge i dati', async () => {
    const u = apri()
    await pronta()
    expect(listaPesatura).toHaveBeenCalledTimes(1)
    await u.click(screen.getByRole('button', { name: 'Modifica Capacità di campo, V1' }))
    const modulo = within(screen.getByRole('form', { name: 'Modifica Capacità di campo, V1' }))
    const campo = modulo.getByLabelText(/^TDR/)
    await u.clear(campo)
    await u.type(campo, '55')
    await u.click(modulo.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaPeso).toHaveBeenCalledWith('E', 'S', expect.objectContaining({ id: 'v1-cc', valore: 4850, lettura: 55 })))
    await waitFor(() => expect(listaPesatura).toHaveBeenCalledTimes(2))
  })

  it('eliminare un punto chiede conferma, poi chiama eliminaPeso e rilegge i dati', async () => {
    const u = apri()
    await pronta()
    const v1 = within(screen.getByRole('article', { name: 'V1' }))
    await u.click(v1.getAllByRole('button', { name: /^Elimina .*, V1$/ })[2])
    expect(eliminaPeso).not.toHaveBeenCalled()
    const finestra = await screen.findByRole('dialog', { name: 'Eliminare questa pesata?' })
    await u.click(within(finestra).getByRole('button', { name: 'Elimina' }))
    await waitFor(() => expect(eliminaPeso).toHaveBeenCalledWith('v1-a1'))
    await waitFor(() => expect(listaPesatura).toHaveBeenCalledTimes(2))
  })

  it('una CC senza lettura (sessione vecchia) non rompe la pagina', async () => {
    dati([sessione()], vasi, pesi.map(p => (p.id === 'v1-cc' ? { ...p, lettura: null } : p)))
    apri()
    await pronta()
    expect(within(screen.getByRole('article', { name: 'V1' })).getByText('manca la lettura')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Curve di ritenzione/ })).toBeInTheDocument()
    expect(screen.getByText(/%CC = .* · TDR/)).toBeInTheDocument()
  })

  it('un vaso senza secco non sposta la curva media del calcolatore', async () => {
    const senzaSecco = pesiDi('v3').filter(p => p.tipo !== 'secco')
    dati([sessione()], [...vasi, vaso('v3', 3, 'V3')], [...pesi, ...senzaSecco])
    const u = apri()
    await pronta()
    await u.type(screen.getByLabelText(/^% di capacità di campo/), '60')
    expect(risultato().getByText('Curva media').closest('div')).toHaveTextContent('35,50')
    expect(risultato().getByText('V1').closest('li')).toHaveTextContent('35,50')
    expect(risultato().getByText('V3').closest('li')).toHaveTextContent('—')
  })

  it('Pesa tutti i vasi: Secco, Capacità di campo e Asciugatura nel giro della Taratura', async () => {
    apri()
    await pronta()
    const gruppo = within(screen.getByRole('group', { name: 'Pesa tutti i vasi' }))
    expect(gruppo.getByRole('link', { name: 'Secco' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura/S/pesa/secco')
    expect(gruppo.getByRole('link', { name: 'Capacità di campo' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura/S/pesa/capacita_campo')
    expect(gruppo.getByRole('link', { name: 'Asciugatura' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura/S/pesa/asciugatura')
  })

  it('Ripeti questa taratura apre una nuova taratura compilata come questa', async () => {
    apri()
    await pronta()
    expect(screen.getByRole('link', { name: 'Ripeti questa taratura' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura/nuova?da=S')
  })

  it('Scarica Excel chiama scaricaPesatura con questa sessione', async () => {
    const u = apri()
    await pronta()
    await u.click(screen.getByRole('button', { name: 'Scarica Excel' }))
    await waitFor(() => expect(scaricaPesatura).toHaveBeenCalledTimes(1))
    expect(vi.mocked(scaricaPesatura).mock.calls[0][0].sessioni.map(s => s.id)).toEqual(['S'])
  })

  it('Scarica Excel senza poter leggere la configurazione usa quella già in memoria', async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error('rete'))
    const config = { trattamenti: [], piante: [] }
    const u = apri(c => c.setQueryData(['config', 'E'], config))
    await pronta()
    await u.click(screen.getByRole('button', { name: 'Scarica Excel' }))
    await waitFor(() => expect(scaricaPesatura).toHaveBeenCalledTimes(1))
    expect(vi.mocked(scaricaPesatura).mock.calls[0][0].config).toBe(config)
  })

  it("Scarica Excel senza alcuna configurazione mostra l'errore e non scarica", async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error('rete'))
    const u = apri()
    await pronta()
    await u.click(screen.getByRole('button', { name: 'Scarica Excel' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(scaricaPesatura).not.toHaveBeenCalled()
  })

  it('un peso che non si salva fa rileggere i dati della pagina', async () => {
    vi.mocked(salvaPeso).mockRejectedValue(new Error('rete'))
    const u = apri()
    await pronta()
    const prima = vi.mocked(listaPesatura).mock.calls.length
    await u.click(screen.getByRole('button', { name: 'Modifica Secco, V1' }))
    await u.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(vi.mocked(listaPesatura).mock.calls.length).toBeGreaterThan(prima))
  })

  it('la nota si modifica e conserva conclusa', async () => {
    const u = apri()
    await pronta()
    await u.click(screen.getByRole('button', { name: 'Modifica' }))
    const campo = screen.getByRole('textbox', { name: 'Nota' })
    await u.clear(campo)
    await u.type(campo, 'Vasi da 3 L')
    await u.click(screen.getByRole('button', { name: 'Salva la nota' }))
    await waitFor(() => expect(aggiornaSessione).toHaveBeenCalledWith({ id: 'S', data: '2026-11-11', nota: 'Vasi da 3 L', conclusa: true }))
  })

  it('Elimina taratura chiede conferma, poi elimina e torna all\'elenco', async () => {
    const u = apri()
    await pronta()
    await u.click(screen.getByRole('button', { name: 'Elimina taratura' }))
    await u.click(await screen.findByRole('button', { name: 'Tieni la taratura' }))
    expect(eliminaSessione).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Elimina taratura' }))
    const finestra = await screen.findByRole('dialog', { name: 'Eliminare la taratura?' })
    await u.click(within(finestra).getByRole('button', { name: 'Elimina' }))
    await waitFor(() => expect(eliminaSessione).toHaveBeenCalledWith('S'))
    expect(await screen.findByText('Elenco Taratura')).toBeInTheDocument()
  })

  it('un rilevatore non elimina la sua taratura se contiene pesi di altre persone', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    dati([sessione()], vasi, pesi.map(p => (p.id === 'v2-s' ? { ...p, creato_da: 'altro' } : p)))
    apri()
    await pronta()
    expect(await screen.findByText(SESSIONE_CON_PESI_ALTRUI)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina taratura' })).not.toBeInTheDocument()
  })

  it('un rilevatore non elimina la taratura di un altro', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    dati([sessione({ creato_da: 'altro' })], vasi, pesi)
    apri()
    await pronta()
    await waitFor(() => expect(ruoloIn).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Elimina taratura' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Scarica Excel' })).toBeInTheDocument()
  })

  it('una sessione che non è dei vasi va alla pagina della Pesatura', async () => {
    dati([sessione({ tipo: 'rwc' })], [], [])
    apri()
    expect(await screen.findByText('Pagina Pesatura')).toBeInTheDocument()
  })

  it('sessione non trovata', async () => {
    dati([], [], [])
    apri()
    expect(await screen.findByText('Sessione non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla Taratura' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/taratura')
  })

  it('senza rete lo dice e disattiva i salvataggi', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    await pronta()
    expect(screen.getByText('Sei senza rete: la Taratura funziona solo online.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elimina taratura' })).toBeDisabled()
  })
})
