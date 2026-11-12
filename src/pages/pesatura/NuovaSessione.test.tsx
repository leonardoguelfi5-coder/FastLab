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
vi.mock('@/api/pesatura', () => ({ listaPesatura: vi.fn(), creaSessione: vi.fn() }))

import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { creaSessione, listaPesatura } from '@/api/pesatura'
import type { CampionePesatura, SessionePesatura } from '@/domain/pesatura/tipi'
import { oggiLocale } from '@/lib/date'
import { NuovaSessione } from './NuovaSessione'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 2 trattamenti x 8 piante = 16 piante. Le piante arrivano volutamente fuori ordine: conta `ordine`.
const trattamenti = [
  { id: 'tA', etichetta: 'Controllo', ordine: 1, livello_ids: [] },
  { id: 'tB', etichetta: 'Sale', ordine: 2, livello_ids: [] },
]
const piante = Array.from({ length: 16 }, (_, i) => ({
  id: `p${i + 1}`, trattamento_id: i < 8 ? 'tA' : 'tB', etichetta: String(i + 1), blocco: null, ordine: i + 1,
})).reverse()

/** Una pesata fatta, da ripetere: RWC in mg con 3 repliche, sulle piante 2 e 5 e con una riga libera. */
const fatta: SessionePesatura = {
  id: 'S0', esperimento_id: 'E', titolo: 'RWC foglie', tipo: 'rwc', unita: 'mg',
  impostazioni: { repliche: 3, rapportoTampone: null, sensore: null }, data: '2026-10-28', nota: 'Dischetti da 1 cm', conclusa: false,
}
const campioniFatta: CampionePesatura[] = [
  { id: 'c1', sessione_id: 'S0', pianta_id: 'p5', nome: null, substrato: null, ordine: 2 },
  { id: 'c2', sessione_id: 'S0', pianta_id: 'p2', nome: null, substrato: null, ordine: 1 },
  { id: 'c3', sessione_id: 'S0', pianta_id: null, nome: 'Bianco', substrato: null, ordine: 3 },
]

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function apri(ricerca = '') {
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
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [fatta], campioni: campioniFatta, pesi: [] })
  vi.mocked(caricaConfig).mockResolvedValue({ trattamenti, piante } as never)
  vi.mocked(creaSessione).mockResolvedValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

const inizia = () => screen.findByRole('button', { name: 'Inizia la pesata' })
const titolo = () => screen.getByRole('textbox', { name: /^Titolo/ })

describe('NuovaSessione', () => {
  it('ha il titolo Nuova pesata e torna a Pesatura', async () => {
    apri()
    await inizia()
    expect(screen.getByRole('heading', { level: 1, name: 'Nuova pesata' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura')
  })

  it('un lettore non può iniziare: spiegazione al posto del modulo', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    apri()
    expect(await screen.findByText(/hai solo la lettura/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inizia la pesata' })).not.toBeInTheDocument()
  })

  it('tipo e unità sono menu a tendina; sotto il tipo dice cosa farà l\'app', async () => {
    const u = apri()
    await inizia()
    const tipo = screen.getByRole('combobox', { name: 'Tipo' })
    expect(tipo).toHaveValue('aliquota')
    expect(screen.getByRole('combobox', { name: 'Unità di misura' })).toHaveValue('g')
    await u.selectOptions(tipo, 'rwc')
    expect(tipo).toHaveAccessibleDescription(/calcola l'RWC/)
  })

  it('"Inserisci tu l\'unità" apre un campo per scriverla', async () => {
    const u = apri()
    await inizia()
    expect(screen.queryByRole('textbox', { name: /La tua unità/ })).not.toBeInTheDocument()
    await u.selectOptions(screen.getByRole('combobox', { name: 'Unità di misura' }), 'altra')
    await u.type(titolo(), 'Pesata in microgrammi')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(await screen.findByText('Scrivi l\'unità di misura.')).toBeInTheDocument()
    await u.type(screen.getByRole('textbox', { name: /La tua unità/ }), ' µg ')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    expect(vi.mocked(creaSessione).mock.calls[0][0].unita).toBe('µg')
  })

  it('il tampone con un\'unità scritta a mano non si calcola: lo dice e non parte', async () => {
    const u = apri()
    await inizia()
    await u.type(titolo(), 'Antociani')
    await u.selectOptions(screen.getByRole('combobox', { name: 'Unità di misura' }), 'altra')
    await u.type(screen.getByRole('textbox', { name: /La tua unità/ }), 'lb')
    await u.click(screen.getByRole('switch', { name: 'Calcola i mL di tampone' }))
    await u.type(screen.getByLabelText('mL di tampone per g di campione'), '10')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(await screen.findByText(/Il tampone si calcola solo con g, mg o kg/)).toBeInTheDocument()
    expect(creaSessione).not.toHaveBeenCalled()
  })

  it('serve un titolo', async () => {
    const u = apri()
    await u.click(await inizia())
    expect(await screen.findByText('Scrivi un titolo.')).toBeInTheDocument()
    expect(creaSessione).not.toHaveBeenCalled()
  })

  it('le repliche si cambiano con − e +, da 1 a 10', async () => {
    const u = apri()
    await inizia()
    const meno = screen.getByRole('button', { name: 'Una replica in meno' })
    expect(meno).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Una replica in più' }))
    await u.click(screen.getByRole('button', { name: 'Una replica in più' }))
    expect(screen.getByText('3 pesi per campione (A, B…)')).toBeInTheDocument()
    await u.type(titolo(), 'Clorofille')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    expect(vi.mocked(creaSessione).mock.calls[0][0].impostazioni.repliche).toBe(3)
  })

  it('la data parte da oggi ed è modificabile; la nota è su più righe e facoltativa', async () => {
    const u = apri()
    await inizia()
    const data = screen.getByLabelText('Data')
    expect(data).toHaveValue(oggiLocale())
    await u.clear(data)
    await u.type(data, '2026-10-05')
    expect(data).toHaveValue('2026-10-05')
    const nota = screen.getByRole('textbox', { name: /^Nota/ })
    expect(nota.tagName).toBe('TEXTAREA')
    expect(nota).toHaveValue('')
  })

  it('di default sono tutte le piante, con il contatore', async () => {
    apri()
    await inizia()
    expect(screen.getByRole('radio', { name: 'Tutte le piante' })).toBeChecked()
    expect(screen.getByText('16 piante')).toBeInTheDocument()
  })

  it('per trattamento: le spunte scelgono le piante', async () => {
    const u = apri()
    await inizia()
    await u.type(titolo(), 'Antociani')
    await u.click(screen.getByRole('radio', { name: 'Per trattamento' }))
    expect(screen.getByText('0 piante')).toBeInTheDocument()
    await u.click(screen.getByRole('checkbox', { name: 'Sale' }))
    expect(screen.getByText('8 piante')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    const campioni = vi.mocked(creaSessione).mock.calls[0][1]
    expect(campioni.map(c => c.pianta_id)).toEqual(['p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16'])
  })

  it('non si salva senza piante né righe', async () => {
    const u = apri()
    await inizia()
    await u.type(titolo(), 'Antociani')
    await u.click(screen.getByRole('radio', { name: 'Scegli a mano' }))
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(creaSessione).not.toHaveBeenCalled()
    expect(await screen.findByText('Scegli almeno una pianta o aggiungi una riga.')).toBeInTheDocument()
  })

  it('Inizia la pesata salva le impostazioni scritte, le piante in ordine e le righe libere, e porta alla prima fase', async () => {
    const u = apri()
    await inizia()
    await u.type(titolo(), '  Antociani foglie ')
    await u.selectOptions(screen.getByRole('combobox', { name: 'Unità di misura' }), 'mg')
    await u.click(screen.getByRole('switch', { name: 'Calcola i mL di tampone' }))
    await u.type(screen.getByLabelText('mL di tampone per g di campione'), '10')
    await u.type(screen.getByRole('textbox', { name: /^Nota/ }), 'Mattina')
    await u.click(screen.getByRole('button', { name: 'Aggiungi riga libera' }))
    await u.click(screen.getByRole('button', { name: 'Aggiungi riga libera' }))
    await u.type(screen.getByLabelText('Nome riga 1'), 'Bianco')
    // la seconda riga resta vuota: non si salva
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))

    await waitFor(() => expect(creaSessione).toHaveBeenCalledTimes(1))
    const [s, campioni] = vi.mocked(creaSessione).mock.calls[0]
    expect(s).toEqual({
      id: expect.stringMatching(UUID), esperimento_id: 'E', titolo: 'Antociani foglie', tipo: 'aliquota', unita: 'mg',
      impostazioni: { repliche: 1, rapportoTampone: 10, sensore: null }, data: oggiLocale(), nota: 'Mattina', conclusa: false,
    })
    expect(campioni).toHaveLength(17)
    expect(campioni.slice(0, 16).map(c => c.pianta_id)).toEqual(Array.from({ length: 16 }, (_, i) => `p${i + 1}`))
    expect(campioni[16]).toMatchObject({ pianta_id: null, nome: 'Bianco', ordine: 17 })
    expect(campioni.every(c => c.sessione_id === s.id && UUID.test(c.id))).toBe(true)
    expect(await screen.findByText('Pagina pesata')).toBeInTheDocument()
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/laboratorio/pesatura/${s.id}/pesa/aliquota`)
  })

  it('una nota vuota si salva come null', async () => {
    const u = apri()
    await inizia()
    await u.type(titolo(), 'Antociani')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    expect(vi.mocked(creaSessione).mock.calls[0][0].nota).toBeNull()
  })

  it('un errore lascia il modulo compilato e un nuovo tentativo riscrive le stesse righe', async () => {
    vi.mocked(creaSessione).mockRejectedValueOnce(new Error('rete caduta'))
    const u = apri()
    await inizia()
    await u.type(titolo(), 'Antociani')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(titolo()).toHaveValue('Antociani')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalledTimes(2))
    const [prima, seconda] = vi.mocked(creaSessione).mock.calls
    expect(seconda[0].id).toBe(prima[0].id)
    expect(seconda[1].map(c => c.id)).toEqual(prima[1].map(c => c.id))
  })

  it('un doppio tocco scrive una volta sola', async () => {
    let finisci: () => void = () => {}
    vi.mocked(creaSessione).mockReturnValue(new Promise<void>(r => { finisci = r }))
    const u = apri()
    await inizia()
    await u.type(titolo(), 'Antociani')
    await u.dblClick(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(creaSessione).toHaveBeenCalledTimes(1)
    finisci()
    expect(await screen.findByText('Pagina pesata')).toBeInTheDocument()
  })

  it('senza rete lo dice e non si salva', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const u = apri()
    expect(await screen.findByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
    const pulsante = await inizia()
    expect(pulsante).toBeDisabled()
    await u.click(pulsante)
    expect(creaSessione).not.toHaveBeenCalled()
  })
})

describe('NuovaSessione: Ripeti', () => {
  it('parte compilata come la pesata scelta, con la data di oggi', async () => {
    apri('?da=S0')
    await inizia()
    expect(screen.getByRole('heading', { level: 1, name: 'Ripeti pesata' })).toBeInTheDocument()
    expect(screen.getByText(/Compilata come/)).toHaveTextContent('Compilata come RWC foglie del 28/10/2026')
    expect(titolo()).toHaveValue('RWC foglie')
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveValue('rwc')
    expect(screen.getByRole('combobox', { name: 'Unità di misura' })).toHaveValue('mg')
    expect(screen.getByText('3 pesi per campione (A, B…)')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Nota/ })).toHaveValue('Dischetti da 1 cm')
    expect(screen.getByLabelText('Data')).toHaveValue(oggiLocale())
  })

  it('riprende le stesse piante (a mano) e le stesse righe libere, e crea una pesata nuova', async () => {
    const u = apri('?da=S0')
    await inizia()
    expect(screen.getByRole('radio', { name: 'Scegli a mano' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'P2' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'P5' })).toBeChecked()
    expect(screen.getByLabelText('Nome riga 1')).toHaveValue('Bianco')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    const [s, campioni] = vi.mocked(creaSessione).mock.calls[0]
    expect(s.id).not.toBe('S0')
    expect(s).toMatchObject({ titolo: 'RWC foglie', tipo: 'rwc', unita: 'mg', impostazioni: { repliche: 3 }, nota: 'Dischetti da 1 cm' })
    expect(campioni.map(c => c.pianta_id ?? c.nome)).toEqual(['p2', 'p5', 'Bianco'])
    expect(campioni.every(c => !['c1', 'c2', 'c3'].includes(c.id))).toBe(true)
  })

  it('una pesata da ripetere che non c\'è più: lo dice e rimanda a Pesatura', async () => {
    apri('?da=sparita')
    expect(await screen.findByText('La pesata da ripetere non c\'è più.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla Pesatura' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura')
  })
})

describe('NuovaSessione: vasi', () => {
  async function sceltiVasi() {
    const u = apri()
    await inizia()
    await u.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'vasi')
    return u
  }

  it('niente piante né repliche: un elenco di vasi con Nome e Substrato, e il sensore', async () => {
    const u = await sceltiVasi()
    expect(screen.queryByRole('radio', { name: 'Tutte le piante' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Una replica in più' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sensore' })).toHaveValue('umidita')
    await u.click(screen.getByRole('button', { name: 'Aggiungi vaso' }))
    expect(screen.getByLabelText('Nome vaso 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Substrato vaso 1')).toBeInTheDocument()
  })

  it('serve almeno un vaso con il nome', async () => {
    const u = await sceltiVasi()
    await u.type(titolo(), 'Taratura')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    expect(creaSessione).not.toHaveBeenCalled()
    expect(await screen.findByText('Aggiungi almeno un vaso.')).toBeInTheDocument()
  })

  it('salva i vasi come righe con substrato, il sensore e una replica', async () => {
    const u = await sceltiVasi()
    await u.type(titolo(), 'Taratura')
    await u.selectOptions(screen.getByRole('combobox', { name: 'Sensore' }), 'tensione')
    await u.click(screen.getByRole('button', { name: 'Aggiungi vaso' }))
    await u.type(screen.getByLabelText('Nome vaso 1'), 'V1')
    await u.type(screen.getByLabelText('Substrato vaso 1'), 'Torba')
    await u.click(screen.getByRole('button', { name: 'Aggiungi vaso' }))
    expect(screen.getByLabelText('Substrato vaso 2')).toHaveValue('Torba')
    await u.type(screen.getByLabelText('Nome vaso 2'), 'V2')
    await u.click(screen.getByRole('button', { name: 'Inizia la pesata' }))
    await waitFor(() => expect(creaSessione).toHaveBeenCalled())
    const [s, campioni] = vi.mocked(creaSessione).mock.calls[0]
    expect(s).toMatchObject({ tipo: 'vasi', unita: 'g', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tensione', unita: 'kPa' } } })
    expect(campioni).toMatchObject([
      { pianta_id: null, nome: 'V1', substrato: 'Torba', ordine: 1 },
      { pianta_id: null, nome: 'V2', substrato: 'Torba', ordine: 2 },
    ])
    expect(screen.getByTestId('posizione')).toHaveTextContent('/secco')
  })
})
