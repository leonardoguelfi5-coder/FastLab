import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
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
}))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureDelGiorno } from '@/api/misure'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura } from '@/domain/tipi'
import { ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { useCampoStore } from '@/store/campo'
import { HomeEsperimento } from './HomeEsperimento'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'

/** L'esperimento di prova ("E"): il modello Hydrochar, 56 piante in 8 trattamenti e quattro strumenti. */
function esperimento(): ConfigEsperimento {
  const config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  return config
}

let config: ConfigEsperimento

const strumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!
const idPianta = (n: number) => config.piante.find(p => p.etichetta === String(n))!.id

/** Una misura che compila tutti i parametri dello strumento: la pianta risulta "fatta". */
function misuraCompleta(n: number, nomeStrumento: string, extra: Partial<Misura> = {}): Misura {
  const s = strumento(nomeStrumento)
  const valori: Misura['valori'] = {}
  for (const sp of s.parametri) {
    const p = config.parametri.find(x => x.id === sp.parametro_id)!
    valori[p.id] = Array.from({ length: p.n_letture }, () => 40)
  }
  return {
    id: `m${n}-${nomeStrumento}`, pianta_id: idPianta(n), strumento_id: s.id,
    data_rilievo: OGGI, ora: '09:12', valori, ...extra,
  }
}

/** Una misura con un solo valore su due o più parametri: la pianta è "incompleta". */
function misuraParziale(n: number, nomeStrumento: string): Misura {
  const completa = misuraCompleta(n, nomeStrumento, { id: `p${n}` })
  const primo = Object.keys(completa.valori)[0]
  return { ...completa, valori: { [primo]: completa.valori[primo] } }
}

function misureSpad(quante: number): Misura[] {
  return Array.from({ length: quante }, (_, i) => misuraCompleta(i + 1, 'SPAD'))
}

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E']}>
        <Routes>
          <Route path="/esperimenti/:espId" element={<HomeEsperimento />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const striscia = () => screen.getByRole('link', { name: /^Nuova misura/ })
/** Aspetta che la lettura delle misure sia partita e finita, così un "niente da mostrare" non è solo "non ancora". */
async function misureLette() {
  await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
  await act(async () => { await new Promise(r => setTimeout(r, 20)) })
}
const aspettaLaHome = () => screen.findByRole('link', { name: /^Nuova misura/ })

beforeEach(() => {
  vi.clearAllMocks()
  // Solo `Date`: i timer veri servono a React Query e a userEvent. 28 ottobre 2026, ore 10:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = esperimento()
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockResolvedValue(config)
  vi.mocked(misureDelGiorno).mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HomeEsperimento: intestazione e riepilogo', () => {
  it('ha il nome dell\'esperimento come titolo e la freccia indietro all\'elenco', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Hydrochar × Cuore di Bue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
  })

  it('riassume piante, trattamenti e stato', async () => {
    vaiAllaPagina()
    expect(await screen.findByText('56 piante · 8 trattamenti · in corso')).toBeInTheDocument()
  })

  it('dice "concluso" per un esperimento concluso', async () => {
    config.esperimento.stato = 'concluso'
    vaiAllaPagina()
    expect(await screen.findByText('56 piante · 8 trattamenti · concluso')).toBeInTheDocument()
  })

  it('accorda il singolare: 1 pianta, 1 trattamento', async () => {
    config.piante = config.piante.slice(0, 1)
    config.trattamenti = config.trattamenti.slice(0, 1)
    vaiAllaPagina()
    expect(await screen.findByText('1 pianta · 1 trattamento · in corso')).toBeInTheDocument()
  })
})

describe('HomeEsperimento: le sezioni', () => {
  it('ha le sette voci con il loro testo e il loro link', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    const voci: [string, string][] = [
      ['Oggi', '/esperimenti/E/oggi'],
      ['Piante', '/esperimenti/E/piante'],
      ['Dataset', '/esperimenti/E/dataset'],
      ['Esporta Excel', '/esperimenti/E/esporta'],
      ['Diario', '/esperimenti/E/diario'],
      ['Foto', '/esperimenti/E/foto'],
      ['Impostazioni', '/esperimenti/E/impostazioni'],
    ]
    for (const [nome, href] of voci) {
      expect(screen.getByRole('link', { name: nome })).toHaveAttribute('href', href)
    }
  })

  it('mostra le icone di ogni voce senza leggerle come testo', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    for (const [nome, icona] of [['Oggi', '📅'], ['Piante', '🌿'], ['Dataset', '📊'], ['Esporta Excel', '⬇️'], ['Diario', '📒'], ['Foto', '📷'], ['Impostazioni', '⚙️']]) {
      const voce = screen.getByRole('link', { name: nome })
      expect(voce).toHaveTextContent(icona)
      expect(within(voce).getByText(icona)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('Impostazioni sta in fondo, a tutta larghezza, dopo le altre voci', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    const voci = screen.getAllByRole('link').filter(l => l.getAttribute('href')?.startsWith('/esperimenti/E/'))
    expect(voci.map(l => l.getAttribute('href')).at(-1)).toBe('/esperimenti/E/impostazioni')
    expect(screen.getByRole('link', { name: 'Impostazioni' }).className).toContain('col-span-2')
  })

  it('non ha il numerino su Oggi, né la Mappa', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    expect(screen.getByRole('link', { name: 'Oggi' })).toHaveTextContent(/^📅Oggi$/)
    expect(screen.queryByRole('link', { name: /Mappa/ })).not.toBeInTheDocument()
  })

  it('un tocco su una voce porta alla sua pagina', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaLaHome()
    await utente.click(screen.getByRole('link', { name: 'Dataset' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent('/esperimenti/E/dataset')
  })
})

describe('HomeEsperimento: la striscia Nuova misura', () => {
  it('è un link a /misura', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    expect(striscia()).toHaveAttribute('href', '/esperimenti/E/misura')
  })

  it('senza uno strumento scelto ha solo il titolo', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    expect(striscia()).toHaveAccessibleName('Nuova misura')
    expect(screen.queryByText(/in corso ·/)).not.toBeInTheDocument()
  })

  it('con uno strumento a metà giro dice "SPAD in corso · 34/56"', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureSpad(34))
    vaiAllaPagina()
    expect(await within(await aspettaLaHome()).findByText(/SPAD in corso · 34\/56/)).toBeInTheDocument()
    expect(striscia()).toHaveTextContent(`${strumento('SPAD').icona} SPAD in corso · 34/56`)
    expect(misureDelGiorno).toHaveBeenCalledWith('E', OGGI)
  })

  it('senza uno strumento nello store non legge nemmeno le misure del giorno', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(misureDelGiorno).not.toHaveBeenCalled()
    expect(striscia()).toHaveAccessibleName('Nuova misura')
  })

  it('legge le misure della data di rilievo scelta, non di oggi', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_e, data) => (data === IERI ? misureSpad(10).map(m => ({ ...m, data_rilievo: IERI })) : []))
    vaiAllaPagina()
    expect(await within(await aspettaLaHome()).findByText(/SPAD in corso · 10\/56/)).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
  })

  it('una pianta misurata a metà basta a dire "in corso" (0 fatte)', async () => {
    // Il Termometro ha due parametri: con uno solo la pianta è "incompleta", non fatta, ma il giro è cominciato.
    useCampoStore.getState().setStrumento('E', strumento('Termometro').id)
    vi.mocked(misureDelGiorno).mockResolvedValue([misuraParziale(1, 'Termometro')])
    vaiAllaPagina()
    expect(await within(await aspettaLaHome()).findByText(/Termometro in corso · 0\/56/)).toBeInTheDocument()
  })

  it('senza nessuna pianta toccata ha solo il titolo', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vaiAllaPagina()
    await aspettaLaHome()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(striscia()).toHaveAccessibleName('Nuova misura')
  })

  it('con il giro finito (56/56) ha solo il titolo', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureSpad(56))
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(striscia()).toHaveAccessibleName('Nuova misura')
  })

  it('con uno strumento archiviato ha solo il titolo', async () => {
    strumento('SPAD').archiviato = true
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureSpad(34))
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(striscia()).toHaveAccessibleName('Nuova misura')
  })

  it('con uno strumento che non esiste più ha solo il titolo', async () => {
    useCampoStore.getState().setStrumento('E', 'cancellato')
    vi.mocked(misureDelGiorno).mockResolvedValue(misureSpad(34))
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(striscia()).toHaveAccessibleName('Nuova misura')
  })

  it('mentre le misure caricano ha solo il titolo: nessun progresso calcolato', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    await aspettaLaHome()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(striscia()).toHaveAccessibleName('Nuova misura')
    expect(screen.queryByText(/in corso ·/)).not.toBeInTheDocument()
  })

  it('se la lettura delle misure fallisce ha solo il titolo e nessun errore in home', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockRejectedValue(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(striscia()).toHaveAccessibleName('Nuova misura')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('HomeEsperimento: caricamento ed errori', () => {
  it('mentre carica mostra "Caricamento…" e non le voci', () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByRole('link', { name: /^Nuova misura/ })).not.toBeInTheDocument()
    expect(misureDelGiorno).not.toHaveBeenCalledWith('E', OGGI)
  })

  it('se la configurazione non arriva lo dice e permette di riprovare', async () => {
    const utente = userEvent.setup()
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Il server non risponde')
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await aspettaLaHome()).toBeInTheDocument()
  })

  it('un esperimento che non c\'è lo dice e porta all\'elenco', async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error(ESPERIMENTO_NON_TROVATO))
    vaiAllaPagina()
    expect(await screen.findByRole('alert')).toHaveTextContent('Esperimento non trovato')
    expect(screen.getByRole('link', { name: 'I miei esperimenti' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: /^Nuova misura/ })).not.toBeInTheDocument()
  })
})
