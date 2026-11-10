import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

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
  ultimaMisuraPerStrumento: vi.fn(), ultimeMisurePiante: vi.fn(),
}))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { ultimeMisurePiante } from '@/api/misure'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura } from '@/domain/tipi'
import { ESPERIMENTO_NON_TROVATO } from '@/lib/errori'
import { useCampoStore } from '@/store/campo'
import { ElencoPiante } from './ElencoPiante'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session

let config: ConfigEsperimento

const strumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!
const parametro = (nome: string) => config.parametri.find(p => p.nome === nome)!
const pianta = (n: number) => config.piante.find(p => p.etichetta === String(n))!

/** Una misura SPAD (un solo parametro, una lettura) della pianta `n`. */
function spad(n: number, valore: number | null, data = '2026-10-27', ora = '09:00'): Misura {
  return {
    id: `spad-${n}-${data}-${ora}`, pianta_id: pianta(n).id, strumento_id: strumento('SPAD').id,
    data_rilievo: data, ora, valori: { [parametro('SPAD').id]: [valore] },
  }
}

/** Una misura del termometro: temperatura dell'aria della pianta `n`. */
function temperatura(n: number, valore: number, data = '2026-10-27'): Misura {
  return {
    id: `temp-${n}-${data}`, pianta_id: pianta(n).id, strumento_id: strumento('Termometro').id,
    data_rilievo: data, ora: '09:00', valori: { [parametro('Temp aria').id]: [valore] },
  }
}

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

function vaiAllaPagina(voce = '/esperimenti/E/piante') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[voce]}>
        <Routes>
          <Route path="/esperimenti/:espId/piante" element={<ElencoPiante />} />
          <Route path="*" element={<Posizione />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** I blocchi dei trattamenti: i pulsanti che li aprono e li chiudono. */
const aspettaBlocchi = async () => within(await screen.findByRole('list', { name: 'Trattamenti' })).getAllByRole('button')
const blocco = async (etichetta: string) => {
  const trovato = (await aspettaBlocchi()).find(b => b.textContent?.startsWith(etichetta) && !b.textContent.startsWith(`${etichetta} +`))
  if (!trovato) throw new Error(`Nessun blocco "${etichetta}"`)
  return trovato
}
/** Le piante mostrate dentro un blocco aperto. */
const pianteDi = (b: HTMLElement) => within(document.getElementById(b.getAttribute('aria-controls')!)!).getAllByRole('link')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockResolvedValue(config)
  vi.mocked(ultimeMisurePiante).mockResolvedValue([])
})

describe('ElencoPiante: intestazione', () => {
  it('ha il titolo "Piante" e la freccia indietro alla home dell\'esperimento', async () => {
    vaiAllaPagina()
    expect(await screen.findByRole('heading', { level: 1, name: 'Piante' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E')
  })
})

describe('ElencoPiante: i trattamenti', () => {
  it('un blocco per trattamento, nell\'ordine dei trattamenti, chiusi, con il numero di piante', async () => {
    vaiAllaPagina()
    const blocchi = await aspettaBlocchi()
    expect(blocchi).toHaveLength(8)
    config.trattamenti.forEach((t, i) => {
      const n = config.piante.filter(p => p.trattamento_id === t.id).length
      expect(n).toBeGreaterThan(0)
      expect(blocchi[i].textContent?.startsWith(`${t.etichetta}${n} piante`)).toBe(true)
    })
    expect(blocchi[0]).toHaveTextContent('Controllo14 piante')
    expect(blocchi[1]).toHaveTextContent('Controllo + HC6 piante')
    blocchi.forEach(b => expect(b).toHaveAttribute('aria-expanded', 'false'))
  })

  it('un trattamento con una sola pianta dice "1 pianta"', async () => {
    config.piante = config.piante.filter(p => p.trattamento_id !== config.trattamenti[1].id || p.etichetta === '15')
    vaiAllaPagina()
    expect(await blocco('Controllo + HC')).toHaveTextContent('1 pianta ·')
  })

  it('un blocco aperto elenca le sue piante in ordine, con l\'etichetta, e ognuna apre la sua scheda', async () => {
    config.piante = [...config.piante].reverse()
    const utente = userEvent.setup()
    vaiAllaPagina()
    const b = await blocco('Controllo + HC')
    await utente.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'true')
    const righe = pianteDi(b)
    expect(righe.map(r => r.textContent?.match(/^\d+/)?.[0])).toEqual(['15', '16', '17', '18', '19', '20'])
    expect(righe[0]).toHaveAttribute('href', `/esperimenti/E/piante/${pianta(15).id}`)
    await utente.click(righe[2])
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/piante/${pianta(17).id}`)
  })

  it('il blocco si chiude toccandolo ancora', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    const b = await blocco('Controllo')
    await utente.click(b)
    await utente.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'false')
  })

  it('senza piante lo dice', async () => {
    config.piante = []
    vaiAllaPagina()
    expect(await screen.findByText('Questo esperimento non ha piante.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Trattamenti' })).not.toBeInTheDocument()
  })
})

describe('ElencoPiante: il valore mostrato e le medie', () => {
  it('di base è il primo parametro del primo strumento attivo; le opzioni sono i soli parametri numerici, per strumento', async () => {
    vaiAllaPagina()
    const scelta = await screen.findByRole('combobox', { name: 'Valore mostrato' })
    expect(scelta).toHaveValue(parametro('Temp aria').id)
    const gruppi = within(scelta).getAllByRole('group')
    expect(gruppi.map(g => g.getAttribute('label'))).toEqual(['Termometro', 'SPAD', 'Metro', 'Tabella fenologica'])
    const opzioni = within(scelta).getAllByRole('option').map(o => o.textContent)
    expect(opzioni).toEqual(['Temp aria (°C)', 'Temp pianta (°C)', 'SPAD', 'Altezza (cm)', 'N palchi totali', 'N fiori fioriti', 'N frutti', 'N frutti invaiati'])
  })

  it('di base segue lo strumento scelto nello store', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vaiAllaPagina()
    expect(await screen.findByRole('combobox', { name: 'Valore mostrato' })).toHaveValue(parametro('SPAD').id)
  })

  it('uno strumento dello store senza parametri numerici lascia il primo strumento', async () => {
    useCampoStore.getState().setStrumento('E', 'non-esiste')
    vaiAllaPagina()
    expect(await screen.findByRole('combobox', { name: 'Valore mostrato' })).toHaveValue(parametro('Temp aria').id)
  })

  it('ogni blocco dice la media degli ultimi valori delle sue piante e quante ne hanno uno', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(ultimeMisurePiante).mockResolvedValue([
      spad(1, 40), spad(2, 42), spad(3, 44.5),
      spad(15, 30), spad(16, 31, '2026-10-26'),
    ])
    vaiAllaPagina()
    // (40 + 42 + 44,5) / 3 = 42,1666... → 42,17, su 3 piante di 14
    await vi.waitFor(async () => expect(await blocco('Controllo')).toHaveTextContent('14 piante · SPAD 42,17 · 3/14'))
    // ogni pianta con la sua ultima data: (30 + 31) / 2
    expect(await blocco('Controllo + HC')).toHaveTextContent('6 piante · SPAD 30,5 · 2/6')
  })

  it('più misure nello stesso giorno fanno la media della pianta; vale la data più recente', async () => {
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(ultimeMisurePiante).mockResolvedValue([
      spad(15, 10, '2026-10-20'),
      spad(15, 40, '2026-10-27', '09:00'), spad(15, 42, '2026-10-27', '11:00'),
      spad(16, 38, '2026-10-26'),
    ])
    vaiAllaPagina()
    // pianta 15: 41; pianta 16: 38 → 39,5
    await vi.waitFor(async () => expect(await blocco('Controllo + HC')).toHaveTextContent('SPAD 39,5 · 2/6'))
  })

  it('con l\'unità di misura, dopo il valore', async () => {
    vi.mocked(ultimeMisurePiante).mockResolvedValue([temperatura(1, 24), temperatura(2, 25)])
    vaiAllaPagina()
    await vi.waitFor(async () => expect(await blocco('Controllo')).toHaveTextContent('Temp aria 24,5 °C · 2/14'))
  })

  it('un trattamento senza valori non inventa una media', async () => {
    vi.mocked(ultimeMisurePiante).mockResolvedValue([temperatura(1, 24)])
    vaiAllaPagina()
    await vi.waitFor(async () => expect(await blocco('Controllo')).toHaveTextContent('Temp aria 24 °C'))
    expect(await blocco('Controllo + HC')).toHaveTextContent('6 piante · Temp aria senza valori')
  })

  it('cambiando il valore mostrato le medie si ricalcolano', async () => {
    const utente = userEvent.setup()
    vi.mocked(ultimeMisurePiante).mockResolvedValue([temperatura(1, 24), spad(1, 40), spad(2, 44)])
    vaiAllaPagina()
    await vi.waitFor(async () => expect(await blocco('Controllo')).toHaveTextContent('Temp aria 24 °C · 1/14'))
    await utente.selectOptions(screen.getByRole('combobox', { name: 'Valore mostrato' }), parametro('SPAD').id)
    expect(await blocco('Controllo')).toHaveTextContent('SPAD 42 · 2/14')
  })

  it('le piante di un blocco aperto mostrano il loro ultimo valore e la data; senza valore lo dicono', async () => {
    const utente = userEvent.setup()
    useCampoStore.getState().setStrumento('E', strumento('SPAD').id)
    vi.mocked(ultimeMisurePiante).mockResolvedValue([
      spad(15, 38.123, '2026-10-20'), spad(15, 41.25, '2026-10-27'), spad(16, 39, '2026-10-26'),
    ])
    vaiAllaPagina()
    const b = await blocco('Controllo + HC')
    await utente.click(b)
    await vi.waitFor(() => expect(pianteDi(b)[0]).toHaveTextContent('41,25'))
    const righe = pianteDi(b)
    expect(righe[0]).toHaveTextContent('15')
    expect(righe[0]).toHaveTextContent('27/10')
    expect(righe[0]).not.toHaveTextContent('38')
    expect(righe[1]).toHaveTextContent('39')
    expect(righe[1]).toHaveTextContent('26/10')
    expect(righe[2]).toHaveTextContent('17')
    expect(righe[2]).toHaveTextContent('senza valore')
  })

  it('senza parametri numerici attivi niente selettore né medie', async () => {
    config.strumenti = config.strumenti.map(s => ({ ...s, archiviato: true }))
    vaiAllaPagina()
    const b = await blocco('Controllo')
    expect(b).toHaveTextContent('14 piante')
    expect(b.textContent).not.toMatch(/·/)
    expect(screen.queryByRole('combobox', { name: 'Valore mostrato' })).not.toBeInTheDocument()
  })
})

describe('ElencoPiante: la ricerca', () => {
  it('filtra le piante per etichetta, apre da soli i blocchi che le contengono e nasconde gli altri', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaBlocchi()
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '21')
    const blocchi = await aspettaBlocchi()
    expect(blocchi).toHaveLength(1)
    expect(blocchi[0]).toHaveAttribute('aria-expanded', 'true')
    expect(blocchi[0]).toHaveTextContent('S1')
    // le statistiche restano quelle del trattamento; il conteggio dice quante se ne vedono
    expect(blocchi[0]).toHaveTextContent('1 di 6 piante')
    expect(pianteDi(blocchi[0]).map(r => r.textContent?.match(/^\d+/)?.[0])).toEqual(['21'])
  })

  it('un testo breve trova più piante in più trattamenti', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaBlocchi()
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '5')
    const blocchi = await aspettaBlocchi()
    const etichette = blocchi.flatMap(b => pianteDi(b).map(r => r.textContent?.match(/^\d+/)?.[0]))
    expect(etichette).toEqual(config.piante.map(p => p.etichetta).filter(e => e.includes('5')))
    expect(blocchi.length).toBeGreaterThan(1)
    blocchi.forEach(b => expect(b).toHaveAttribute('aria-expanded', 'true'))
  })

  it('durante la ricerca un blocco si può chiudere; cancellando il testo tutto torna chiuso', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaBlocchi()
    const campo = screen.getByRole('searchbox', { name: 'Cerca pianta' })
    await utente.type(campo, '21')
    await utente.click((await aspettaBlocchi())[0])
    expect((await aspettaBlocchi())[0]).toHaveAttribute('aria-expanded', 'false')
    await utente.clear(campo)
    const blocchi = await aspettaBlocchi()
    expect(blocchi).toHaveLength(8)
    blocchi.forEach(b => expect(b).toHaveAttribute('aria-expanded', 'false'))
  })

  it('Invio con un numero esatto apre direttamente la scheda di quella pianta', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaBlocchi()
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '035{Enter}')
    expect(screen.getByTestId('posizione')).toHaveTextContent(`/esperimenti/E/piante/${pianta(35).id}`)
  })

  it('Invio con un testo che non è una pianta non va da nessuna parte', async () => {
    const utente = userEvent.setup()
    vaiAllaPagina()
    await aspettaBlocchi()
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '99{Enter}')
    expect(screen.queryByTestId('posizione')).not.toBeInTheDocument()
    expect(screen.getByText('Nessuna pianta trovata.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Trattamenti' })).not.toBeInTheDocument()
  })
})

describe('ElencoPiante: caricamento ed errori', () => {
  it('mentre carica la configurazione mostra "Caricamento…"', () => {
    vi.mocked(caricaConfig).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('se la configurazione non arriva permette di riprovare', async () => {
    const utente = userEvent.setup()
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vaiAllaPagina()
    await utente.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('list', { name: 'Trattamenti' })).toBeInTheDocument()
  })

  it('un esperimento che non c\'è porta all\'elenco degli esperimenti', async () => {
    vi.mocked(caricaConfig).mockRejectedValue(new Error(ESPERIMENTO_NON_TROVATO))
    vaiAllaPagina()
    expect(await screen.findByRole('link', { name: 'I miei esperimenti' })).toHaveAttribute('href', '/')
  })

  it('finché gli ultimi valori non arrivano i blocchi ci sono già, senza numeri inventati', async () => {
    const utente = userEvent.setup()
    vi.mocked(ultimeMisurePiante).mockReturnValue(new Promise(() => {}))
    vaiAllaPagina()
    const b = await blocco('Controllo')
    expect(b).toHaveTextContent('14 piante · Temp aria …')
    expect(b.textContent).not.toMatch(/\d+\/14|NaN|senza valori/)
    await utente.click(b)
    pianteDi(b).forEach(r => expect(r).toHaveTextContent('…'))
  })

  it('se gli ultimi valori non arrivano l\'elenco resta usabile e permette di riprovare', async () => {
    const utente = userEvent.setup()
    vi.mocked(ultimeMisurePiante).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.mocked(ultimeMisurePiante).mockResolvedValue([temperatura(1, 24)])
    vaiAllaPagina()
    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Gli ultimi valori non sono arrivati.')
    const b = await blocco('Controllo')
    expect(b.textContent).not.toMatch(/senza valori|NaN|\d+\/14/)
    await utente.click(within(avviso).getByRole('button', { name: 'Riprova' }))
    await vi.waitFor(() => expect(b).toHaveTextContent('Temp aria 24 °C · 1/14'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ElencoPiante: ritorno all\'elenco (Piano E, Task E11)', () => {
  /** La ricerca e i blocchi aperti stanno nella URL: la leggiamo con una rotta che la mostra. */
  function vaiConUrl(voce = '/esperimenti/E/piante') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Url() {
      const { pathname, search } = useLocation()
      const tipo = useNavigationType()
      return <><p data-testid="url">{pathname + search}</p><p data-testid="tipo">{tipo}</p></>
    }
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[voce]}>
          <Routes>
            <Route path="/esperimenti/:espId/piante" element={<><ElencoPiante /><Url /></>} />
            <Route path="*" element={<Posizione />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }
  const url = () => screen.getByTestId('url').textContent

  beforeEach(() => sessionStorage.clear())

  it('la ricerca va nella URL e si riapre com\'era', async () => {
    const utente = userEvent.setup()
    vaiConUrl()
    await aspettaBlocchi()
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '21')
    expect(url()).toBe('/esperimenti/E/piante?cerca=21')
    cleanup()

    vaiConUrl('/esperimenti/E/piante?cerca=21')
    const blocchi = await aspettaBlocchi()
    expect(screen.getByRole('searchbox', { name: 'Cerca pianta' })).toHaveValue('21')
    expect(blocchi).toHaveLength(1)
    expect(blocchi[0]).toHaveAttribute('aria-expanded', 'true')
  })

  it('i blocchi aperti a mano vanno nella URL e tornano aperti', async () => {
    const utente = userEvent.setup()
    vaiConUrl()
    const primo = await blocco(config.trattamenti[0].etichetta)
    await utente.click(primo)
    const secondo = await blocco(config.trattamenti[2].etichetta)
    await utente.click(secondo)
    const salvata = `/esperimenti/E/piante?aperti=${config.trattamenti[0].id}%2C${config.trattamenti[2].id}`
    expect(url()).toBe(salvata)
    cleanup()

    vaiConUrl(salvata)
    expect(await blocco(config.trattamenti[0].etichetta)).toHaveAttribute('aria-expanded', 'true')
    expect(await blocco(config.trattamenti[2].etichetta)).toHaveAttribute('aria-expanded', 'true')
    expect(await blocco(config.trattamenti[1].etichetta)).toHaveAttribute('aria-expanded', 'false')
  })

  it('ricerca e blocchi sostituiscono la voce della cronologia: tornare indietro non li ripercorre', async () => {
    const utente = userEvent.setup()
    vaiConUrl()
    await utente.click(await blocco(config.trattamenti[0].etichetta))
    expect(screen.getByTestId('tipo').textContent).toBe('REPLACE')
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '2')
    expect(screen.getByTestId('tipo').textContent).toBe('REPLACE')
  })

  it('cambiando il testo i blocchi aperti a mano si dimenticano', async () => {
    const utente = userEvent.setup()
    vaiConUrl(`/esperimenti/E/piante?aperti=${config.trattamenti[0].id}`)
    expect(await blocco(config.trattamenti[0].etichetta)).toHaveAttribute('aria-expanded', 'true')
    await utente.type(screen.getByRole('searchbox', { name: 'Cerca pianta' }), '21')
    expect(url()).toBe('/esperimenti/E/piante?cerca=21')
  })

  it('lo scorrimento si ricorda per percorso e si ripristina al ritorno', async () => {
    const scorri = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vaiConUrl()
    await aspettaBlocchi()
    Object.defineProperty(window, 'scrollY', { value: 480, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    expect(sessionStorage.getItem('fastlab-scorrimento:/esperimenti/E/piante')).toBe('480')
    cleanup()

    vaiConUrl()
    await aspettaBlocchi()
    expect(scorri).toHaveBeenCalledWith(0, 480)
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    scorri.mockRestore()
  })

  it('senza uno scorrimento ricordato non scorre', async () => {
    const scorri = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vaiConUrl()
    await aspettaBlocchi()
    expect(scorri).not.toHaveBeenCalled()
    scorri.mockRestore()
  })
})
