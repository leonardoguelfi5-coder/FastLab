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
vi.mock('@/api/pesatura', () => ({
  listaAnalisi: vi.fn(), salvaAnalisi: vi.fn(), listaPesatura: vi.fn(),
}))
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { listaAnalisi, listaPesatura, salvaAnalisi } from '@/api/pesatura'
import { IMPOSTAZIONI_PREDEFINITE, type AnalisiPesatura, type SessionePesatura } from '@/domain/pesatura/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { EditorAnalisi } from './EditorAnalisi'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const analisi = (id: string, extra: Partial<AnalisiPesatura> = {}): AnalisiPesatura => ({
  id, titolo: `Analisi ${id}`, tipo: 'rwc', unita: 'g', impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, repliche: 3 }, archiviata: false, creato_da: 'io', ...extra,
})
const sessione = (id: string, analisiId: string): SessionePesatura => ({
  id, esperimento_id: 'E', analisi_id: analisiId, titolo: 'S', tipo: 'rwc', unita: 'g', impostazioni: IMPOSTAZIONI_PREDEFINITE,
  data: '2026-11-01', nota: null, conclusa: false,
})

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function apri(ricerca = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/esperimenti/E/laboratorio/pesatura/analisi${ricerca}`]}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/pesatura/analisi" element={<EditorAnalisi />} />
          <Route path="/esperimenti/:espId/laboratorio/pesatura" element={<p>Elenco Pesatura</p>} />
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
  vi.mocked(salvaAnalisi).mockResolvedValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

describe('EditorAnalisi: nuova analisi', () => {
  it('ha i campi con i valori di partenza', async () => {
    apri()
    expect(await screen.findByRole('heading', { name: 'Nuova analisi', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura')
    expect(screen.getByLabelText(/Titolo/)).toHaveValue('')
    expect(screen.getAllByRole('radio', { name: /^(Aliquota|RWC|% sostanza secca|Vasi)$/ })).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'Aliquota' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'g' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'mg' })).not.toBeChecked()
    expect(screen.getByLabelText('Repliche di default')).toHaveValue('1')
  })

  it('non mostra la barra in basso: coprirebbe il pulsante Salva', async () => {
    apri()
    expect(await screen.findByRole('heading', { name: 'Nuova analisi', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navigazione esperimento' })).not.toBeInTheDocument()
  })

  it('non salva senza titolo', async () => {
    const utente = apri()
    await utente.click(await screen.findByRole('button', { name: 'Salva' }))
    expect(salvaAnalisi).not.toHaveBeenCalled()
    expect(await screen.findByText('Scrivi un titolo.')).toBeInTheDocument()
  })

  it('salva con un id nuovo e torna a Pesatura', async () => {
    const utente = apri()
    await utente.type(await screen.findByLabelText(/Titolo/), '  Peso fresco foglie ')
    await utente.click(screen.getByRole('radio', { name: 'RWC' }))
    await utente.click(screen.getByRole('radio', { name: 'mg' }))
    await utente.clear(screen.getByLabelText('Repliche di default'))
    await utente.type(screen.getByLabelText('Repliche di default'), '3')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalledTimes(1))
    expect(salvaAnalisi).toHaveBeenCalledWith({
      id: expect.stringMatching(UUID), titolo: 'Peso fresco foglie', tipo: 'rwc', unita: 'mg',
      impostazioni: { repliche: 3, rapportoTampone: null, sensore: null }, archiviata: false,
    })
    expect(toastSalvato).toHaveBeenCalled()
    expect(await screen.findByText('Elenco Pesatura')).toBeInTheDocument()
  })

  it('le repliche stanno tra 1 e 10', async () => {
    const utente = apri()
    await utente.type(await screen.findByLabelText(/Titolo/), 'X')
    await utente.clear(screen.getByLabelText('Repliche di default'))
    await utente.type(screen.getByLabelText('Repliche di default'), '11')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    expect(salvaAnalisi).not.toHaveBeenCalled()
    expect(await screen.findByText('Le repliche vanno da 1 a 10.')).toBeInTheDocument()
  })

  it('per l\'aliquota offre il calcolo dei mL di tampone con i mL per g', async () => {
    const utente = apri()
    await utente.type(await screen.findByLabelText(/Titolo/), 'Antociani')
    expect(screen.queryByLabelText('mL per g')).not.toBeInTheDocument()
    await utente.click(screen.getByRole('switch', { name: 'Calcola i mL di tampone' }))
    await utente.type(screen.getByLabelText('mL per g'), '10')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalled())
    expect(vi.mocked(salvaAnalisi).mock.calls[0][0].impostazioni).toEqual({ repliche: 1, rapportoTampone: 10, sensore: null })
  })

  it('con il calcolo acceso chiede i mL per g', async () => {
    const utente = apri()
    await utente.type(await screen.findByLabelText(/Titolo/), 'Antociani')
    await utente.click(screen.getByRole('switch', { name: 'Calcola i mL di tampone' }))
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    expect(salvaAnalisi).not.toHaveBeenCalled()
    expect(await screen.findByText('Scrivi quanti mL di tampone per ogni g.')).toBeInTheDocument()
  })

  it('per i vasi sceglie il sensore, con unità modificabile', async () => {
    const utente = apri()
    await utente.type(await screen.findByLabelText(/Titolo/), 'Asciugatura')
    await utente.click(screen.getByRole('radio', { name: 'Vasi' }))
    expect(screen.queryByRole('switch', { name: 'Calcola i mL di tampone' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Umidità' })).toBeChecked()
    expect(screen.getByLabelText('Unità del sensore')).toHaveValue('%')
    await utente.click(screen.getByRole('radio', { name: 'Tensione' }))
    expect(screen.getByLabelText('Unità del sensore')).toHaveValue('kPa')
    await utente.clear(screen.getByLabelText('Unità del sensore'))
    await utente.type(screen.getByLabelText('Unità del sensore'), 'cbar')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalled())
    expect(vi.mocked(salvaAnalisi).mock.calls[0][0]).toMatchObject({
      tipo: 'vasi', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tensione', unita: 'cbar' } },
    })
  })

  it('un salvataggio fallito resta nel modulo e mostra l\'errore', async () => {
    vi.mocked(salvaAnalisi).mockRejectedValue(new TypeError('Failed to fetch'))
    const utente = apri()
    await utente.type(await screen.findByLabelText(/Titolo/), 'Persa')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText(/Titolo/)).toHaveValue('Persa')
    expect(screen.getByTestId('posizione')).toHaveTextContent('/analisi')
  })

  it('senza rete lo dice e non si salva', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    expect(await screen.findByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
  })
})

describe('EditorAnalisi: analisi esistente', () => {
  it('apre i valori salvati e li aggiorna con lo stesso id', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1', { titolo: 'Vecchio titolo', unita: 'mg' })])
    const utente = apri('?id=a1')
    expect(await screen.findByRole('heading', { name: 'Modifica analisi', level: 1 })).toBeInTheDocument()
    expect(await screen.findByLabelText(/Titolo/)).toHaveValue('Vecchio titolo')
    expect(screen.getByRole('radio', { name: 'RWC' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'mg' })).toBeChecked()
    expect(screen.getByLabelText('Repliche di default')).toHaveValue('3')
    await utente.clear(screen.getByLabelText(/Titolo/))
    await utente.type(screen.getByLabelText(/Titolo/), 'Nuovo titolo')
    await utente.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalled())
    expect(salvaAnalisi).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', titolo: 'Nuovo titolo', tipo: 'rwc', unita: 'mg' }))
  })

  it('con delle sessioni il tipo non si cambia', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1')])
    vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [sessione('s1', 'a1')], campioni: [], pesi: [] })
    apri('?id=a1')
    expect(await screen.findByText('Il tipo non si cambia: l\'analisi ha già delle sessioni.')).toBeInTheDocument()
    for (const nome of ['Aliquota', 'RWC', '% sostanza secca', 'Vasi']) expect(screen.getByRole('radio', { name: nome })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'RWC' })).toBeChecked()
  })

  it('senza sessioni il tipo si può cambiare e il messaggio non c\'è', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1')])
    apri('?id=a1')
    await screen.findByLabelText(/Titolo/)
    expect(screen.queryByText(/Il tipo non si cambia/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Vasi' })).toBeEnabled()
  })

  it('un\'analisi di un altro utente è in sola lettura e si copia tra le proprie', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a9', { titolo: 'Di Marco', creato_da: 'altro' })])
    const utente = apri('?id=a9')
    expect(await screen.findByText('Di Marco')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Titolo/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archivia' })).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Copia tra le mie' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalledTimes(1))
    const copia = vi.mocked(salvaAnalisi).mock.calls[0][0]
    expect(copia.id).toMatch(UUID)
    expect(copia.id).not.toBe('a9')
    expect(copia).toMatchObject({ titolo: 'Di Marco', tipo: 'rwc', unita: 'g', archiviata: false })
    expect(await screen.findByText('Elenco Pesatura')).toBeInTheDocument()
  })

  it('a un lettore non offre di copiare', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a9', { titolo: 'Di Marco', creato_da: 'altro' })])
    apri('?id=a9')
    await screen.findByText('Di Marco')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Copia tra le mie' })).not.toBeInTheDocument())
  })

  it('Archivia segna l\'analisi archiviata e torna a Pesatura', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1')])
    const utente = apri('?id=a1')
    await utente.click(await screen.findByRole('button', { name: 'Archivia' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalled())
    expect(salvaAnalisi).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', archiviata: true }))
    expect(await screen.findByText('Elenco Pesatura')).toBeInTheDocument()
  })

  it('Ripristina riporta l\'analisi tra quelle attive', async () => {
    vi.mocked(listaAnalisi).mockResolvedValue([analisi('a1', { archiviata: true })])
    const utente = apri('?id=a1')
    expect(screen.queryByRole('button', { name: 'Archivia' })).not.toBeInTheDocument()
    await utente.click(await screen.findByRole('button', { name: 'Ripristina' }))
    await waitFor(() => expect(salvaAnalisi).toHaveBeenCalled())
    expect(salvaAnalisi).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', archiviata: false }))
  })

  it('un\'analisi che non c\'è lo dice', async () => {
    apri('?id=zzz')
    expect(await screen.findByText('Analisi non trovata.')).toBeInTheDocument()
  })
})
