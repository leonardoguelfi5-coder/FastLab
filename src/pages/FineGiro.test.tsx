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
import { valoriDiOggi } from '@/domain/giro'
import { serieTrattamenti } from '@/domain/dataset'
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
const cella = (nome: string) => screen.getByRole('button', { name: nome })
/** Più tardi di un doppio tocco: i pulsanti ignorano i tocchi appena comparsi. */
const piuTardi = () => vi.setSystemTime(new Date(Date.now() + 1000))

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

  it('riepiloga "💚 SPAD · fine giro 54/56", con i numeri nel font dei dati, e mostra la griglia al posto dell\'elenco', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    vaiAllaPagina()
    const intestazione = await titolo('SPAD · fine giro 54/56')
    expect(intestazione).toHaveTextContent('SPAD · fine giro 54/56')
    expect(intestazione.querySelector('[aria-hidden] svg, svg[aria-hidden]')).not.toBeNull()
    expect(within(intestazione).getByText('54/56')).toHaveClass('font-mono')
    const griglia = screen.getByRole('group', { name: 'Piante del giro' })
    expect(within(griglia).getAllByRole('button')).toHaveLength(56)
    expect(cella('Pianta #12, da fare')).toBeInTheDocument()
    expect(cella('Pianta #33, da fare')).toBeInTheDocument()
    expect(cella('Pianta #1, fatta')).toBeInTheDocument()
    expect(screen.getByText('✓ fatta · ½ incompleta · □ da fare')).toBeInTheDocument()
    // Né la frase né l'elenco delle mancanti.
    expect(screen.queryByText(/^Mancano/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Piante mancanti' })).not.toBeInTheDocument()
  })

  it('il tocco su una cella mancante apre la misura di quella pianta (come "Vai alle mancanti")', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    await titolo('SPAD · fine giro 54/56')
    piuTardi()
    await utente.click(cella('Pianta #33, da fare'))
    expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/${idPianta('33')}`)
  })

  it('una pianta incompleta (Ciras con solo A e gs) ha la sua cella, distinta dalla da fare', async () => {
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

    expect(await titolo('Ciras · fine giro 54/56')).toBeInTheDocument()
    expect(cella('Pianta #33, incompleta')).toBeInTheDocument()
    expect(cella('Pianta #40, da fare')).toBeInTheDocument()

    piuTardi()
    await utente.click(screen.getByRole('button', { name: 'Vai alle mancanti' }))
    expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('Ciras')}/${idPianta('33')}`)
  })

  it('"Vai alle mancanti" porta alla prima mancante; "Scegli un altro strumento" alla scelta', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    await titolo('SPAD · fine giro 54/56')
    expect(screen.getByRole('button', { name: 'Scegli un altro strumento' })).toBeInTheDocument()
    piuTardi()
    await utente.click(screen.getByRole('button', { name: 'Vai alle mancanti' }))
    expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/${idPianta('12')}`)
  })

  it('un tocco appena comparsa la pagina non vale (il secondo di un doppio tocco su "Salva e termina")', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    await titolo('SPAD · fine giro 54/56')
    await utente.click(screen.getByRole('button', { name: 'Vai alle mancanti' }))
    await utente.click(screen.getByRole('button', { name: 'Scegli un altro strumento' }))
    expect(screen.getByRole('heading', { level: 2, name: 'SPAD · fine giro 54/56' })).toBeInTheDocument()
    expect(screen.queryByTestId('posizione')).not.toBeInTheDocument()
  })

  it('anche il tocco su una cella appena comparsa la pagina non vale', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne('12', '33'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    await titolo('SPAD · fine giro 54/56')
    await utente.click(cella('Pianta #12, da fare'))
    expect(screen.queryByTestId('posizione')).not.toBeInTheDocument()
  })

  it('con il giro completo lo dice, senza "Vai alle mancanti"', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne())
    const utente = userEvent.setup()
    vaiAllaPagina()
    expect(await titolo('SPAD · fine giro 56/56')).toBeInTheDocument()
    expect(screen.getByText('Giro completo: tutte le piante sono misurate.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vai alle mancanti' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Mancano/)).not.toBeInTheDocument()
    piuTardi()
    await utente.click(screen.getByRole('button', { name: 'Scegli un altro strumento' }))
    expect(posizione()).toBe('/esperimenti/E/misura')
  })

  it('con la data di rilievo di ieri riepiloga ieri e mostra l\'avviso', async () => {
    useCampoStore.getState().setData('E', IERI)
    vi.mocked(misureDelGiorno).mockImplementation(async (_esp, data) => (data === IERI ? spadTranne('5') : []))
    vaiAllaPagina()
    expect(await titolo('SPAD · fine giro 55/56')).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
  })

  it('mentre le misure arrivano non inventa un riepilogo', () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
    expect(screen.queryByRole('group', { name: 'Piante del giro' })).not.toBeInTheDocument()
  })

  it('se le misure non arrivano lo dice, con "Riprova"', async () => {
    vi.mocked(misureDelGiorno).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    vaiAllaPagina()
    expect(await screen.findByRole('alert')).toHaveTextContent('Rete debole')
    await utente.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(await titolo('SPAD · fine giro 0/56')).toBeInTheDocument()
  })

  it('"Valori di oggi": una riga per trattamento con media ± ES (n), gli stessi numeri del Dataset per quel giorno', async () => {
    const spad = idPar('SPAD')
    // Valori diversi, così media ed ES non sono banali.
    vi.mocked(misureDelGiorno).mockImplementation(async () =>
      config.piante.map((p, i) => misura(p.etichetta, 'SPAD', { [spad]: [40 + (i % 5) * 0.7] })))
    vaiAllaPagina()
    await titolo('SPAD · fine giro 56/56')
    const sezione = screen.getByRole('region', { name: 'Valori di oggi' })
    expect(within(sezione).getByText('media ± ES (n)')).toBeInTheDocument()

    const attesi = valoriDiOggi(config, config.strumenti.find(s => s.nome === 'SPAD')!, await misureDelGiorno('E', OGGI), OGGI)
    expect(attesi).toHaveLength(1)
    expect(attesi[0].righe.length).toBe(config.trattamenti.length)
    // Le stesse cifre di serieTrattamenti con l'intervallo di un giorno (il Dataset).
    const dataset = serieTrattamenti(config, attesi[0].parametro, await misureDelGiorno('E', OGGI), config.piante, { da: OGGI, a: OGGI })
    expect(attesi[0].righe.map(r => [r.trattamento.id, r.media, r.es, r.n])).toEqual(dataset.map(x => [x.trattamento.id, x.punti[0].media, x.punti[0].es, x.punti[0].n]))

    // La prima riga è l'intestazione.
    const riga = within(sezione).getAllByRole('row')[1]
    expect(within(riga).getByRole('rowheader')).toHaveTextContent(attesi[0].righe[0].trattamento.etichetta)
    const celle = within(riga).getAllByRole('cell')
    const virgola = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
    expect(celle[0]).toHaveTextContent(virgola(attesi[0].righe[0].media))
    expect(celle[1]).toHaveTextContent(`± ${virgola(attesi[0].righe[0].es!)}`)
    expect(celle[2]).toHaveTextContent(`(${attesi[0].righe[0].n})`)
    expect(celle[0]).toHaveClass('font-mono')
  })

  it('"Valori di oggi" senza misure: lo dice, senza righe inventate', async () => {
    vaiAllaPagina()
    await titolo('SPAD · fine giro 0/56')
    const sezione = screen.getByRole('region', { name: 'Valori di oggi' })
    expect(within(sezione).getByText('Ancora nessun valore di oggi.')).toBeInTheDocument()
    expect(within(sezione).queryByRole('row')).not.toBeInTheDocument()
  })

  it('"Da controllare": un valore fuori dal gruppo, con il tocco che apre la misura', async () => {
    const spad = idPar('SPAD')
    const w1 = config.piante.filter(p => p.trattamento_id === config.piante[0].trattamento_id)
    // Le altre piante non devono essere tutte uguali: con scarto zero non si giudica.
    const misure = config.piante.map((p, i) => misura(p.etichetta, 'SPAD', { [spad]: [40 + (i % 3)] }))
    const strana = misure.find(m => m.pianta_id === w1[0].id)!
    strana.valori = { [spad]: [400] }
    vi.mocked(misureDelGiorno).mockImplementation(async () => misure)
    const utente = userEvent.setup()
    vaiAllaPagina()
    await titolo('SPAD · fine giro 56/56')
    const sezione = screen.getByRole('region', { name: 'Da controllare' })
    const link = within(sezione).getByRole('link', { name: /^Pianta 1/ })
    expect(within(sezione).getByText('fuori dal gruppo')).toBeInTheDocument()
    expect(link).toHaveAttribute('href', `/esperimenti/E/misure/${strana.id}`)
    await utente.click(link)
    expect(posizione()).toBe(`/esperimenti/E/misure/${strana.id}`)
  })

  it('"Da controllare" senza anomalie dice "Nessun valore da controllare."', async () => {
    vi.mocked(misureDelGiorno).mockImplementation(async () => spadTranne())
    vaiAllaPagina()
    await titolo('SPAD · fine giro 56/56')
    expect(within(screen.getByRole('region', { name: 'Da controllare' })).getByText('Nessun valore da controllare.')).toBeInTheDocument()
  })

  it('"Da controllare" mostra solo i valori di questo strumento', async () => {
    const ciras = strumentoDaCatalogo(SEMI_CATALOGO.find(v => v.nome === 'Ciras')!, config.strumenti.length)
    config.strumenti.push(ciras.strumento)
    config.parametri.push(...ciras.parametri)
    const a = idPar('A')
    const misure = [
      ...spadTranne(),
      ...config.piante.map((p, i) => misura(p.etichetta, 'Ciras', { [a]: [p.etichetta === '1' ? 900 : 10 + (i % 3)] })),
    ]
    vi.mocked(misureDelGiorno).mockImplementation(async () => misure)
    vaiAllaPagina()
    await titolo('SPAD · fine giro 56/56')
    expect(within(screen.getByRole('region', { name: 'Da controllare' })).getByText('Nessun valore da controllare.')).toBeInTheDocument()
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
