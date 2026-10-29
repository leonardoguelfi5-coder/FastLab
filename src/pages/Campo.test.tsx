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
}))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureDelGiorno } from '@/api/misure'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { piante as creaPiante } from '@/domain/test-helpers'
import type { ConfigEsperimento, Misura, Pianta } from '@/domain/tipi'
import { useCampoStore } from '@/store/campo'
import { Campo } from './Campo'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'

/** L'esperimento di prova ("E"): il modello Hydrochar, 56 piante numerate da 1 a 56 e quattro passate. */
function esperimento(): ConfigEsperimento {
  const config = bozzaHydrochar()
  config.esperimento.id = 'E'
  return config
}

let config: ConfigEsperimento

const idPassata = (nome: string) => config.passate.find(p => p.nome === nome)!.id
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id

let contatore = 0
function misura(etichetta: string, passata: string, extra: Partial<Misura> = {}): Misura {
  contatore += 1
  return {
    id: `m${contatore}`, pianta_id: idPianta(etichetta), passata_id: idPassata(passata),
    data_rilievo: OGGI, ora: '09:12', valori: {}, ...extra,
  }
}

/** Mostra dove si è finiti dopo un tocco (percorso e parametri). */
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
          <Route path="/esperimenti/:espId" element={<Campo />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Apre la pagina con la passata già scelta, come per chi l'aveva scelta in precedenza. */
async function paginaConPassata(nome: string) {
  useCampoStore.getState().setPassata('E', idPassata(nome))
  vaiAllaPagina()
  await screen.findByRole('radio', { name: nome })
}

/** Aspetta che le misure del giorno siano arrivate (il conteggio compare solo allora). */
const misureArrivate = () => screen.findByText(/^Fatte \d+\/\d+ · /)

const posizione = () => screen.getByTestId('posizione').textContent
const campoPianta = () => screen.getByLabelText('N° pianta') as HTMLInputElement
const apriScheda = () => screen.getByRole('button', { name: 'Apri scheda pianta' })
const griglia = () => screen.getByRole('list', { name: 'Piante' })
const cella = (nome: string) => within(griglia()).getByRole('link', { name: nome })

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

describe('Campo: intestazione', () => {
  it('ha il nome dell\'esperimento come titolo, la freccia indietro e le impostazioni', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Hydrochar × Cuore di Bue' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Impostazioni' })).toHaveAttribute('href', '/esperimenti/E/impostazioni')
  })
})

describe('Campo: caricamento ed errori', () => {
  it('mentre carica mostra "Caricamento…" e non il campo della pianta', () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByLabelText('N° pianta')).not.toBeInTheDocument()
  })

  it('se la configurazione non si carica spiega cosa è successo e "Riprova" ci riprova', async () => {
    const utente = userEvent.setup()
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()

    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.queryByLabelText('N° pianta')).not.toBeInTheDocument()

    await utente.click(screen.getByRole('button', { name: 'Riprova' }))

    expect(await screen.findByLabelText('N° pianta')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(caricaConfig).toHaveBeenCalledTimes(2)
  })
})

describe('Campo: scelta della passata', () => {
  it('mostra una scelta per passata e all\'inizio nessuna è scelta', async () => {
    vaiAllaPagina()
    const gruppo = await screen.findByRole('radiogroup', { name: 'Passata' })
    expect(within(gruppo).getAllByRole('radio')).toHaveLength(4)
    for (const nome of ['Termometro', 'SPAD', 'Altezza', 'Fenologici']) {
      expect(within(gruppo).getByRole('radio', { name: nome })).not.toBeChecked()
    }
  })

  it('le passate seguono il loro ordine anche se arrivano in disordine', async () => {
    config.passate = [...config.passate].reverse()
    vi.mocked(caricaConfig).mockResolvedValue(config)
    vaiAllaPagina()
    const gruppo = await screen.findByRole('radiogroup', { name: 'Passata' })
    const nomi = within(gruppo).getAllByRole('radio').map(r => (r as HTMLInputElement).labels?.[0].textContent ?? '')
    expect(nomi.map(n => ['Termometro', 'SPAD', 'Altezza', 'Fenologici'].findIndex(x => n.includes(x)))).toEqual([0, 1, 2, 3])
  })

  it('toccare una passata la sceglie, la salva e ne resta una sola', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await utente.click(await screen.findByRole('radio', { name: 'SPAD' }))

    expect(screen.getByRole('radio', { name: 'SPAD' })).toBeChecked()
    expect(useCampoStore.getState().dati('E').passataId).toBe(idPassata('SPAD'))
    expect(JSON.parse(localStorage.getItem('fastlab-campo')!).state.stato.E.passataId).toBe(idPassata('SPAD'))

    await utente.click(screen.getByRole('radio', { name: 'Altezza' }))

    expect(screen.getByRole('radio', { name: 'Altezza' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'SPAD' })).not.toBeChecked()
    expect(useCampoStore.getState().dati('E').passataId).toBe(idPassata('Altezza'))
  })

  it('la passata scelta in precedenza è già selezionata all\'apertura', async () => {
    await paginaConPassata('Fenologici')
    expect(screen.getByRole('radio', { name: 'Fenologici' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Termometro' })).not.toBeChecked()
  })

  it('la scelta selezionata è segnata anche con un ✓, non solo dal colore', async () => {
    await paginaConPassata('Termometro')
    const scelta = screen.getByRole('radio', { name: 'Termometro' }).closest('label') as HTMLElement
    expect(scelta.querySelector('svg')).not.toBeNull()
    const altra = screen.getByRole('radio', { name: 'SPAD' }).closest('label') as HTMLElement
    expect(altra.querySelector('svg')).toBeNull()
  })

  it('una passata salvata che non esiste più è come nessuna scelta', async () => {
    useCampoStore.getState().setPassata('E', 'passata-cancellata')
    vaiAllaPagina()
    await screen.findByLabelText('N° pianta')
    expect(campoPianta()).toBeDisabled()
    expect(screen.getByText('Scegli una passata')).toBeInTheDocument()
  })

  it('un esperimento senza passate lo dice e rimanda alle impostazioni', async () => {
    config.passate = []
    vi.mocked(caricaConfig).mockResolvedValue(config)
    vaiAllaPagina()
    await screen.findByLabelText('N° pianta')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByText(/non ha passate/)).toBeInTheDocument()
    expect(campoPianta()).toBeDisabled()
  })
})

describe('Campo: numero della pianta', () => {
  it('senza una passata scelta il campo è disabilitato e compare "Scegli una passata"', async () => {
    vaiAllaPagina()
    await screen.findByLabelText('N° pianta')
    expect(campoPianta()).toBeDisabled()
    expect(apriScheda()).toBeDisabled()
    expect(screen.getByText('Scegli una passata')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Piante' })).not.toBeInTheDocument()
  })

  it('dopo aver scelto la passata il campo si abilita e l\'invito sparisce', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await utente.click(await screen.findByRole('radio', { name: 'Termometro' }))
    expect(campoPianta()).toBeEnabled()
    expect(screen.queryByText('Scegli una passata')).not.toBeInTheDocument()
  })

  it('" 035 " apre la scheda della pianta 35', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await utente.type(campoPianta(), ' 035 ')
    await utente.click(apriScheda())
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('35')}`)
  })

  it('il tasto Invio apre la scheda, come il pulsante', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await utente.type(campoPianta(), '12{Enter}')
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('12')}`)
  })

  it('"999" non esiste: resta nella pagina e mostra l\'errore con il testo digitato', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await utente.type(campoPianta(), '999{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('Nessuna pianta con etichetta «999» in questo esperimento.')
    expect(campoPianta()).toHaveAttribute('aria-invalid', 'true')
    expect(campoPianta()).toHaveAccessibleDescription(/Nessuna pianta con etichetta «999»/)
    expect(screen.queryByTestId('posizione')).not.toBeInTheDocument()
  })

  it('nell\'errore l\'etichetta è quella digitata senza spazi ai bordi', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await utente.type(campoPianta(), '  999 {Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Nessuna pianta con etichetta «999» in questo esperimento.')
  })

  it('l\'errore sparisce appena si ricomincia a scrivere', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await utente.type(campoPianta(), '999{Enter}')
    await utente.type(campoPianta(), '1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(campoPianta()).not.toHaveAttribute('aria-invalid')
  })

  it('dopo un errore il testo è selezionato: la cifra successiva lo sostituisce', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await utente.type(campoPianta(), '999{Enter}')
    await utente.keyboard('7')
    expect(campoPianta()).toHaveValue('7')
  })

  it('a campo vuoto il pulsante è spento e Invio non fa nulla', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    expect(apriScheda()).toBeDisabled()
    await utente.type(campoPianta(), '{Enter}')
    expect(screen.queryByTestId('posizione')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await utente.type(campoPianta(), '   ')
    expect(apriScheda()).toBeDisabled()
  })

  it('con etichette solo numeriche la tastiera è numerica', async () => {
    await paginaConPassata('Termometro')
    expect(campoPianta()).toHaveAttribute('inputmode', 'numeric')
  })

  it('con etichette anche non numeriche la tastiera è quella normale e la ricerca ignora le maiuscole', async () => {
    const utente = userEvent.setup()
    const piante: Pianta[] = creaPiante(['A1', 'B3-12', '7'])
    config.piante = piante
    vi.mocked(caricaConfig).mockResolvedValue(config)
    await paginaConPassata('Termometro')

    expect(campoPianta()).toHaveAttribute('inputmode', 'text')
    await utente.type(campoPianta(), 'b3-12{Enter}')
    expect(posizione()).toBe(`/esperimenti/E/piante/${piante[1].id}`)
  })

  it('il campo è un numero grande in Geist Mono, con la tastiera che ha il tasto "Vai"', async () => {
    await paginaConPassata('Termometro')
    expect(campoPianta().className).toContain('text-numero')
    expect(campoPianta().className).toContain('font-mono')
    expect(campoPianta()).toHaveAttribute('enterkeyhint', 'go')
  })
})

describe('Campo: griglia delle piante', () => {
  it('mostra il conteggio "Fatte 2/56 · Termometro · 28/10/2026" e segna le piante misurate', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([misura('1', 'Termometro'), misura('2', 'Termometro')])
    await paginaConPassata('Termometro')

    expect(await screen.findByText('Fatte 2/56 · Termometro · 28/10/2026')).toBeInTheDocument()
    expect(cella('Pianta 1, misurata')).toBeInTheDocument()
    expect(cella('Pianta 2, misurata')).toBeInTheDocument()
    expect(cella('Pianta 3, da misurare')).toBeInTheDocument()
    expect(within(griglia()).getAllByRole('link')).toHaveLength(56)
  })

  it('la pianta con più misure della passata mostra il contatore ×N (solo da 2 in su)', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([
      misura('1', 'Termometro'),
      misura('2', 'Termometro'), misura('2', 'Termometro', { ora: '15:40' }),
      misura('3', 'Termometro'), misura('3', 'Termometro', { ora: '12:00' }), misura('3', 'Termometro', { ora: '15:00' }),
    ])
    await paginaConPassata('Termometro')
    await screen.findByText('Fatte 3/56 · Termometro · 28/10/2026')

    expect(within(cella('Pianta 2, misurata 2 volte')).getByText('×2')).toBeInTheDocument()
    // Leggibile al sole: la taglia Label di DESIGN.md (13px), non un valore arbitrario più piccolo.
    expect(within(cella('Pianta 2, misurata 2 volte')).getByText('×2')).toHaveClass('text-label')
    expect(within(cella('Pianta 3, misurata 3 volte')).getByText('×3')).toBeInTheDocument()
    expect(within(cella('Pianta 1, misurata')).queryByText(/^×/)).not.toBeInTheDocument()
    expect(within(cella('Pianta 4, da misurare')).queryByText(/^×/)).not.toBeInTheDocument()
  })

  it('una cella misurata ha un ✓: lo stato non dipende dal colore', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([misura('1', 'Termometro')])
    await paginaConPassata('Termometro')
    await screen.findByText('Fatte 1/56 · Termometro · 28/10/2026')
    expect(cella('Pianta 1, misurata').querySelector('svg')).not.toBeNull()
    expect(cella('Pianta 2, da misurare').querySelector('svg')).toBeNull()
  })

  it('conta solo le misure della passata scelta', async () => {
    vi.mocked(misureDelGiorno).mockResolvedValue([misura('1', 'SPAD'), misura('2', 'Termometro')])
    await paginaConPassata('Termometro')
    expect(await screen.findByText('Fatte 1/56 · Termometro · 28/10/2026')).toBeInTheDocument()
    expect(cella('Pianta 1, da misurare')).toBeInTheDocument()
    expect(cella('Pianta 2, misurata')).toBeInTheDocument()
  })

  it('cambiando passata la griglia e il conteggio cambiano', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockResolvedValue([misura('1', 'SPAD'), misura('2', 'SPAD'), misura('3', 'Termometro')])
    await paginaConPassata('Termometro')
    await screen.findByText('Fatte 1/56 · Termometro · 28/10/2026')

    await utente.click(screen.getByRole('radio', { name: 'SPAD' }))

    expect(screen.getByText('Fatte 2/56 · SPAD · 28/10/2026')).toBeInTheDocument()
    expect(cella('Pianta 1, misurata')).toBeInTheDocument()
    expect(cella('Pianta 3, da misurare')).toBeInTheDocument()
  })

  it('le piante sono nell\'ordine dell\'esperimento, non in quello di arrivo', async () => {
    config.piante = [...config.piante].reverse()
    vi.mocked(caricaConfig).mockResolvedValue(config)
    await paginaConPassata('Termometro')
    await misureArrivate()
    const nomi = within(griglia()).getAllByRole('link').map(l => l.getAttribute('aria-label'))
    expect(nomi.slice(0, 3)).toEqual(['Pianta 1, da misurare', 'Pianta 2, da misurare', 'Pianta 3, da misurare'])
    expect(nomi[55]).toBe('Pianta 56, da misurare')
  })

  it('toccare una cella apre la scheda della pianta', async () => {
    const utente = userEvent.setup()
    await paginaConPassata('Termometro')
    await misureArrivate()
    expect(cella('Pianta 36, da misurare')).toHaveAttribute('href', `/esperimenti/E/piante/${idPianta('36')}`)
    await utente.click(cella('Pianta 36, da misurare'))
    expect(posizione()).toBe(`/esperimenti/E/piante/${idPianta('36')}`)
  })

  it('le etichette lunghe non vengono tagliate: la cella si allarga', async () => {
    config.piante = creaPiante(['B3-12', 'B3-13'])
    vi.mocked(caricaConfig).mockResolvedValue(config)
    await paginaConPassata('Termometro')
    expect(within(griglia()).getByText('B3-12')).toBeInTheDocument()
    expect(parseInt(griglia().style.getPropertyValue('--cella-min'))).toBeGreaterThan(44)
  })

  it('un esperimento senza piante lo dice', async () => {
    config.piante = []
    vi.mocked(caricaConfig).mockResolvedValue(config)
    await paginaConPassata('Termometro')
    expect(screen.getByText('Questo esperimento non ha piante.')).toBeInTheDocument()
  })

  it('mentre le misure del giorno si caricano la griglia c\'è già e dice "Caricamento…"', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    await paginaConPassata('Termometro')
    expect(await screen.findByText('Caricamento…')).toBeInTheDocument()
    expect(screen.queryByText(/^Fatte/)).not.toBeInTheDocument()
    // Senza sapere come stanno le misure non si finge che siano da fare.
    expect(cella('Pianta 1')).toBeInTheDocument()
    expect(campoPianta()).toBeEnabled()
  })

  it('se le misure del giorno non si leggono lo dice, con "Riprova", e le piante restano raggiungibili', async () => {
    const utente = userEvent.setup()
    vi.mocked(misureDelGiorno).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await paginaConPassata('Termometro')

    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.queryByText(/^Fatte/)).not.toBeInTheDocument()
    expect(cella('Pianta 1')).toBeInTheDocument()
    expect(campoPianta()).toBeEnabled()

    vi.mocked(misureDelGiorno).mockResolvedValue([misura('1', 'Termometro')])
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))

    expect(await screen.findByText('Fatte 1/56 · Termometro · 28/10/2026')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Campo: data di rilievo', () => {
  it('di norma è oggi e non c\'è nessun avviso', async () => {
    await paginaConPassata('Termometro')
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', OGGI)
  })

  it('cambiando la data in ieri compare il banner, la data si salva e la griglia legge le misure di ieri', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async (_esp, data) =>
      data === IERI ? [misura('5', 'Termometro', { data_rilievo: IERI })] : [])
    await paginaConPassata('Termometro')
    await screen.findByText('Fatte 0/56 · Termometro · 28/10/2026')

    fireEvent.change(screen.getByLabelText('Data di rilievo'), { target: { value: IERI } })

    expect(await screen.findByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(IERI)
    expect(await screen.findByText('Fatte 1/56 · Termometro · 27/10/2026')).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
    expect(cella('Pianta 5, misurata')).toBeInTheDocument()
  })

  it('"Usa oggi" porta la data a oggi: il banner sparisce e il campo data segna oggi', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setData('E', IERI)
    await paginaConPassata('Termometro')
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(IERI)

    await utente.click(screen.getByRole('button', { name: 'Usa oggi' }))

    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(OGGI)
    expect(await screen.findByText('Fatte 0/56 · Termometro · 28/10/2026')).toBeInTheDocument()
  })

  it('una data scelta resta anche riaprendo la pagina', async () => {
    useCampoStore.getState().setData('E', IERI)
    await paginaConPassata('Termometro')
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
  })

  it('cancellando la data dal selettore non si resta senza data', async () => {
    await paginaConPassata('Termometro')
    fireEvent.change(screen.getByLabelText('Data di rilievo'), { target: { value: '' } })
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)
    expect(useCampoStore.getState().dati('E').dataRilievo).toBe(OGGI)
  })

  it('se la pagina resta aperta oltre la mezzanotte la data segue il nuovo giorno (finché non ne è stata scelta un\'altra)', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59))
    await paginaConPassata('Termometro')
    await screen.findByText('Fatte 0/56 · Termometro · 28/10/2026')
    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(OGGI)

    vi.setSystemTime(new Date(2026, 9, 29, 0, 1)) // l'app riprende dallo sfondo
    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(screen.getByLabelText('Data di rilievo')).toHaveValue('2026-10-29')
    expect(await screen.findByText('Fatte 0/56 · Termometro · 29/10/2026')).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', '2026-10-29')
    expect(screen.queryByText(/non oggi/)).not.toBeInTheDocument()
  })

  it('una data scelta resta anche dopo la mezzanotte e il banner continua a segnalarla', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59))
    useCampoStore.getState().setData('E', IERI)
    await paginaConPassata('Termometro')
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()

    vi.setSystemTime(new Date(2026, 9, 29, 0, 1))
    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(screen.getByLabelText('Data di rilievo')).toHaveValue(IERI)
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
  })

  it('il banner c\'è anche senza una passata scelta', async () => {
    useCampoStore.getState().setData('E', IERI)
    vaiAllaPagina()
    expect(await screen.findByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
  })
})
