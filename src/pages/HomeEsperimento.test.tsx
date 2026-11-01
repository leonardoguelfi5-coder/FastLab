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
  return client
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

  it('senza valori da controllare non ha il numerino su Oggi, né la Mappa', async () => {
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
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

  it('l\'icona dello strumento non entra nel nome accessibile della striscia', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureSpad(34))
    vaiAllaPagina()
    await within(await aspettaLaHome()).findByText(/SPAD in corso · 34\/56/)
    expect(within(striscia()).getByText(strumento('SPAD').icona!)).toHaveAttribute('aria-hidden', 'true')
    expect(striscia()).toHaveAccessibleName(/^Nuova misura ?SPAD in corso · 34\/56$/)
  })

  it('dopo una prima lettura riuscita, una rilettura che fallisce lascia il progresso', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValueOnce(misureSpad(34)).mockRejectedValue(new TypeError('Failed to fetch'))
    const client = vaiAllaPagina()
    expect(await within(await aspettaLaHome()).findByText(/SPAD in corso · 34\/56/)).toBeInTheDocument()

    await act(async () => {
      await client.refetchQueries({ queryKey: ['misure'] })
      // React Query avvisa i componenti a un giro di timer: si aspetta che la pagina abbia visto l'errore.
      await new Promise(r => setTimeout(r, 20))
    })

    expect(misureDelGiorno).toHaveBeenCalledTimes(2)
    expect(striscia()).toHaveTextContent('SPAD in corso · 34/56')
  })

  it('senza uno strumento nello store la striscia non legge le misure della data di rilievo: resta solo la lettura di oggi per il numerino', async () => {
    useCampoStore.getState().setData('E', IERI)
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(misureDelGiorno).toHaveBeenCalledTimes(1)
    expect(misureDelGiorno).toHaveBeenCalledWith('E', OGGI)
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

describe('HomeEsperimento: il numerino su Oggi', () => {
  const oggi = () => screen.getByRole('link', { name: /^Oggi/ })

  /**
   * Gli SPAD di oggi per due trattamenti. Controllo (piante 1 a 7 misurate): 40, 41, 39, 40, 42, 38 e la pianta 7 con
   * 40, o con 80 se richiesta. Controllo + HC (piante 15 a 20): 20, 21, 19, 20, 22 e la pianta 20 con 20, o con 80 se
   * richiesta. Con l'80 la pianta è oltre 5 deviazioni standard e il 20% dalle altre; le altre non lo sono mai.
   */
  const conStonate = (...piante: number[]): Misura[] => {
    const id = config.parametri.find(p => p.catalogo_chiave === 'spad')!.id
    const s = strumento('SPAD').id
    const valori: [number, number][] = [
      [1, 40], [2, 41], [3, 39], [4, 40], [5, 42], [6, 38], [7, piante.includes(7) ? 80 : 40],
      [15, 20], [16, 21], [17, 19], [18, 20], [19, 22], [20, piante.includes(20) ? 80 : 20],
    ]
    return valori.map(([n, v]): Misura => ({
      id: `s${n}`, pianta_id: idPianta(n), strumento_id: s, data_rilievo: OGGI, ora: '09:00', valori: { [id]: [v] },
    }))
  }

  it('conta i valori di oggi da controllare e li dice a parole a chi non vede il numero', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(conStonate(7, 20))
    vaiAllaPagina()
    await aspettaLaHome()
    await vi.waitFor(() => expect(oggi()).toHaveAccessibleName('Oggi 2 valori da controllare'))
    // Il numero si vede, la frase solo a chi legge lo schermo.
    expect(within(oggi()).getByText('2')).toHaveAttribute('aria-hidden', 'true')
    expect(within(oggi()).getByText('2 valori da controllare')).toHaveClass('sr-only')
  })

  it('con un solo valore dice "1 valore da controllare"', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(conStonate(7))
    vaiAllaPagina()
    await aspettaLaHome()
    await vi.waitFor(() => expect(oggi()).toHaveAccessibleName('Oggi 1 valore da controllare'))
  })

  it('è un segno in attenzione velato, con il numero: mai solo colore', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(conStonate(7))
    vaiAllaPagina()
    await aspettaLaHome()
    const numero = await within(oggi()).findByText('1')
    expect(numero).toHaveClass('bg-attenzione-velato')
    expect(numero).toHaveClass('text-attenzione')
    expect(numero).toHaveClass('font-mono')
  })

  it('il link porta ancora a Oggi', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(conStonate(7))
    vaiAllaPagina()
    await aspettaLaHome()
    await within(oggi()).findByText('1')
    expect(oggi()).toHaveAttribute('href', '/esperimenti/E/oggi')
  })

  it('legge le misure di oggi, non della data di rilievo', async () => {
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_e, data) => (data === OGGI ? conStonate(7) : []))
    vaiAllaPagina()
    await aspettaLaHome()
    await within(oggi()).findByText('1')
    expect(misureDelGiorno).toHaveBeenCalledWith('E', OGGI)
  })

  it('con le misure di un altro giorno non conta nulla', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(conStonate(7).map(m => ({ ...m, data_rilievo: IERI })))
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(oggi()).toHaveTextContent(/^📅Oggi$/)
  })

  it('mentre le misure caricano non mostra il numerino', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    await aspettaLaHome()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(oggi()).toHaveTextContent(/^📅Oggi$/)
  })

  it('se la lettura fallisce non mostra il numerino e la home non allarma', async () => {
    vi.mocked(misureDelGiorno).mockRejectedValue(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    await aspettaLaHome()
    await misureLette()
    expect(oggi()).toHaveTextContent(/^📅Oggi$/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('con uno strumento a metà giro oggi la striscia e il numerino usano la stessa lettura', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(conStonate(7))
    vaiAllaPagina()
    await aspettaLaHome()
    await within(oggi()).findByText('1')
    expect(misureDelGiorno).toHaveBeenCalledTimes(1)
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
