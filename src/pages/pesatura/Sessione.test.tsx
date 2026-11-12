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
vi.mock('@/api/pesatura', () => ({ listaPesatura: vi.fn(), aggiornaSessione: vi.fn(), eliminaSessione: vi.fn() }))
vi.mock('@/components/pesatura/scaricaPesatura', () => ({ scaricaPesatura: vi.fn(), scaricaGraficoPng: vi.fn() }))

import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { aggiornaSessione, eliminaSessione, listaPesatura } from '@/api/pesatura'
import { scaricaGraficoPng, scaricaPesatura } from '@/components/pesatura/scaricaPesatura'
import { IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type Peso, type SessionePesatura } from '@/domain/pesatura/tipi'
import { ELEMENTO_NON_TROVATO, SESSIONE_CON_PESI_ALTRUI } from '@/lib/errori'
import { Sessione } from './Sessione'

const sessione = (extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g',
  impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, repliche: 2 }, data: '2026-11-11', nota: 'Mattina presto', conclusa: false, creato_da: 'io', ...extra,
})
const campione = (id: string, ordine: number, extra: Partial<CampionePesatura> = {}): CampionePesatura => ({
  id, sessione_id: 'S', pianta_id: null, nome: null, substrato: null, ordine, ...extra,
})
const peso = (id: string, campione_id: string, replica: number, tipo: Peso['tipo'], valore: number, extra: Partial<Peso> = {}): Peso => ({
  id, campione_id, replica, tipo, valore, lettura: null, misurato_il: '2026-11-11T08:00:00Z', creato_da: 'io', ...extra,
})

const trattamenti = [{ id: 'tB', etichetta: 'Sale', ordine: 1, livello_ids: [] }]
const piante = [{ id: 'p12', trattamento_id: 'tB', etichetta: '12', blocco: null, ordine: 1 }]
const campioni = [campione('c12', 1, { pianta_id: 'p12' })]
const pesiRwc = [
  peso('1', 'c12', 1, 'fresco', 1.2), peso('2', 'c12', 1, 'turgido', 1.6), peso('3', 'c12', 1, 'secco', 0.4),
  peso('4', 'c12', 2, 'fresco', 1.4), peso('5', 'c12', 2, 'turgido', 1.6), peso('6', 'c12', 2, 'secco', 0.4),
]

function dati(sessioni: SessionePesatura[], c: CampionePesatura[], pesi: Peso[]) {
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni, campioni: c, pesi })
}

function apri() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/laboratorio/pesatura/S']}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/pesatura/:sessioneId" element={<Sessione />} />
          <Route path="/esperimenti/:espId/laboratorio/pesatura" element={<p>Elenco Pesatura</p>} />
          <Route path="/esperimenti/:espId/laboratorio/pesatura/:sessioneId/pesa/:fase" element={<p>Pagina di pesata</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ delay: null })
}

const titolo = () => screen.findByRole('heading', { level: 2, name: 'Riepilogo' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'io', email: 'a@example.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(ruoloIn).mockResolvedValue('proprietario')
  vi.mocked(caricaConfig).mockResolvedValue({ trattamenti, piante } as never)
  vi.mocked(aggiornaSessione).mockResolvedValue(undefined)
  vi.mocked(eliminaSessione).mockResolvedValue(undefined)
  vi.mocked(scaricaPesatura).mockResolvedValue({ nomeFile: 'x.xlsx', grafici: 0, graficiNelFile: 0 })
  vi.mocked(scaricaGraficoPng).mockResolvedValue('x.png')
  dati([sessione()], campioni, pesiRwc)
})

afterEach(() => vi.restoreAllMocks())

describe('Sessione', () => {
  it('l\'intestazione ha titolo, data, nota e stato', async () => {
    apri()
    await titolo()
    expect(screen.getByRole('heading', { level: 1, name: 'RWC foglie' })).toBeInTheDocument()
    expect(screen.getByText(/11\/11\/2026/)).toBeInTheDocument()
    expect(screen.getByText('Mattina presto')).toBeInTheDocument()
    expect(screen.getByText('Completa')).toBeInTheDocument()
  })

  it('il riepilogo ha una riga per replica con RWC, e la Media per pianta', async () => {
    apri()
    await titolo()
    const riepilogo = within(screen.getByRole('region', { hidden: false, name: 'Riepilogo' }))
    expect(riepilogo.getByText('P12 · A')).toBeInTheDocument()
    expect(riepilogo.getByText('P12 · B')).toBeInTheDocument()
    // A: (1,2−0,4)/(1,6−0,4) = 66,67 %; B: 83,33 %; media 75 %
    expect(riepilogo.getByText('P12 · A').closest('li')).toHaveTextContent('66,67 %')
    expect(riepilogo.getByText('P12 · Media').closest('li')).toHaveTextContent('75 %')
  })

  it('una replica incompleta mostra un trattino e gli avvisi di coerenza', async () => {
    dati([sessione()], campioni, [peso('1', 'c12', 1, 'fresco', 1.2), peso('3', 'c12', 1, 'secco', 2)])
    apri()
    await titolo()
    const riga = screen.getByText('P12 · A').closest('li') as HTMLElement
    expect(riga).toHaveTextContent('—')
    expect(riga).toHaveTextContent('Il peso secco è maggiore del fresco.')
  })

  it('un pulsante per fase con l\'avanzamento che apre la pesata', async () => {
    dati([sessione()], campioni, pesiRwc.slice(0, 4))
    const u = apri()
    await titolo()
    expect(screen.getByRole('link', { name: 'Fresco · 2/2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Secco · 1/2' })).toBeInTheDocument()
    await u.click(screen.getByRole('link', { name: 'Turgido · 1/2' }))
    expect(await screen.findByText('Pagina di pesata')).toBeInTheDocument()
  })

  it('in cima al riepilogo c\'è la media per trattamento (ogni pianta conta una volta)', async () => {
    apri()
    await titolo()
    const medie = within(screen.getByRole('region', { name: 'RWC medio per trattamento' }))
    const riga = medie.getByText('Sale').closest('li') as HTMLElement
    expect(riga).toHaveTextContent('1 pianta')
    expect(riga).toHaveTextContent('75 %')
  })

  it('una pesata che non è dei vasi non si segna conclusa: è completa quando ha tutti i pesi', async () => {
    dati([sessione({ conclusa: true })], campioni, pesiRwc.slice(0, 4))
    apri()
    await titolo()
    expect(screen.getByText('Mancano dei pesi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Segna come conclusa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Riapri' })).not.toBeInTheDocument()
  })

  it('la nota si modifica sul posto', async () => {
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Modifica' }))
    const campo = screen.getByRole('textbox', { name: 'Nota' })
    expect(campo).toHaveValue('Mattina presto')
    await u.clear(campo)
    await u.type(campo, '  Dischetti da 1 cm  ')
    await u.click(screen.getByRole('button', { name: 'Salva la nota' }))
    await waitFor(() => expect(aggiornaSessione).toHaveBeenCalledWith({ id: 'S', data: '2026-11-11', nota: 'Dischetti da 1 cm', conclusa: false }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nota' })).not.toBeInTheDocument())
  })

  it('una nota svuotata si toglie; un errore lascia il testo nel campo', async () => {
    vi.mocked(aggiornaSessione).mockRejectedValueOnce(new Error('Rifiutato dal database.'))
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Modifica' }))
    await u.clear(screen.getByRole('textbox', { name: 'Nota' }))
    await u.click(screen.getByRole('button', { name: 'Salva la nota' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(aggiornaSessione).toHaveBeenCalledWith(expect.objectContaining({ nota: null }))
    expect(screen.getByRole('textbox', { name: 'Nota' })).toBeInTheDocument()
  })

  it('Ripeti questa pesata apre una nuova pesata compilata come questa', async () => {
    apri()
    await titolo()
    expect(screen.getByRole('link', { name: 'Ripeti questa pesata' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/nuova?da=S')
  })

  it('un rilevatore non modifica né elimina una sessione altrui', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    dati([sessione({ creato_da: 'altro' })], campioni, pesiRwc)
    apri()
    await titolo()
    await waitFor(() => expect(ruoloIn).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Elimina pesata' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scarica Excel' })).toBeInTheDocument()
  })

  it('un rilevatore che ha creato la sessione la gestisce', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    apri()
    await titolo()
    expect(await screen.findByRole('button', { name: 'Elimina pesata' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
  })

  it('un rilevatore non elimina la sua sessione se contiene pesi di altre persone', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    dati([sessione()], campioni, [...pesiRwc.slice(1), { ...pesiRwc[0], creato_da: 'altro' }])
    apri()
    await titolo()
    expect(await screen.findByText(SESSIONE_CON_PESI_ALTRUI)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina pesata' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
  })

  it('il proprietario elimina anche una sessione con pesi di altre persone', async () => {
    dati([sessione()], campioni, [...pesiRwc.slice(1), { ...pesiRwc[0], creato_da: 'altro' }])
    apri()
    await titolo()
    expect(await screen.findByRole('button', { name: 'Elimina pesata' })).toBeInTheDocument()
    expect(screen.queryByText(SESSIONE_CON_PESI_ALTRUI)).not.toBeInTheDocument()
  })

  it('un rilevatore a cui il database rifiuta l\'eliminazione legge perché', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    vi.mocked(eliminaSessione).mockRejectedValue(new Error(ELEMENTO_NON_TROVATO))
    const u = apri()
    await titolo()
    await u.click(await screen.findByRole('button', { name: 'Elimina pesata' }))
    await u.click(await screen.findByRole('button', { name: 'Elimina' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(SESSIONE_CON_PESI_ALTRUI)
  })

  it('Scarica Excel scarica solo questa pesata', async () => {
    dati([sessione(), sessione({ id: 'S2', data: '2026-11-04' })], campioni, pesiRwc)
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Scarica Excel' }))
    await waitFor(() => expect(scaricaPesatura).toHaveBeenCalledTimes(1))
    expect(vi.mocked(scaricaPesatura).mock.calls[0][0].sessioni.map(s => s.id)).toEqual(['S'])
    expect(screen.queryByRole('button', { name: /Scarica tutte/ })).not.toBeInTheDocument()
  })

  it('un errore di scaricamento resta sotto i pulsanti', async () => {
    vi.mocked(scaricaPesatura).mockRejectedValue(new Error('Non riesco a scrivere il file.'))
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Scarica Excel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Non riesco/)
  })

  it('Elimina pesata chiede conferma, poi elimina e torna all\'elenco', async () => {
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Elimina pesata' }))
    expect(eliminaSessione).not.toHaveBeenCalled()
    await u.click(await screen.findByRole('button', { name: 'Tieni la pesata' }))
    expect(eliminaSessione).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Elimina pesata' }))
    await u.click(await screen.findByRole('button', { name: 'Elimina' }))
    await waitFor(() => expect(eliminaSessione).toHaveBeenCalledWith('S'))
    expect(await screen.findByText('Elenco Pesatura')).toBeInTheDocument()
  })

  it('un errore di eliminazione resta in pagina', async () => {
    vi.mocked(eliminaSessione).mockRejectedValue(new Error('Rifiutato dal database.'))
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Elimina pesata' }))
    await u.click(await screen.findByRole('button', { name: 'Elimina' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Elenco Pesatura')).not.toBeInTheDocument()
  })

  it('sessione non trovata', async () => {
    dati([], [], [])
    apri()
    expect(await screen.findByText('Sessione non trovata.')).toBeInTheDocument()
  })

  it('senza rete lo dice e disattiva i salvataggi', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    await titolo()
    expect(screen.getByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elimina pesata' })).toBeDisabled()
  })
})

describe('Sessione con i vasi', () => {
  const vasiSessione = sessione({
    tipo: 'vasi', titolo: 'Curve vasi', nota: null, impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tensione', unita: 'kPa' } },
  })
  const vasi = [campione('v1', 1, { nome: 'V1', substrato: 'Torba' }), campione('v2', 2, { nome: 'V2', substrato: 'Torba' })]
  const asciuga = (id: string, c: string, valore: number, lettura: number, ora: string) =>
    peso(id, c, 1, 'asciugatura', valore, { lettura, misurato_il: `2026-11-11T${ora}:00Z` })
  const pesiVasi = [
    peso('s1', 'v1', 1, 'secco', 100), peso('c1', 'v1', 1, 'capacita_campo', 200),
    peso('s2', 'v2', 1, 'secco', 100), peso('c2', 'v2', 1, 'capacita_campo', 300),
    asciuga('a1', 'v1', 190, 5, '09'), asciuga('a2', 'v1', 160, 20, '10'), asciuga('a3', 'v1', 130, 60, '11'),
    asciuga('a4', 'v2', 280, 6, '09'),
  ]

  beforeEach(() => dati([vasiSessione], vasi, pesiVasi))

  it('mostra grafico, equazione di ogni substrato e consultazione', async () => {
    apri()
    await titolo()
    expect(screen.getByRole('img', { name: /Curve di ritenzione/ })).toBeInTheDocument()
    expect(screen.getByText(/%CC = .*ln\(kPa\)/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Peso dei vasi' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('i vasi non aspettano la configurazione', async () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => undefined))
    apri()
    await titolo()
    expect(screen.getByRole('heading', { level: 1, name: 'Curve vasi' })).toBeInTheDocument()
  })

  it('Scarica grafico (PNG) scarica il PNG', async () => {
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Scarica grafico (PNG)' }))
    await waitFor(() => expect(scaricaGraficoPng).toHaveBeenCalledTimes(1))
    expect(vi.mocked(scaricaGraficoPng).mock.calls[0][0]).toMatchObject({ titolo: 'Curve vasi', sensore: { unita: 'kPa' } })
  })

  it('il proprietario segna conclusa una taratura', async () => {
    const u = apri()
    await titolo()
    await u.click(screen.getByRole('button', { name: 'Segna come conclusa' }))
    await waitFor(() => expect(aggiornaSessione).toHaveBeenCalledWith({ id: 'S', data: '2026-11-11', nota: null, conclusa: true }))
  })

  it('una taratura conclusa si riapre', async () => {
    dati([{ ...vasiSessione, conclusa: true }], vasi, pesiVasi)
    const u = apri()
    await titolo()
    expect(screen.getByText('Conclusa')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Riapri' }))
    await waitFor(() => expect(aggiornaSessione).toHaveBeenCalledWith(expect.objectContaining({ conclusa: false })))
  })

  it('l\'asciugatura mostra quanti pesi ci sono, senza una frazione', async () => {
    apri()
    await titolo()
    expect(screen.getByRole('link', { name: 'Asciugatura · 4 pesi' })).toBeInTheDocument()
  })
})

describe('Sessione: dal riepilogo alla pesata', () => {
  it('toccando una riga si apre la pesata da quel campione, nella prima fase che gli manca', async () => {
    dati([sessione()], campioni, [peso('1', 'c12', 2, 'fresco', 1.4)])
    const utente = apri()
    await titolo()
    expect(screen.getByRole('link', { name: 'Pesa P12 · B' })).toHaveAttribute(
      'href', '/esperimenti/E/laboratorio/pesatura/S/pesa/turgido?campione=c12&replica=2')
    await utente.click(screen.getByRole('link', { name: 'Pesa P12 · A' }))
    expect(await screen.findByText('Pagina di pesata')).toBeInTheDocument()
  })

  it('un lettore non apre la pesata dal riepilogo', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    dati([sessione()], campioni, pesiRwc)
    apri()
    await titolo()
    await waitFor(() => expect(screen.queryByRole('link', { name: /^Pesa P12/ })).not.toBeInTheDocument())
  })
})
