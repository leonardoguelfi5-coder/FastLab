import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache: si finge solo il livello API (e il client Supabase, mai raggiunto).
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/api/auth', () => ({
  accedi: vi.fn(), registrati: vi.fn(), esci: vi.fn(), useSessione: vi.fn(),
}))
vi.mock('@/api/inviti', () => ({
  sonoAdmin: vi.fn(), listaInviti: vi.fn(), creaInvito: vi.fn(), revocaInvito: vi.fn(),
}))
vi.mock('@/api/esperimenti', () => ({
  listaEsperimenti: vi.fn(), caricaConfig: vi.fn(), creaEsperimento: vi.fn(), aggiornaEsperimento: vi.fn(),
}))
vi.mock('@/api/misure', () => ({
  misureDelGiorno: vi.fn(), misurePianta: vi.fn(), caricaMisura: vi.fn(), salvaMisura: vi.fn(), eliminaMisura: vi.fn(),
  ultimaMisuraPerStrumento: vi.fn(),
}))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureDelGiorno } from '@/api/misure'
import { strumentoDaCatalogo } from '@/domain/catalogo'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura, ValoriMisura } from '@/domain/tipi'
import { useCampoStore } from '@/store/campo'
import { FineGiro } from './FineGiro'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'

let config: ConfigEsperimento

const idStrumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!.id
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const idPar = (nome: string) => config.parametri.find(p => p.nome === nome)!.id

let contatore = 0
function misura(etichetta: string, strumento: string, valori: ValoriMisura, extra: Partial<Misura> = {}): Misura {
  contatore += 1
  return {
    id: `m${contatore}`, pianta_id: idPianta(etichetta), strumento_id: idStrumento(strumento),
    data_rilievo: OGGI, ora: '09:12', valori, ...extra,
  }
}

/** Lo SPAD su tutte le piante tranne quelle indicate. */
const spadTranne = (...mancanti: string[]) =>
  config.piante.filter(p => !mancanti.includes(p.etichetta)).map(p => misura(p.etichetta, 'SPAD', { [idPar('SPAD')]: [40] }))

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

function vaiAllaPagina(strumentoId = idStrumento('SPAD')) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/esperimenti/E/misura/${strumentoId}/fine`]}>
        <Routes>
          <Route path="/esperimenti/:espId/misura/:strumentoId/fine" element={<FineGiro />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const posizione = () => screen.getByTestId('posizione').textContent
const titolo = (nome: string) => screen.findByRole('heading', { level: 2, name: nome })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misureDelGiorno).mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FineGiro', () => {
  it('ha il titolo "Fine giro" e la freccia verso la scelta dello strumento', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Fine giro' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/misura')
  })

  it('riepiloga "💚 SPAD: 54/56", con i numeri in Geist Mono, e dice quali mancano', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    vaiAllaPagina()
    const intestazione = await titolo('SPAD: 54/56')
    expect(intestazione).toHaveTextContent('💚 SPAD: 54/56')
    expect(within(intestazione).getByText('54/56')).toHaveClass('font-mono')
    expect(screen.getByText('Mancano 12, 33')).toBeInTheDocument()
    const elenco = screen.getByRole('list', { name: 'Piante mancanti' })
    expect(within(elenco).getAllByRole('link').map(l => l.textContent)).toEqual(['12', '33'])
    expect(within(elenco).getByRole('link', { name: '33' })).toHaveAttribute('href', `/esperimenti/E/misura/${idStrumento('SPAD')}/${idPianta('33')}`)
  })

  it('una pianta incompleta (Ciras con solo A e gs) è tra le mancanti, segnata "incompleta"', async () => {
    const ciras = strumentoDaCatalogo(SEMI_CATALOGO.find(v => v.nome === 'Ciras')!, config.strumenti.length)
    config.strumenti.push(ciras.strumento)
    config.parametri.push(...ciras.parametri)
    const tutti = Object.fromEntries(['A', 'gs', 'E', 'Ci'].map(n => [idPar(n), [1]]))
    vi.mocked(misureDelGiorno).mockImplementation(async () => [
      ...config.piante.filter(p => p.etichetta !== '33' && p.etichetta !== '40').map(p => misura(p.etichetta, 'Ciras', tutti)),
      misura('33', 'Ciras', { [idPar('A')]: [12.3], [idPar('gs')]: [0.21] }),
    ])
    const utente = userEvent.setup()
    vaiAllaPagina(idStrumento('Ciras'))

    expect(await titolo('Ciras: 54/56')).toBeInTheDocument()
    expect(screen.getByText('Mancano 33, 40')).toBeInTheDocument()
    const elenco = screen.getByRole('list', { name: 'Piante mancanti' })
    expect(within(elenco).getByRole('link', { name: '33 incompleta' })).toBeInTheDocument()
    expect(within(elenco).getByRole('link', { name: '40' })).toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Vai alle mancanti' }))
    expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('Ciras')}/${idPianta('33')}`)
  })

  it('"Vai alle mancanti" porta alla prima mancante; "Scegli un altro strumento" alla scelta', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    await titolo('SPAD: 54/56')
    expect(screen.getByRole('button', { name: 'Scegli un altro strumento' })).toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Vai alle mancanti' }))
    expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/${idPianta('12')}`)
  })

  it('con il giro completo lo dice, senza "Vai alle mancanti"', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne())
    const utente = userEvent.setup()
    vaiAllaPagina()
    expect(await titolo('SPAD: 56/56')).toBeInTheDocument()
    expect(screen.getByText('Giro completo: tutte le piante sono misurate.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vai alle mancanti' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Mancano/)).not.toBeInTheDocument()
    await utente.click(screen.getByRole('button', { name: 'Scegli un altro strumento' }))
    expect(posizione()).toBe('/esperimenti/E/misura')
  })

  it('con la data di rilievo di ieri riepiloga ieri e mostra l\'avviso', async () => {
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_esp, data) => (data === IERI ? spadTranne('5') : []))
    vaiAllaPagina()
    expect(await titolo('SPAD: 55/56')).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
  })

  it('mentre le misure arrivano non inventa un riepilogo', () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByText(/^Mancano/)).not.toBeInTheDocument()
  })

  it('se le misure non arrivano lo dice, con "Riprova"', async () => {
    vi.mocked(misureDelGiorno).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await titolo('SPAD: 0/56')).toBeInTheDocument()
  })

  it('uno strumento archiviato o inesistente lo dice e riporta alla scelta', async () => {
    config.strumenti.find(s => s.nome === 'SPAD')!.archiviato = true
    vaiAllaPagina()
    expect(await screen.findByText('Lo strumento «SPAD» è archiviato: non si misura più.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scegli un altro strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.queryByRole('button', { name: 'Vai alle mancanti' })).not.toBeInTheDocument()
  })

  it('uno strumento che non c\'è lo dice', async () => {
    vaiAllaPagina('cancellato')
    expect(await screen.findByText('Questo strumento non esiste in questo esperimento.')).toBeInTheDocument()
  })
})
