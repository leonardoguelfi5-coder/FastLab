import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Come SchedaPianta.test: veri hook e vera cache di React Query, livello API finto, client Supabase mai raggiunto.
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
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { toast } from 'sonner'
import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { caricaMisura, eliminaMisura, misurePianta, salvaMisura } from '@/api/misure'
import { chiavi } from '@/api/query'
import { chiaveAperto, chiaveBozza, leggiAperto, leggiBozza, scriviAperto, scriviBozza } from '@/components/scheda/bozza'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura, Parametro } from '@/domain/tipi'
import { toastSalvato } from '@/lib/toastSalvato'
import { useCampoStore } from '@/store/campo'
import { ModificaMisura } from './ModificaMisura'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const DATA = '2026-10-21'

let config: ConfigEsperimento
/** Le misure "nel database": `caricaMisura` le legge, `salvaMisura` le scrive (upsert per id), `eliminaMisura` le toglie. */
let archivio: Misura[]
/** La misura aperta nei test: pianta 35, Termometro, 21/10/2026 alle 09:12. */
let m: Misura

const idStrumento = (nome: string) => config.strumenti.find(p => p.nome === nome)!.id
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!

function Posizione() {
  const { pathname } = useLocation()
  const tipo = useNavigationType()
  return <p data-testid="posizione" data-tipo={tipo}>{pathname}</p>
}

/** Il gesto "indietro" del telefono: torna alla voce precedente della cronologia, senza passare dall'app. */
function IndietroDiSistema() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Indietro di sistema</button>
}

interface OpzioniApri {
  /** Arrivando dalla storia della pianta (il solito) o da un link diretto, senza cronologia dell'app. */
  daScheda?: boolean
  /** La modifica è la sola voce della cronologia (pagina riaperta): indietro non porterebbe alla scheda. */
  soloVoce?: boolean
  id?: string
}

function apri({ daScheda = true, soloVoce = false, id = m.id }: OpzioniApri = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalida = vi.spyOn(client, 'invalidateQueries')
  const aperta = { pathname: `/esperimenti/E/misure/${id}`, state: daScheda ? { daScheda: true } : null }
  const voci = daScheda && !soloVoce ? ['/esperimenti/E', `/esperimenti/E/piante/${idPianta('35')}`, aperta] : [aperta]
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={voci} initialIndex={voci.length - 1}>
        <Routes>
          <Route path="/esperimenti/:espId/misure/:misuraId" element={<ModificaMisura />} />
          <Route path="*" element={<p>Scheda della pianta</p>} />
        </Routes>
        <Posizione />
        <IndietroDiSistema />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, invalida }
}

const posizione = () => screen.getByTestId('posizione').textContent
const tipoNavigazione = () => screen.getByTestId('posizione').dataset.tipo
const SCONOSCIUTA = '7d4f0c2a-1b3e-4f6a-9c8d-0e1f2a3b4c5d'
const SCHEDA = () => `/esperimenti/E/piante/${idPianta('35')}`
const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement
const pulsante = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
/** Aspetta che la pagina sia pronta: il modulo compare solo con configurazione e misura arrivate. */
const pronta = () => screen.findByLabelText('Data di rilievo')
const salvate = () => vi.mocked(salvaMisura).mock.calls.map(([, x]) => x)
const dialogo = (nome: string) => screen.findByRole('dialog', { name: nome })
const chiudiDialogo = async () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
/** Più tardi di un doppio tocco: il tocco che conferma un avviso deve arrivare dopo mezzo secondo. */
const piuTardi = (secondi = 1) => vi.setSystemTime(new Date(Date.now() + secondi * 1000))
const cambiaData = (valore: string) => fireEvent.change(campo('Data di rilievo'), { target: { value: valore } })

beforeEach(() => {
  vi.clearAllMocks()
  // Solo `Date`: i timer veri servono a React Query e a userEvent. 28 ottobre 2026, ore 10:00 (ora locale).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
  localStorage.clear()
  sessionStorage.clear()
  useCampoStore.setState({ stato: {} })
  config = bozzaHydrochar(SEMI_CATALOGO)
  config.esperimento.id = 'E'
  par('SPAD').archiviato = true
  m = {
    id: crypto.randomUUID(), pianta_id: idPianta('35'), strumento_id: idStrumento('Termometro'), data_rilievo: DATA, ora: '09:12',
    valori: {
      [par('Temp aria').id]: [24.5],
      [par('Temp pianta').id]: [25.1],
      // Un parametro archiviato che non è nello strumento, e una chiave che non è di nessun parametro: restano.
      [par('SPAD').id]: [38.1],
      'chiave-estranea': 'da tenere',
    },
  }
  archivio = [m]
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misurePianta).mockImplementation(async id => archivio.filter(x => x.pianta_id === id))
  vi.mocked(caricaMisura).mockImplementation(async id => {
    const trovata = archivio.find(x => x.id === id)
    if (!trovata) throw new Error('Misura non trovata.')
    return structuredClone(trovata)
  })
  vi.mocked(salvaMisura).mockImplementation(async (_esp, x) => {
    archivio = [x, ...archivio.filter(y => y.id !== x.id)]
  })
  vi.mocked(eliminaMisura).mockImplementation(async id => {
    archivio = archivio.filter(y => y.id !== id)
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ModificaMisura: cosa mostra', () => {
  it('titolo, pianta con trattamento, strumento e i valori della misura', async () => {
    apri()
    await pronta()

    expect(screen.getByRole('heading', { level: 1, name: 'Modifica misura' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pianta #35' })).toBeInTheDocument()
    const trattamento = config.trattamenti.find(t => t.id === config.piante.find(p => p.etichetta === '35')!.trattamento_id)!
    expect(screen.getByText(trattamento.etichetta)).toBeInTheDocument()
    expect(screen.getByText('🌡')).toBeInTheDocument()
    expect(screen.getByText('Termometro')).toBeInTheDocument()

    expect(campo('Data di rilievo')).toHaveValue(DATA)
    expect(campo('Ora')).toHaveValue('09:12')
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp pianta')).toHaveValue('25,1')
  })

  it('mostra i parametri dello strumento e, con il suffisso "(archiviato)", quelli archiviati presenti nei valori', async () => {
    apri()
    await pronta()

    expect(campo('SPAD (archiviato)')).toHaveValue('38,1')
    // I parametri della configurazione non cambiano.
    expect(par('SPAD').nome).toBe('SPAD')
    // Gli altri parametri, né dello strumento né nella misura, non ci sono.
    expect(screen.queryByLabelText('Altezza')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('N frutti')).not.toBeInTheDocument()
  })

  it('"Temp aria" e "Temp pianta" (dello strumento) vengono prima dell\'archiviato, che segue l\'ordine della configurazione', async () => {
    apri()
    await pronta()
    const etichette = screen.getAllByRole('textbox').map(e => e.getAttribute('id')).filter(Boolean)
    const nomi = etichette.map(id => document.querySelector(`label[for="${id}"]`)?.textContent ?? '')
    const ordine = ['Temp aria', 'Temp pianta', 'SPAD (archiviato)'].map(n => nomi.findIndex(x => x.startsWith(n)))
    expect(ordine.every(i => i >= 0)).toBe(true)
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b))
  })

  it('un obbligatorio che la misura ha già non si può svuotare', async () => {
    const strumento = config.strumenti.find(p => p.nome === 'Termometro')!
    strumento.parametri.find(pp => pp.parametro_id === par('Temp pianta').id)!.obbligatorio = true
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.clear(screen.getByLabelText(/^Temp pianta/))
    await utente.click(pulsante('Salva'))

    expect(await screen.findByRole('alert')).toHaveTextContent('«Temp pianta» è obbligatorio.')
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('un obbligatorio aggiunto dopo la misura (che non ne ha il valore) non la blocca: si corregge senza inventarlo', async () => {
    const strumento = config.strumenti.find(p => p.nome === 'Termometro')!
    strumento.parametri.find(pp => pp.parametro_id === par('Temp pianta').id)!.obbligatorio = true
    delete m.valori[par('Temp pianta').id]
    const utente = userEvent.setup()
    apri()
    await pronta()
    cambiaData('2026-10-20')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe('2026-10-20')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('se le letture salvate sono più di n_letture, le eccedenti restano visibili e si salvano', async () => {
    m.valori[par('SPAD').id] = [38.1, 39.4]
    const utente = userEvent.setup()
    apri()
    await pronta()

    expect(campo('SPAD (archiviato) · lettura 1')).toHaveValue('38,1')
    expect(campo('SPAD (archiviato) · lettura 2')).toHaveValue('39,4')
    await utente.clear(campo('SPAD (archiviato) · lettura 1'))
    await utente.type(campo('SPAD (archiviato) · lettura 1'), '40')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].valori[par('SPAD').id]).toEqual([40, 39.4])
  })
})

describe('ModificaMisura: salvataggio', () => {
  it('cambia un valore e la data: una sola chiamata anche con due tocchi, stesso id, valori fusi, ritorno alla scheda', async () => {
    let finisci!: () => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>(r => { finisci = r }))
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '26,2')
    cambiaData('2026-10-20')

    const salva = pulsante('Salva')
    // Due tocchi prima che React ridisegni: il pulsante non è ancora disabilitato.
    act(() => {
      fireEvent.click(salva)
      fireEvent.click(salva)
    })

    expect(salvaMisura).toHaveBeenCalledTimes(1)
    expect(salvaMisura).toHaveBeenCalledWith('E', {
      id: m.id, pianta_id: idPianta('35'), strumento_id: idStrumento('Termometro'), data_rilievo: '2026-10-20', ora: '09:12',
      valori: {
        [par('Temp aria').id]: [26.2],
        [par('Temp pianta').id]: [25.1],
        [par('SPAD').id]: [38.1],
        'chiave-estranea': 'da tenere',
      },
    })
    // Mentre salva i pulsanti sono disabilitati.
    expect(pulsante('Salvataggio…')).toBeDisabled()
    expect(pulsante('Elimina misura')).toBeDisabled()

    await act(async () => finisci())
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(toastSalvato).toHaveBeenCalledExactlyOnceWith('Misura aggiornata ✓')
    expect(salvaMisura).toHaveBeenCalledTimes(1)
  })

  it('invalida tutte le misure (la data può essere cambiata) e gli esperimenti, e aggiorna la cache della pianta', async () => {
    const utente = userEvent.setup()
    const { client, invalida } = apri()
    await pronta()
    // La storia della pianta è già in cache: la misura vi entra subito, senza aspettare il ricaricamento.
    client.setQueryData<Misura[]>(chiavi.misurePianta(idPianta('35')), [structuredClone(m)])
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['misure'] })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.esperimenti })
    const inCache = client.getQueryData<Misura[]>(chiavi.misurePianta(idPianta('35')))
    expect(inCache).toHaveLength(1)
    expect(inCache![0].valori[par('Temp aria').id]).toEqual([1])
  })

  it('non crea chiavi vuote: un parametro che la misura non aveva e resta vuoto non entra nei valori', async () => {
    delete m.valori[par('Temp pianta').id]
    const utente = userEvent.setup()
    apri()
    await pronta()
    expect(campo('Temp pianta')).toHaveValue('')
    await utente.type(campo('Temp aria'), '26')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(Object.keys(salvate()[0].valori).sort()).toEqual([par('Temp aria').id, par('SPAD').id, 'chiave-estranea'].sort())
  })

  it('un parametro che la misura aveva e si svuota resta (vuoto) tra i valori', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.clear(campo('Temp pianta'))
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].valori[par('Temp pianta').id]).toEqual([null])
  })

  it('con la data cambiata ricarica il giorno vecchio e quello nuovo', async () => {
    const utente = userEvent.setup()
    const { client } = apri()
    await pronta()
    client.setQueryData(chiavi.misureGiorno('E', DATA), [])
    client.setQueryData(chiavi.misureGiorno('E', '2026-10-20'), [])
    cambiaData('2026-10-20')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(client.getQueryState(chiavi.misureGiorno('E', DATA))?.isInvalidated).toBe(true)
    expect(client.getQueryState(chiavi.misureGiorno('E', '2026-10-20'))?.isInvalidated).toBe(true)
  })

  it('torna alla scheda dalla cronologia: la pagina di modifica non resta tra le voci', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(tipoNavigazione()).toBe('POP')
    // Indietro dalla scheda porta alla schermata in campo, non a una misura già salvata.
    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe('/esperimenti/E')
  })

  it('se la modifica è la sola voce della cronologia (anche con lo stato della storia) sostituisce la voce: la pagina non resta aperta', async () => {
    const utente = userEvent.setup()
    apri({ soloVoce: true })
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(tipoNavigazione()).toBe('REPLACE')
  })

  it('aperta da un link diretto sostituisce la voce: indietro non riporta alla modifica', async () => {
    const utente = userEvent.setup()
    apri({ daScheda: false })
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(tipoNavigazione()).toBe('REPLACE')
    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe(SCHEDA())
  })

  it('senza modifiche si può salvare lo stesso e i valori restano identici', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0]).toEqual(m)
  })

  it('l\'ora si cambia e si salva', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    fireEvent.change(campo('Ora'), { target: { value: '08:30' } })
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0]).toMatchObject({ id: m.id, data_rilievo: DATA, ora: '08:30' })
  })

  it('senza data non salva e lo dice; con la data di nuovo salva', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    cambiaData('')
    await utente.click(pulsante('Salva'))

    expect(salvaMisura).not.toHaveBeenCalled()
    const avviso = screen.getByRole('alert')
    expect(avviso).toHaveTextContent('La data di rilievo è obbligatoria.')
    expect(avviso).toHaveFocus()

    cambiaData('2026-10-22')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe('2026-10-22')
  })

  it('senza ora non salva e lo dice', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    fireEvent.change(campo('Ora'), { target: { value: '' } })
    await utente.click(pulsante('Salva'))

    expect(salvaMisura).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('L\'ora è obbligatoria.')
  })

  it('tutti i valori tolti: "Nessun valore inserito." e nessuna chiamata', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    for (const nome of ['Temp aria', 'Temp pianta', 'SPAD (archiviato)']) await utente.clear(campo(nome))
    await utente.click(pulsante('Salva'))

    expect(screen.getByRole('alert')).toHaveTextContent('Nessun valore inserito.')
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('un valore fuori dall\'intervallo: il primo tocco avvisa, il pulsante diventa "Salva comunque", il secondo salva', async () => {
    par('Temp aria').valore_max = 40
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '45')
    await utente.click(pulsante('Salva'))

    expect(salvaMisura).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('«Temp aria» = 45 °C è fuori dall\'intervallo atteso (≤ 40).')

    // Il secondo tocco del doppio tocco arriva sul pulsante che ora dice "Salva comunque": non vale come conferma.
    await utente.click(pulsante('Salva comunque'))
    expect(salvaMisura).not.toHaveBeenCalled()

    piuTardi()
    await utente.click(pulsante('Salva comunque'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].valori[par('Temp aria').id]).toEqual([45])
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
  })

  it('cambiando un valore dopo l\'avviso si torna a "Salva": va ricontrollato', async () => {
    par('Temp aria').valore_max = 40
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '45')
    await utente.click(pulsante('Salva'))
    expect(pulsante('Salva comunque')).toBeInTheDocument()

    await utente.type(campo('Temp aria'), '1')
    expect(pulsante('Salva')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('esperimento concluso: si salva lo stesso', async () => {
    config.esperimento.stato = 'concluso'
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
  })

  it('non cambia i valori mantenuti per le piante dopo: correggere una misura vecchia non è l\'ultima inserita', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))

    expect(useCampoStore.getState().dati('E', OGGI).mantenuti).toBeNull()
  })
})

describe('ModificaMisura: salvataggio non riuscito', () => {
  it('spiega cosa è successo, i valori restano e "Riprova" usa lo stesso id', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '26,2')
    cambiaData('2026-10-20')
    await utente.click(pulsante('Salva'))

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Misura non salvata.')
    expect(errore).toHaveTextContent('Il server non risponde')
    expect(errore).toHaveFocus()
    expect(campo('Temp aria')).toHaveValue('26,2')
    expect(campo('Data di rilievo')).toHaveValue('2026-10-20')
    expect(posizione()).toBe(`/esperimenti/E/misure/${m.id}`)
    expect(toastSalvato).not.toHaveBeenCalled()
    // Il pulsante torna disponibile.
    expect(pulsante('Salva')).toBeEnabled()

    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))

    expect(salvaMisura).toHaveBeenCalledTimes(2)
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(m.id)
    expect(secondo).toEqual(primo)
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(toastSalvato).toHaveBeenCalledTimes(1)
  })

  it('se si esce mentre salva e il salvataggio fallisce, lo dice comunque con un messaggio', async () => {
    let fallisci!: (e: unknown) => void
    vi.mocked(salvaMisura).mockImplementationOnce(() => new Promise<void>((_, rifiuta) => { fallisci = rifiuta }))
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Salva'))
    // Salvando, l'uscita non chiede conferma: i valori sono già partiti.
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))

    await act(async () => fallisci(new TypeError('Failed to fetch')))
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/Misura del 21\/10\/2026 delle 09:12 non salvata\. Il server non risponde/)
    // Resta finché non lo si chiude: chi è uscito dalla scheda potrebbe non guardare subito.
    expect(vi.mocked(toast.error).mock.calls[0][1]).toEqual({ duration: Infinity, action: { label: 'Chiudi', onClick: expect.any(Function) } })
    expect(toastSalvato).not.toHaveBeenCalled()
  })
})

describe('ModificaMisura: eliminazione', () => {
  it('"Elimina misura" chiede conferma con data e ora della misura; "Annulla" non elimina', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(pulsante('Elimina misura'))

    const finestra = await dialogo('Eliminare la misura?')
    expect(finestra).toHaveTextContent('Eliminare la misura del 21/10/2026 alle 09:12? L\'operazione non si può annullare.')
    await utente.click(within(finestra).getByRole('button', { name: 'Annulla' }))
    await chiudiDialogo()

    expect(eliminaMisura).not.toHaveBeenCalled()
    expect(posizione()).toBe(`/esperimenti/E/misure/${m.id}`)
  })

  it('con la data cambiata e non salvata, la conferma cita la data e l\'ora salvate', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    cambiaData('2026-10-25')
    fireEvent.change(campo('Ora'), { target: { value: '07:00' } })
    await utente.click(pulsante('Elimina misura'))

    expect(await dialogo('Eliminare la misura?')).toHaveTextContent('Eliminare la misura del 21/10/2026 alle 09:12?')
  })

  it('"Elimina" cancella la misura con il suo id, la toglie dalla cache e torna alla scheda', async () => {
    const utente = userEvent.setup()
    const { client, invalida } = apri()
    await pronta()
    client.setQueryData<Misura[]>(chiavi.misurePianta(idPianta('35')), [structuredClone(m), { ...structuredClone(m), id: 'altra' }])
    await utente.click(pulsante('Elimina misura'))
    await utente.click(within(await dialogo('Eliminare la misura?')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(eliminaMisura).toHaveBeenCalledExactlyOnceWith(m.id)
    expect(tipoNavigazione()).toBe('POP')
    // Un esito neutro, non il toast verde dei salvataggi.
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Misura eliminata.')
    expect(toastSalvato).not.toHaveBeenCalled()
    expect(client.getQueryData<Misura[]>(chiavi.misurePianta(idPianta('35')))!.map(x => x.id)).toEqual(['altra'])
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['misure'] })
    expect(invalida).toHaveBeenCalledWith({ queryKey: chiavi.esperimenti })
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('un doppio tocco su "Elimina" nel dialogo elimina una volta sola', async () => {
    let finisci!: () => void
    vi.mocked(eliminaMisura).mockImplementationOnce(() => new Promise<void>(r => { finisci = r }))
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(pulsante('Elimina misura'))
    const elimina = within(await dialogo('Eliminare la misura?')).getByRole('button', { name: 'Elimina' })
    act(() => {
      fireEvent.click(elimina)
      fireEvent.click(elimina)
    })

    expect(eliminaMisura).toHaveBeenCalledTimes(1)
    await act(async () => finisci())
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(eliminaMisura).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it('l\'eliminazione ricarica il giorno della misura', async () => {
    const utente = userEvent.setup()
    const { client } = apri()
    await pronta()
    client.setQueryData(chiavi.misureGiorno('E', DATA), [])
    await utente.click(pulsante('Elimina misura'))
    await utente.click(within(await dialogo('Eliminare la misura?')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(client.getQueryState(chiavi.misureGiorno('E', DATA))?.isInvalidated).toBe(true)
  })

  it('se l\'eliminazione fallisce lo dice, la misura e i valori restano e "Riprova" riprova', async () => {
    vi.mocked(eliminaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(pulsante('Elimina misura'))
    await utente.click(within(await dialogo('Eliminare la misura?')).getByRole('button', { name: 'Elimina' }))

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Misura non eliminata.')
    expect(errore).toHaveTextContent('Il server non risponde')
    expect(campo('Temp aria')).toHaveValue('1')
    expect(posizione()).toBe(`/esperimenti/E/misure/${m.id}`)
    expect(toast.success).not.toHaveBeenCalled()

    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))
    expect(eliminaMisura).toHaveBeenCalledTimes(2)
    expect(vi.mocked(eliminaMisura).mock.calls[1][0]).toBe(m.id)
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
  })

  it('esperimento concluso: si elimina lo stesso', async () => {
    config.esperimento.stato = 'concluso'
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(pulsante('Elimina misura'))
    await utente.click(within(await dialogo('Eliminare la misura?')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(eliminaMisura).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
  })
})

describe('ModificaMisura: bozza della scheda', () => {
  /** La bozza che la scheda tiene per la correzione di questa misura (alla sua data), con il ricordo che era aperta. */
  function bozzaDellaScheda(misuraId: string, dataRilievo = DATA) {
    const base = { espId: 'E', piantaId: idPianta('35'), strumentoId: idStrumento('Termometro'), dataRilievo }
    const chiave = chiaveBozza({ ...base, misuraId })
    scriviBozza(chiave, { id: misuraId, valori: { [par('Temp aria').id]: [99] }, ora: '09:12' })
    scriviAperto(chiaveAperto(base), misuraId)
    return { chiave, aperto: chiaveAperto(base) }
  }

  it('dopo il salvataggio la bozza di correzione di quella misura sparisce; quella di un\'altra misura resta', async () => {
    const mia = bozzaDellaScheda(m.id)
    const altra = chiaveBozza({ espId: 'E', piantaId: idPianta('35'), strumentoId: idStrumento('Termometro'), dataRilievo: DATA, misuraId: 'altra' })
    scriviBozza(altra, { id: 'altra', valori: {}, ora: null })
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    cambiaData('2026-10-20')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(leggiBozza(mia.chiave)).toBeNull()
    expect(leggiAperto(mia.aperto)).toBeNull()
    expect(leggiBozza(altra)).not.toBeNull()
  })

  it('dopo l\'eliminazione la bozza di correzione di quella misura sparisce', async () => {
    const mia = bozzaDellaScheda(m.id)
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(pulsante('Elimina misura'))
    await utente.click(within(await dialogo('Eliminare la misura?')).getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(leggiBozza(mia.chiave)).toBeNull()
    expect(leggiAperto(mia.aperto)).toBeNull()
  })

  it('se il salvataggio fallisce la bozza non si tocca', async () => {
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const mia = bozzaDellaScheda(m.id)
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(pulsante('Salva'))
    await screen.findByRole('alert')

    expect(leggiBozza(mia.chiave)).not.toBeNull()
  })

  it('la pagina di modifica non scrive bozze', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')

    expect(Object.keys(sessionStorage).filter(k => k.startsWith('fastlab-bozza:'))).toEqual([])
  })
})

describe('ModificaMisura: uscita con modifiche non salvate', () => {
  it('senza modifiche la freccia indietro esce senza domande', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(tipoNavigazione()).toBe('POP')
  })

  it('con valori cambiati chiede conferma; "Continua a modificare" li tiene, "Scarta" esce davvero', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    await utente.type(campo('Temp aria'), '1')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    await utente.click(within(await dialogo('Scartare i valori non salvati?')).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(`/esperimenti/E/misure/${m.id}`)
    expect(campo('Temp aria')).toHaveValue('1')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await dialogo('Scartare i valori non salvati?')).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe(SCHEDA()))
    expect(salvaMisura).not.toHaveBeenCalled()
  })

  it('anche la sola data cambiata conta come modifica', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    cambiaData('2026-10-20')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    expect(await dialogo('Scartare i valori non salvati?')).toBeInTheDocument()
  })

  it('chiudendo o ricaricando la pagina con modifiche il browser chiede conferma', async () => {
    const utente = userEvent.setup()
    apri()
    await pronta()
    const prima = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(prima)
    expect(prima.defaultPrevented).toBe(false)

    await utente.type(campo('Temp aria'), '1')
    const dopo = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dopo)
    expect(dopo.defaultPrevented).toBe(true)
  })
})

describe('ModificaMisura: casi limite', () => {
  it('una misura che non esiste lo dice, con il ritorno all\'esperimento', async () => {
    apri({ id: SCONOSCIUTA })

    expect(await screen.findByText('Misura non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Modifica misura' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna all\'esperimento' })).toHaveAttribute('href', '/esperimenti/E')
    expect(screen.queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un id che non è un uuid è "non trovata" senza chiedere nulla al server', async () => {
    apri({ id: 'abc' })

    expect(await screen.findByText('Misura non trovata.')).toBeInTheDocument()
    expect(caricaMisura).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('data e ora vanno a capo insieme se non ci stanno: nessuna larghezza fissa sulla data', async () => {
    apri()
    await pronta()
    const riga = campo('Data di rilievo').closest('div')!.parentElement!
    expect(riga).toHaveClass('flex-wrap')
    for (const nome of ['Data di rilievo', 'Ora']) {
      expect(campo(nome).closest('div')!.className).not.toMatch(/(^|\s)(w-\d+|shrink-0)(\s|$)/)
    }
  })

  it('una misura di un altro esperimento (la sua pianta non è in questo) è come non trovata', async () => {
    const estranea: Misura = { ...m, id: SCONOSCIUTA, pianta_id: 'pianta-di-un-altro-esperimento' }
    archivio.push(estranea)
    apri({ id: SCONOSCIUTA })

    expect(await screen.findByText('Misura non trovata.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Data di rilievo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina misura' })).not.toBeInTheDocument()
  })

  it('una misura che non si carica (rete) spiega perché, con "Riprova"', async () => {
    vi.mocked(caricaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri()

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Il server non risponde')
    expect(screen.queryByText('Misura non trovata.')).not.toBeInTheDocument()
    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))
    expect(await pronta()).toBeInTheDocument()
    expect(campo('Temp aria')).toHaveValue('24,5')
  })

  it('una configurazione che non si carica spiega perché, con "Riprova"', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri()

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Il server non risponde')
    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))
    expect(await pronta()).toBeInTheDocument()
  })

  it('mentre carica lo dice', () => {
    apri()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('i valori caricati non si sovrascrivono se la misura si ricarica in background', async () => {
    const utente = userEvent.setup()
    const { client } = apri()
    await pronta()
    await utente.clear(campo('Temp aria'))
    await utente.type(campo('Temp aria'), '30')

    await act(async () => { await client.invalidateQueries({ queryKey: ['misure'] }) })
    expect(campo('Temp aria')).toHaveValue('30')
  })
})
