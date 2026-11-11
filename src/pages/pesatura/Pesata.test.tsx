import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
vi.mock('@/api/pesatura', () => ({ listaPesatura: vi.fn(), salvaPeso: vi.fn() }))

import { useSessione } from '@/api/auth'
import { caricaConfig } from '@/api/esperimenti'
import { sonoAdmin } from '@/api/inviti'
import { ruoloIn } from '@/api/persone'
import { listaPesatura, salvaPeso } from '@/api/pesatura'
import {
  IMPOSTAZIONI_PREDEFINITE, type CampionePesatura, type Peso, type SessionePesatura,
} from '@/domain/pesatura/tipi'
import { PESO_GIA_INSERITO } from '@/lib/errori'
import { Pesata } from './Pesata'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const sessione = (extra: Partial<SessionePesatura> = {}): SessionePesatura => ({
  id: 'S', esperimento_id: 'E', analisi_id: 'a1', titolo: 'RWC foglie', tipo: 'rwc', unita: 'g',
  impostazioni: { ...IMPOSTAZIONI_PREDEFINITE, repliche: 2 }, data: '2026-11-11', nota: null, conclusa: false, creato_da: 'io', ...extra,
})
const campione = (id: string, ordine: number, extra: Partial<CampionePesatura> = {}): CampionePesatura => ({
  id, sessione_id: 'S', pianta_id: null, nome: null, substrato: null, ordine, ...extra,
})
const peso = (id: string, campione_id: string, replica: number, tipo: Peso['tipo'], valore: number, extra: Partial<Peso> = {}): Peso => ({
  id, campione_id, replica, tipo, valore, lettura: null, misurato_il: '2026-11-11T08:00:00Z', creato_da: 'io', ...extra,
})

const trattamenti = [{ id: 'tB', etichetta: 'Sale', ordine: 1, livello_ids: [] }]
const piante = [
  { id: 'p12', trattamento_id: 'tB', etichetta: '12', blocco: null, ordine: 1 },
  { id: 'p13', trattamento_id: 'tB', etichetta: '13', blocco: null, ordine: 2 },
]
const campioni = [
  campione('c12', 1, { pianta_id: 'p12' }),
  campione('c13', 2, { pianta_id: 'p13' }),
]
const unaRepliche = { ...IMPOSTAZIONI_PREDEFINITE, repliche: 1 }

function dati(s: SessionePesatura, c: CampionePesatura[], pesi: Peso[]) {
  vi.mocked(listaPesatura).mockResolvedValue({ sessioni: [s], campioni: c, pesi })
}

function apri(fase = 'fresco') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/esperimenti/E/laboratorio/pesatura/S/pesa/${fase}`]}>
        <Routes>
          <Route path="/esperimenti/:espId/laboratorio/pesatura/:sessioneId/pesa/:fase" element={<Pesata />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ delay: null })
}

const salva = () => screen.findByRole('button', { name: 'Salva e vai al prossimo' })
const campoPeso = () => screen.getByLabelText(/^Peso/)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSessione).mockReturnValue({ sessione: { user: { id: 'io', email: 'giulia@example.it' } } as Session, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(ruoloIn).mockResolvedValue('proprietario')
  vi.mocked(caricaConfig).mockResolvedValue({ trattamenti, piante } as never)
  vi.mocked(salvaPeso).mockResolvedValue(undefined)
  dati(sessione(), campioni, [])
})

afterEach(() => vi.restoreAllMocks())

describe('Pesata', () => {
  it('si apre sul primo passo mancante e mostra etichetta, trattamento, replica e fase', async () => {
    dati(sessione(), campioni, [peso('x1', 'c12', 1, 'fresco', 1.2), peso('x2', 'c12', 2, 'fresco', 1.3)])
    apri()
    await salva()
    expect(screen.getByText('P13')).toBeInTheDocument()
    expect(screen.getByText('Sale')).toBeInTheDocument()
    expect(screen.getByText('Replica A')).toBeInTheDocument()
    expect(screen.getByText('Fresco')).toBeInTheDocument()
  })

  it('il campo peso ha l\'unità della sessione', async () => {
    dati(sessione({ unita: 'mg' }), campioni, [])
    apri()
    await salva()
    expect(screen.getByText('mg')).toBeInTheDocument()
  })

  it('la replica non compare se ce n\'è una sola', async () => {
    dati(sessione({ impostazioni: unaRepliche }), campioni, [])
    apri()
    await salva()
    expect(screen.queryByText(/^Replica/)).not.toBeInTheDocument()
  })

  it('Salva e vai al prossimo scrive un peso nuovo, passa avanti e dice che è salvato', async () => {
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1,25')
    await utente.click(await salva())
    await waitFor(() => expect(salvaPeso).toHaveBeenCalledTimes(1))
    const [espId, sessioneId, p] = vi.mocked(salvaPeso).mock.calls[0]
    expect([espId, sessioneId]).toEqual(['E', 'S'])
    expect(p).toMatchObject({ campione_id: 'c12', replica: 1, tipo: 'fresco', valore: 1.25, lettura: null })
    expect(p.id).toMatch(UUID)
    expect(await screen.findByText('Replica B')).toBeInTheDocument()
    expect(screen.getByText('P12 · A salvato ✓')).toBeInTheDocument()
    expect(campoPeso()).toHaveValue('')
  })

  it('un peso già presente è precompilato e si riscrive con il suo id', async () => {
    dati(sessione(), campioni, [peso('x1', 'c12', 1, 'fresco', 1.2)])
    const utente = apri()
    await salva()
    await utente.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(campoPeso()).toHaveValue('1,2')
    await utente.clear(campoPeso())
    await utente.type(campoPeso(), '1,4')
    await utente.click(await salva())
    await waitFor(() => expect(salvaPeso).toHaveBeenCalled())
    expect(vi.mocked(salvaPeso).mock.calls[0][2]).toMatchObject({ id: 'x1', valore: 1.4, replica: 1 })
  })

  it('durante il salvataggio il pulsante è spento: un doppio tocco scrive una volta sola', async () => {
    let finisci: () => void = () => {}
    vi.mocked(salvaPeso).mockReturnValue(new Promise<void>(r => { finisci = r }))
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1')
    const pulsante = await salva()
    await utente.dblClick(pulsante)
    expect(salvaPeso).toHaveBeenCalledTimes(1)
    expect(pulsante).toBeDisabled()
    finisci()
    expect(await screen.findByText('Replica B')).toBeInTheDocument()
  })

  it('durante il salvataggio Indietro e Salta sono spenti e l\'indice non salta', async () => {
    let finisci: () => void = () => {}
    vi.mocked(salvaPeso).mockReturnValue(new Promise<void>(r => { finisci = r }))
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1')
    await utente.click(await salva())
    expect(screen.getByRole('button', { name: 'Salta' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Indietro' })).toBeDisabled()
    finisci()
    expect(await screen.findByText('Replica B')).toBeInTheDocument()
    expect(screen.getByText('Passo 2 di 4')).toBeInTheDocument()
  })

  it('con un errore di rete il valore resta, compare Riprova e l\'indice non cambia; riprovando si riscrive la stessa riga', async () => {
    vi.mocked(salvaPeso).mockRejectedValueOnce(new Error('Failed to fetch'))
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1,25')
    await utente.click(await salva())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(campoPeso()).toHaveValue('1,25')
    expect(screen.getByText('Replica A')).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Replica B')).toBeInTheDocument()
    const [prima, dopo] = vi.mocked(salvaPeso).mock.calls.map(c => c[2])
    expect(dopo.id).toBe(prima.id)
  })

  it('l\'errore 23505 mostra il messaggio del peso già inserito, senza Riprova', async () => {
    vi.mocked(salvaPeso).mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "pesi_unico"' })
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1')
    await utente.click(await salva())
    expect(await screen.findByText(PESO_GIA_INSERITO)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument()
    expect(screen.getByText('Replica A')).toBeInTheDocument()
  })

  it('senza un numero non si salva', async () => {
    const utente = apri()
    await utente.click(await salva())
    expect(salvaPeso).not.toHaveBeenCalled()
    expect(await screen.findByText('Scrivi il peso.')).toBeInTheDocument()
  })

  it('Salta e Indietro spostano l\'indice senza salvare', async () => {
    const utente = apri()
    await salva()
    expect(screen.getByRole('button', { name: 'Indietro' })).toBeDisabled()
    await utente.click(screen.getByRole('button', { name: 'Salta' }))
    expect(screen.getByText('Replica B')).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(screen.getByText('Replica A')).toBeInTheDocument()
    expect(salvaPeso).not.toHaveBeenCalled()
  })

  it('spostarsi toglie il messaggio di salvato', async () => {
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1')
    await utente.click(await salva())
    expect(await screen.findByText('P12 · A salvato ✓')).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Salta' }))
    expect(screen.queryByText('P12 · A salvato ✓')).not.toBeInTheDocument()
  })

  it('un peso di un\'altra persona, senza il permesso di correggere, è in sola lettura', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    dati(sessione({ impostazioni: unaRepliche }), [campioni[0]], [peso('x1', 'c12', 1, 'fresco', 1.2, { creato_da: 'altro' })])
    const utente = apri()
    // Tutto pesato: si torna all'ultimo passo, che è di un'altra persona.
    await utente.click(await screen.findByRole('button', { name: 'Indietro' }))
    expect(await screen.findByText('Pesato da un\'altra persona.')).toBeInTheDocument()
    expect(campoPeso()).toHaveAttribute('readonly')
    expect(campoPeso()).toHaveValue('1,2')
    expect(screen.getByRole('button', { name: 'Salva e vai al prossimo' })).toBeDisabled()
  })

  it('un peso proprio del rilevatore si può correggere', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('rilevatore')
    dati(sessione({ impostazioni: unaRepliche }), [campioni[0]], [peso('x1', 'c12', 1, 'fresco', 1.2)])
    const utente = apri()
    await utente.click(await screen.findByRole('button', { name: 'Indietro' }))
    expect(campoPeso()).not.toHaveAttribute('readonly')
    expect(screen.queryByText('Pesato da un\'altra persona.')).not.toBeInTheDocument()
  })

  it('aliquota con rapporto: mentre si scrive dice quanto tampone aggiungere', async () => {
    dati(
      sessione({ tipo: 'aliquota', unita: 'g', impostazioni: { repliche: 1, rapportoTampone: 3, sensore: null } }),
      [campione('c1', 1, { nome: 'Campione 1' })],
      [],
    )
    const utente = apri('aliquota')
    await salva()
    await utente.type(campoPeso(), '0,34')
    expect(screen.getByText('Aggiungi 1,02 mL di tampone')).toBeInTheDocument()
  })

  it('secco di RWC maggiore del fresco: avviso, ma si può salvare', async () => {
    dati(sessione({ impostazioni: unaRepliche }), campioni, [
      peso('f1', 'c12', 1, 'fresco', 1), peso('t1', 'c12', 1, 'turgido', 1.5),
    ])
    const utente = apri('secco')
    await salva()
    await utente.type(campoPeso(), '2')
    expect(screen.getByText(/Il peso secco è maggiore del fresco./)).toBeInTheDocument()
    await utente.click(await salva())
    await waitFor(() => expect(salvaPeso).toHaveBeenCalledTimes(1))
  })

  it('asciugatura: peso e lettura del sensore, entrambi obbligatori', async () => {
    dati(
      sessione({
        tipo: 'vasi', unita: 'g', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'umidita', unita: '%' } },
      }),
      [campione('v1', 1, { nome: 'V1', substrato: 'Torba' }), campione('v2', 2, { nome: 'V2' })],
      [peso('s1', 'v1', 1, 'secco', 100)],
    )
    const utente = apri('asciugatura')
    await salva()
    expect(screen.getByText('V1')).toBeInTheDocument()
    expect(screen.queryByText(/^Replica/)).not.toBeInTheDocument()
    await utente.type(campoPeso(), '150')
    await utente.click(await salva())
    expect(salvaPeso).not.toHaveBeenCalled()
    expect(await screen.findByText('Scrivi la lettura del sensore.')).toBeInTheDocument()
    await utente.type(screen.getByLabelText(/^Umidità \(%\)/), '35')
    await utente.click(await salva())
    await waitFor(() => expect(salvaPeso).toHaveBeenCalledTimes(1))
    expect(vi.mocked(salvaPeso).mock.calls[0][2]).toMatchObject({ campione_id: 'v1', tipo: 'asciugatura', replica: 1, valore: 150, lettura: 35 })
  })

  it('asciugatura: si riparte sempre dal primo vaso e un giro nuovo scrive pesi nuovi', async () => {
    dati(
      sessione({ tipo: 'vasi', impostazioni: { repliche: 1, rapportoTampone: null, sensore: { tipo: 'tensione', unita: 'kPa' } } }),
      [campione('v1', 1, { nome: 'V1' }), campione('v2', 2, { nome: 'V2' })],
      [peso('a0', 'v1', 1, 'asciugatura', 140, { lettura: 30 })],
    )
    const utente = apri('asciugatura')
    await salva()
    expect(screen.getByText('V1')).toBeInTheDocument()
    expect(screen.getByText('Passo 1 di 2')).toBeInTheDocument()
    await utente.type(campoPeso(), '130')
    await utente.type(screen.getByLabelText(/^Tensione \(kPa\)/), '20')
    await utente.click(await salva())
    expect(await screen.findByText('Passo 2 di 2')).toBeInTheDocument()
    expect(vi.mocked(salvaPeso).mock.calls[0][2].id).not.toBe('a0')
  })

  it('i passi non si ricalcolano dopo un salvataggio: il passo salvato resta pesato anche se i dati si aggiornano', async () => {
    const utente = apri()
    await salva()
    await utente.type(campoPeso(), '1,5')
    await utente.click(await salva())
    await screen.findByText('Replica B')
    await utente.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(campoPeso()).toHaveValue('1,5')
  })

  it('alla fine dice Pesata finita con Riepilogo e la fase successiva', async () => {
    dati(sessione({ impostazioni: unaRepliche }), campioni, [
      peso('x1', 'c12', 1, 'fresco', 1), peso('x2', 'c13', 1, 'fresco', 1),
    ])
    apri('fresco')
    expect(await screen.findByText('Pesata finita')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Riepilogo' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/S')
    expect(screen.getByRole('link', { name: 'Vai a Turgido' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/S/pesa/turgido')
  })

  it('l\'ultima fase non ha una fase successiva', async () => {
    dati(sessione({ tipo: 'aliquota', impostazioni: { ...IMPOSTAZIONI_PREDEFINITE } }), [campione('c1', 1, { nome: 'A' })], [peso('x', 'c1', 1, 'aliquota', 1)])
    apri('aliquota')
    expect(await screen.findByText('Pesata finita')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Vai a/ })).not.toBeInTheDocument()
  })

  it('una fase che non è della sessione dice Fase non trovata', async () => {
    apri('asciugatura')
    expect(await screen.findByText('Fase non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla sessione' })).toHaveAttribute('href', '/esperimenti/E/laboratorio/pesatura/S')
  })

  it('una fase sconosciuta dice Fase non trovata', async () => {
    apri('pippo')
    expect(await screen.findByText('Fase non trovata.')).toBeInTheDocument()
  })

  it('senza rete lo dice e il salvataggio è spento', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apri()
    expect(await screen.findByText('Sei senza rete: la Pesatura funziona solo online.')).toBeInTheDocument()
    expect(await salva()).toBeDisabled()
  })

  it('un lettore non può pesare', async () => {
    vi.mocked(ruoloIn).mockResolvedValue('lettore')
    apri()
    expect(await screen.findByText(/hai solo la lettura/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salva e vai al prossimo' })).not.toBeInTheDocument()
  })
})
