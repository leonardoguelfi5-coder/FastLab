import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
import { misureDelGiorno, ultimaMisuraPerStrumento } from '@/api/misure'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura } from '@/domain/tipi'
import { ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { useCampoStore } from '@/store/campo'
import { SceltaStrumento } from './SceltaStrumento'

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
const pianta = (n: number) => config.piante.find(p => p.etichetta === String(n))!
const idPianta = (n: number) => pianta(n).id

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

const misureDi = (nomeStrumento: string, quante: number, extra: Partial<Misura> = {}): Misura[] =>
  Array.from({ length: quante }, (_, i) => misuraCompleta(i + 1, nomeStrumento, extra))

function Posizione() {
  const { pathname, search } = useLocation()
  return <p data-testid="posizione">{pathname + search}</p>
}

function vaiAllaPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/misura']}>
        <Routes>
          <Route path="/esperimenti/:espId/misura" element={<SceltaStrumento />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** La riga di uno strumento nell'elenco (il pulsante che lo sceglie), e il suo testo secondario. */
const riga = (nome: string) => screen.getByRole('button', { name: nome })
const aspettaElenco = () => screen.findByRole('list', { name: 'Strumenti' })
/** Aspetta che le due letture siano partite e finite, così un "niente da mostrare" non è solo "non ancora". */
async function lettureFinite() {
  await vi.waitFor(() => {
    expect(misureDelGiorno).toHaveBeenCalled()
    expect(ultimaMisuraPerStrumento).toHaveBeenCalled()
  })
  await act(async () => { await new Promise(r => setTimeout(r, 20)) })
}

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
  vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SceltaStrumento: intestazione', () => {
  it('ha il titolo "Nuova misura" e la freccia indietro alla home dell\'esperimento', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuova misura' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })
})

describe('SceltaStrumento: l\'elenco', () => {
  it('mostra gli strumenti non archiviati, tabella fenologica compresa, nell\'ordine dello strumento', async () => {
    vaiAllaPagina()
    const elenco = await aspettaElenco()
    const nomi = within(elenco).getAllByRole('button').map(b => b.textContent)
    expect(nomi).toHaveLength(4)
    expect(nomi[0]).toContain('Termometro')
    expect(nomi[1]).toContain('SPAD')
    expect(nomi[2]).toContain('Metro')
    expect(nomi[3]).toContain('Tabella fenologica')
  })

  it('ogni riga ha l\'icona (decorativa) e il nome', async () => {
    vaiAllaPagina()
    await aspettaElenco()
    const spad = riga('SPAD')
    expect(spad).toHaveTextContent(strumento('SPAD').icona!)
    expect(within(spad).getByText(strumento('SPAD').icona!)).toHaveAttribute('aria-hidden', 'true')
  })

  it('uno strumento archiviato non c\'è', async () => {
    strumento('SPAD').archiviato = true
    vaiAllaPagina()
    await aspettaElenco()
    expect(screen.queryByRole('button', { name: /SPAD/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Termometro|Metro|Tabella fenologica/ })).toHaveLength(3)
  })

  it('senza strumenti attivi dice che non ce ne sono e rimanda alle Impostazioni', async () => {
    for (const s of config.strumenti) s.archiviato = true
    vaiAllaPagina()
    expect(await screen.findByText(/non ha strumenti attivi/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Impostazioni/ })).toHaveAttribute('href', '/esperimenti/E/impostazioni')
    expect(screen.queryByRole('list', { name: 'Strumenti' })).not.toBeInTheDocument()
  })
})

describe('SceltaStrumento: la riga secondaria', () => {
  it('dice "34/56 oggi" per un giro iniziato', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('SPAD')).findByText('34/56 oggi')).toBeInTheDocument()
  })

  it('dice "fatto ✓" per un giro completo', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 56))
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('SPAD')).findByText('fatto ✓')).toBeInTheDocument()
  })

  it('dice "ultima volta 21/10" per uno strumento non toccato oggi ma misurato in passato', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([[strumento('SPAD').id, '2026-10-21']]))
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('SPAD')).findByText('ultima volta 21/10')).toBeInTheDocument()
  })

  it('dice "mai misurato" per uno strumento senza misure', async () => {
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('Metro')).findByText('mai misurato')).toBeInTheDocument()
  })

  it('una pianta misurata a metà fa iniziare il giro: "0/56 oggi"', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([misuraParziale(1, 'Termometro')])
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('Termometro')).findByText('0/56 oggi')).toBeInTheDocument()
  })

  it('con le misure di oggi, "oggi" vince su "ultima volta" (che coincide con oggi)', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vi.mocked(ultimaMisuraPerStrumento).mockResolvedValue(new Map([[strumento('SPAD').id, OGGI]]))
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('SPAD')).findByText('34/56 oggi')).toBeInTheDocument()
    expect(screen.queryByText(/ultima volta/)).not.toBeInTheDocument()
  })

  it('con una data di rilievo diversa da oggi dice "10/56 il 27/10" e mostra il banner', async () => {
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_e, data) => (data === IERI ? misureDi('SPAD', 10, { data_rilievo: IERI }) : []))
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('SPAD')).findByText('10/56 il 27/10')).toBeInTheDocument()
    expect(screen.queryByText(/^\d+\/\d+ oggi$/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Stai registrando con data 27/10/2026, non oggi.')
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
  })

  it('mentre le letture caricano non mostra nessun dato', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vi.mocked(ultimaMisuraPerStrumento).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    await aspettaElenco()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(screen.queryByText(/oggi|ultima volta|mai misurato|fatto/)).not.toBeInTheDocument()
    expect(riga('SPAD')).toHaveTextContent(/^\S+ ?SPAD…$/)
  })

  it('mentre arrivano solo le ultime date, non dice "mai misurato" per uno strumento che ha misure di oggi da leggere', async () => {
    vi.mocked(ultimaMisuraPerStrumento).mockReturnValue(new Promise(() => {}))
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaElenco()
    expect(await within(riga('SPAD')).findByText('34/56 oggi')).toBeInTheDocument()
    expect(screen.queryByText('mai misurato')).not.toBeInTheDocument()
  })

  it('se le misure di oggi non arrivano la riga resta senza dati e la pagina si usa lo stesso', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockRejectedValue(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    await aspettaElenco()
    await lettureFinite()
    expect(screen.queryByText(/oggi|ultima volta|mai misurato|fatto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(1)}`)
  })

  it('se le ultime date non arrivano la pagina si usa lo stesso: restano i progressi di oggi, senza "mai misurato"', async () => {
    const utente = userEvent.setup()
    vi.mocked(ultimaMisuraPerStrumento).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaElenco()
    await lettureFinite()
    expect(within(riga('SPAD')).getByText('34/56 oggi')).toBeInTheDocument()
    expect(screen.queryByText(/ultima volta|mai misurato/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await utente.click(riga('Metro'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('Metro').id}/${idPianta(1)}`)
  })
})

describe('SceltaStrumento: lo strumento in corso', () => {
  it('sta in cima con "Riprendi dalla pianta 35", gli altri nel loro ordine', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    expect(await screen.findByRole('button', { name: 'Riprendi dalla pianta 35' })).toBeInTheDocument()
    const nomi = within(screen.getByRole('list', { name: 'Strumenti' })).getAllByRole('button')
      .map(b => b.textContent ?? '').filter(t => !t.startsWith('Riprendi'))
    expect(nomi[0]).toContain('SPAD')
    expect(nomi[1]).toContain('Termometro')
    expect(nomi[2]).toContain('Metro')
    expect(nomi[3]).toContain('Tabella fenologica')
    // L'azione sta nella riga dello strumento in corso, subito dopo di lui.
    const primo = screen.getAllByRole('listitem')[0]
    expect(within(primo).getByRole('button', { name: 'Riprendi dalla pianta 35' })).toBeInTheDocument()
  })

  it('"Riprendi" porta alla prima pianta non fatta, saltando le fatte e riprendendo le incomplete', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setStrumento('E', strumento('Termometro').id)
    // Pianta 1 fatta, pianta 2 incompleta: si riprende dalla 2.
    vi.mocked(misureDelGiorno).mockResolvedValue([misuraCompleta(1, 'Termometro'), misuraParziale(2, 'Termometro')])
    vaiAllaPagina()
    await utente.click(await screen.findByRole('button', { name: 'Riprendi dalla pianta 2' }))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('Termometro').id}/${idPianta(2)}`)
  })

  it('senza giro iniziato non sta in cima e non ha "Riprendi"', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vaiAllaPagina()
    await aspettaElenco()
    await lettureFinite()
    expect(screen.queryByRole('button', { name: /^Riprendi/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Strumenti' })).getAllByRole('button')[0]).toHaveTextContent('Termometro')
  })

  it('con il giro completo non sta in cima e non ha "Riprendi"', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 56))
    vaiAllaPagina()
    await aspettaElenco()
    await lettureFinite()
    expect(screen.queryByRole('button', { name: /^Riprendi/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Strumenti' })).getAllByRole('button')[0]).toHaveTextContent('Termometro')
  })

  it('uno strumento dello store archiviato o cancellato non sta in cima', async () => {
    strumento('SPAD').archiviato = true
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await aspettaElenco()
    await lettureFinite()
    expect(screen.queryByRole('button', { name: /^Riprendi/ })).not.toBeInTheDocument()

    useCampoStore.getState().setStrumento('E', 'cancellato')
    expect(screen.queryByRole('button', { name: /^Riprendi/ })).not.toBeInTheDocument()
  })

  it('mentre le misure caricano nessuno sta in cima e non si calcola nessun progresso', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    await aspettaElenco()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /^Riprendi/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Strumenti' })).getAllByRole('button')[0]).toHaveTextContent('Termometro')
    expect(screen.queryByText('fatto ✓')).not.toBeInTheDocument()
  })
})

describe('SceltaStrumento: la scelta', () => {
  it('un tocco su SPAD lo salva nello store e porta alla prima pianta', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaElenco()
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(1)}`)
    expect(useCampoStore.getState().dati('E', OGGI).strumentoId).toBe(strumento('SPAD').id)
  })

  it('con un giro iniziato porta alla prima pianta da fare', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 34))
    vaiAllaPagina()
    await within(await aspettaElenco()).findByText('34/56 oggi')
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/${idPianta(35)}`)
  })

  it('con le piante da fare in ordine di giro, non di inserimento', async () => {
    const utente = userEvent.setup()
    // La pianta 1 passa in fondo: la prima da fare è la 2.
    pianta(1).ordine = 99
    vaiAllaPagina()
    await aspettaElenco()
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/${strumento('SPAD').id}/${idPianta(2)}`)
  })

  it('uno strumento senza piante da fare porta alla fine del giro', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockResolvedValue(misureDi('SPAD', 56))
    vaiAllaPagina()
    await within(await aspettaElenco()).findByText('fatto ✓')
    await utente.click(riga('SPAD'))
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/misura/${strumento('SPAD').id}/fine`)
    expect(useCampoStore.getState().dati('E', OGGI).strumentoId).toBe(strumento('SPAD').id)
  })

  it('scegliere un altro strumento cambia quello dello store', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vaiAllaPagina()
    await aspettaElenco()
    await utente.click(riga('Metro'))
    expect(useCampoStore.getState().dati('E', OGGI).strumentoId).toBe(strumento('Metro').id)
  })
})

describe('SceltaStrumento: la data di rilievo', () => {
  it('mostra la data di oggi e, cambiandola, la salva nello store e rilegge le misure di quel giorno', async () => {
    vaiAllaPagina()
    await aspettaElenco()
    const campo = screen.getByLabelText('Data di rilievo')
    expect(campo).toHaveValue(OGGI)
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()

    fireEvent.change(campo, { target: { value: IERI } })
    expect(useCampoStore.getState().dati('E', OGGI).dataRilievo).toBe(IERI)
    expect(await screen.findByText(/Stai registrando con data 27\/10\/2026, non oggi/)).toBeInTheDocument()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI))
  })

  it('"Usa oggi" nel banner riporta a oggi', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setData('E', IERI)
    vaiAllaPagina()
    await aspettaElenco()
    await utente.click(screen.getByRole('button', { name: 'Usa oggi' }))
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
  })

  it('svuotare il selettore non cambia la data', async () => {
    vaiAllaPagina()
    await aspettaElenco()
    fireEvent.change(screen.getByLabelText('Data di rilievo'), { target: { value: '' } })
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)
  })

  it('una data scelta resta anche riaprendo la pagina', async () => {
    useCampoStore.getState().setData('E', IERI)
    vaiAllaPagina()
    await aspettaElenco()
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(IERI)
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI))
  })

  it('se la pagina resta aperta oltre la mezzanotte la data segue il nuovo giorno (finché non ne è stata scelta un\'altra)', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59))
    vaiAllaPagina()
    await aspettaElenco()
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)

    vi.setSystemTime(new Date(2026, 9, 29, 0, 1)) // l'app riprende dallo sfondo
    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(screen.getByLabelText('Data di rilievo')).toHaveValue('2026-10-29')
    await vi.waitFor(() => expect(misureDelGiorno).toHaveBeenCalledWith('E', '2026-10-29'))
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
  })

  it('una data scelta resta anche dopo la mezzanotte e il banner continua a segnalarla', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59))
    useCampoStore.getState().setData('E', IERI)
    vaiAllaPagina()
    await aspettaElenco()

    vi.setSystemTime(new Date(2026, 9, 29, 0, 1))
    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(IERI)
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
  })
})

describe('SceltaStrumento: caricamento ed errori', () => {
  it('mentre la configurazione carica mostra "Caricamento…" e non legge le misure', () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByRole('list', { name: 'Strumenti' })).not.toBeInTheDocument()
  })

  it('se la configurazione non arriva lo dice e permette di riprovare', async () => {
    const utente = userEvent.setup()
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Il server non risponde')
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    expect(await aspettaElenco()).toBeInTheDocument()
  })

  it('un esperimento che non c\'è lo dice', async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error(ESPERIMENTO_NON_TROVATO))
    vaiAllaPagina()
    expect(await screen.findByRole('alert')).toHaveTextContent('Esperimento non trovato')
  })
})
