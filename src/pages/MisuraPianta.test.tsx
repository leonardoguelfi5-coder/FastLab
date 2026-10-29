import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

// Si prova la pagina con i veri hook e la vera cache di React Query: si finge il livello API (le misure stanno in un
// "database" in memoria, `archivio`), e il client Supabase non si raggiunge mai.
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
vi.mock('@/lib/toastSalvato', () => ({ toastSalvato: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(() => 'id-toast'), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }))

import { useSessione } from '@/api/auth'
import { sonoAdmin } from '@/api/inviti'
import { caricaConfig } from '@/api/esperimenti'
import { misureDelGiorno, misurePianta, salvaMisura } from '@/api/misure'
import { strumentoDaCatalogo } from '@/domain/catalogo'
import { bozzaHydrochar } from '@/domain/modelli/hydrochar'
import { SEMI_CATALOGO } from '@/domain/modelli/semi'
import type { ConfigEsperimento, Misura, Parametro, ValoriMisura } from '@/domain/tipi'
import { useCampoStore } from '@/store/campo'
import { FineGiro } from './FineGiro'
import { MisuraPianta } from './MisuraPianta'

const SESSIONE = { user: { email: 'giulia@example.it' } } as Session
const OGGI = '2026-10-28'
const IERI = '2026-10-27'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let config: ConfigEsperimento
/** Le misure "nel database": le letture le filtrano, `salvaMisura` le scrive (upsert per id). */
let archivio: Misura[]

const idStrumento = (nome: string) => config.strumenti.find(s => s.nome === nome)!.id
const idPianta = (etichetta: string) => config.piante.find(p => p.etichetta === etichetta)!.id
const par = (nome: string): Parametro => config.parametri.find(p => p.nome === nome)!

/** Una misura di oggi alle 09:12, di norma SPAD 38,1: con lo SPAD (un solo parametro) la pianta è "fatta". */
function misura(etichetta: string, extra: Partial<Misura> & { valori?: ValoriMisura } = {}): Misura {
  return {
    id: crypto.randomUUID(), pianta_id: idPianta(etichetta), strumento_id: idStrumento('SPAD'),
    data_rilievo: OGGI, ora: '09:12', valori: { [par('SPAD').id]: [38.1] }, ...extra,
  }
}

/** Il Ciras del catalogo (A, gs, E, Ci) aggiunto all'esperimento: il modello Hydrochar non lo ha. */
function aggiungiCiras() {
  const { strumento, parametri } = strumentoDaCatalogo(SEMI_CATALOGO.find(v => v.nome === 'Ciras')!, config.strumenti.length)
  config.strumenti.push(strumento)
  config.parametri.push(...parametri)
}

function Posizione() {
  const { pathname } = useLocation()
  return <p data-testid="posizione">{pathname}</p>
}

/** Il gesto "indietro" del telefono: torna alla voce precedente della cronologia, senza passare dall'app. */
function IndietroDiSistema() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Indietro di sistema</button>
}

const percorso = (strumento: string, etichetta: string) =>
  `/esperimenti/E/misura/${idStrumento(strumento)}/${config.piante.find(p => p.etichetta === etichetta)?.id ?? etichetta}`

/** Apre la misura di una pianta con uno strumento, arrivando dalla scelta dello strumento (la voce precedente). */
function apri(etichetta = '1', strumento = 'SPAD', voce?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/esperimenti/E/misura', voce ?? percorso(strumento, etichetta)]} initialIndex={1}>
        <Routes>
          <Route path="/esperimenti/:espId/misura/:strumentoId/fine" element={<FineGiro />} />
          <Route path="/esperimenti/:espId/misura/:strumentoId/:piantaId" element={<MisuraPianta />} />
          <Route path="*" element={null} />
        </Routes>
        <Posizione />
        <IndietroDiSistema />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, unmount }
}

const posizione = () => screen.getByTestId('posizione').textContent
const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement
const pulsante = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
/** Aspetta il modulo: compare solo con configurazione, misure della pianta e misure del giorno arrivate. */
const pronta = () => screen.findByRole('button', { name: /^Ora: / })
const salvate = () => vi.mocked(salvaMisura).mock.calls.map(([, m]) => m)
const dialogo = () => screen.findByRole('dialog', { name: 'Scartare i valori non salvati?' })
const chiudiDialogo = async () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
/** Più tardi di un doppio tocco. */
const piuTardi = (secondi = 1) => vi.setSystemTime(new Date(Date.now() + secondi * 1000))
const MANTIENI = 'Mantieni questo parametro uguale anche nelle prossime misure'
const mantieni = (nome: string) => {
  let el: HTMLElement | null = campo(nome)
  while (el && !within(el).queryByRole('checkbox')) el = el.parentElement
  return within(el!).getByRole('checkbox', { name: MANTIENI })
}
const UNA = 'Correggere quella delle 09:12 o aggiungerne una nuova?'
/**
 * Una scelta all'arrivo, come la fa chi rileva: dopo aver letto la domanda (più tardi di un doppio tocco), e poi con
 * il modulo che compare al suo posto (anche lui protetto dal doppio tocco).
 */
async function scegli(utente: ReturnType<typeof userEvent.setup>, nome: string) {
  const scelta = await screen.findByRole('button', { name: nome })
  piuTardi()
  await utente.click(scelta)
  piuTardi()
}
const pianta = (etichetta: string) => screen.findByRole('heading', { level: 2, name: `Pianta #${etichetta}` })
/** Come se alla pianta di prima si fosse spuntato "Mantieni" su Temp aria (Termometro, oggi) con quel valore. */
function mantenutaTempAria(valore: number) {
  const ta = par('Temp aria').id
  useCampoStore.getState().setStrumento('E', idStrumento('Termometro'))
  useCampoStore.getState().setMantieni('E', idStrumento('Termometro'), OGGI, ta, true)
  useCampoStore.getState().aggiornaMantenuti('E', { [ta]: [valore] })
}

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
  archivio = []
  vi.mocked(useSessione).mockReturnValue({ sessione: SESSIONE, caricamento: false })
  vi.mocked(sonoAdmin).mockResolvedValue(false)
  vi.mocked(caricaConfig).mockImplementation(async () => config)
  vi.mocked(misurePianta).mockImplementation(async id => archivio.filter(m => m.pianta_id === id))
  vi.mocked(misureDelGiorno).mockImplementation(async (_esp, data) => archivio.filter(m => m.data_rilievo === data))
  vi.mocked(salvaMisura).mockImplementation(async (_esp, m) => {
    archivio = [m, ...archivio.filter(x => x.id !== m.id)]
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MisuraPianta: intestazione', () => {
  it('ha lo strumento come titolo, la freccia verso la scelta, "Pianta #1" con il trattamento e i soli campi dello strumento', async () => {
    apri('1')
    await pronta()
    expect(screen.getByRole('heading', { level: 1, name: '💚 SPAD' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Indietro' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.getByRole('heading', { level: 2, name: 'Pianta #1' })).toBeInTheDocument()
    const trattamento = config.trattamenti.find(t => t.id === config.piante[0].trattamento_id)!
    expect(screen.getByText(trattamento.etichetta)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oggi · 💚 SPAD' })).toBeInTheDocument()
    expect(campo('SPAD')).toBeInTheDocument()
    expect(screen.queryByLabelText('Temp aria')).not.toBeInTheDocument()
    // Niente storia: si misura e si va avanti.
    expect(screen.queryByRole('region', { name: 'Storia' })).not.toBeInTheDocument()
  })

  it('il numero della pianta è l\'unico testo grande: il campo "Vai alla pianta" no', async () => {
    apri('1')
    await pronta()
    expect(campo('Vai alla pianta').className).not.toContain('text-numero')
    expect(campo('Vai alla pianta').className).toContain('font-mono')
  })

  it('lo strumento della pagina diventa quello scelto: la home e la scelta riprendono da qui', async () => {
    useCampoStore.getState().setStrumento('E', idStrumento('Termometro'))
    apri('1', 'SPAD')
    await pronta()
    await waitFor(() => expect(useCampoStore.getState().dati('E').strumentoId).toBe(idStrumento('SPAD')))
  })

  it('finché le misure del giorno non arrivano non c\'è il modulo (la pianta dopo non si sa ancora)', async () => {
    vi.mocked(misureDelGiorno).mockReturnValue(new Promise(() => {}))
    apri('1')
    await pianta('1')
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento…')
  })

  it('se le misure del giorno non si leggono lo dice, con "Riprova"', async () => {
    vi.mocked(misureDelGiorno).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })
})

describe('MisuraPianta: il giro', () => {
  it('dalla pianta 1, con la 2 e la 3 già fatte, "Salva e vai alla #4" salva e apre la 4', async () => {
    archivio = [misura('2'), misura('3')]
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41,2')
    await utente.click(pulsante('Salva e vai alla #4'))

    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '4')))
    await pianta('4')
    expect(salvate()).toHaveLength(1)
    expect(salvate()[0]).toMatchObject({ pianta_id: idPianta('1'), strumento_id: idStrumento('SPAD'), data_rilievo: OGGI })
    expect(salvate()[0].valori[par('SPAD').id]).toEqual([41.2])
    // Sulla 4 nessuna domanda: non ha misure.
    await pronta()
    expect(screen.queryByText(/aggiungerne una nuova/)).not.toBeInTheDocument()
  })

  it('c\'è anche "Salva", che resta sulla pianta', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: '10:00 · SPAD 41' })).toBeInTheDocument()
    expect(posizione()).toBe(percorso('SPAD', '1'))
  })

  it('"Salva e vai" prende il posto della pianta: il gesto indietro torna alla scelta dello strumento', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.click(pulsante('Salva e vai alla #2'))
    await pianta('2')
    await utente.click(pulsante('Indietro di sistema'))
    expect(posizione()).toBe('/esperimenti/E/misura')
  })

  it('sull\'ultima pianta da misurare "Salva e termina" porta alla fine del giro: "SPAD: 54/56", mancano 12 e 33', async () => {
    archivio = config.piante.filter(p => !['12', '33', '56'].includes(p.etichetta)).map(p => misura(p.etichetta))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    expect(screen.queryByRole('button', { name: /Salva e vai/ })).not.toBeInTheDocument()
    // Anche qui si può salvare e restare.
    expect(pulsante('Salva')).toBeInTheDocument()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))

    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/fine`))
    expect(await screen.findByRole('heading', { level: 2, name: 'SPAD: 54/56' })).toBeInTheDocument()
    expect(screen.getByText('Mancano 12, 33')).toBeInTheDocument()
    expect(salvate()).toHaveLength(1)
  })

  it('un doppio tocco su "Salva e termina" non tocca "Vai alle mancanti": si resta sulla fine del giro', async () => {
    archivio = config.piante.filter(p => !['12', '33', '56'].includes(p.etichetta)).map(p => misura(p.etichetta))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))
    const fine = `/esperimenti/E/misura/${idStrumento('SPAD')}/fine`
    await waitFor(() => expect(posizione()).toBe(fine))

    // Il secondo tocco, subito: nello stesso punto ora c'è "Vai alle mancanti".
    await utente.click(await screen.findByRole('button', { name: 'Vai alle mancanti' }))
    await utente.click(pulsante('Scegli un altro strumento'))
    expect(posizione()).toBe(fine)

    piuTardi()
    await utente.click(pulsante('Vai alle mancanti'))
    await pianta('12')
  })

  it('la fine del giro conta subito la pianta appena salvata, senza aspettare che le misure del giorno si rileggano', async () => {
    archivio = config.piante.filter(p => p.etichetta !== '56').map(p => misura(p.etichetta))
    const prima = archivio
    // La prima lettura arriva; quelle dopo il salvataggio no (rete lenta).
    vi.mocked(misureDelGiorno).mockImplementationOnce(async () => prima).mockImplementation(() => new Promise(() => {}))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))

    expect(await screen.findByRole('heading', { level: 2, name: 'SPAD: 56/56' })).toBeInTheDocument()
    expect(screen.queryByText(/^Mancano/)).not.toBeInTheDocument()
  })

  it('la pianta dopo l\'ultima non da misurare: dalla 30, con tutte le altre dopo già fatte, "Salva e termina"', async () => {
    archivio = config.piante.filter(p => Number(p.etichetta) > 30).map(p => misura(p.etichetta))
    apri('30')
    await pronta()
    expect(pulsante('Salva e termina')).toBeInTheDocument()
  })

  it('se "Salva e termina" non riesce resta sulla pianta con l\'errore, senza andare alla fine', async () => {
    archivio = config.piante.filter(p => p.etichetta !== '56').map(p => misura(p.etichetta))
    vi.mocked(salvaMisura).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('56')
    await pronta()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e termina'))

    const errore = await screen.findByRole('alert')
    expect(errore).toHaveTextContent('Pianta #56 non salvata.')
    expect(posizione()).toBe(percorso('SPAD', '56'))
    expect(campo('SPAD')).toHaveValue('40')

    await utente.click(within(errore).getByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(posizione()).toBe(`/esperimenti/E/misura/${idStrumento('SPAD')}/fine`))
    const [primo, secondo] = salvate()
    expect(secondo.id).toBe(primo.id)
    expect(await screen.findByRole('heading', { level: 2, name: 'SPAD: 56/56' })).toBeInTheDocument()
  })

  it('il doppio tocco su "Salva e vai" crea una sola misura e non salta due piante', async () => {
    let finisci!: () => void
    vi.mocked(salvaMisura).mockImplementationOnce(async (_esp, m) => new Promise<void>(r => {
      finisci = () => { archivio = [m, ...archivio]; r() }
    }))
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    const vai = pulsante('Salva e vai alla #2')
    act(() => {
      fireEvent.click(vai)
      fireEvent.click(vai)
    })
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    await act(async () => finisci())
    await pianta('2')
    await pronta()

    // Il secondo tocco arriva sulla pianta 2, nello stesso punto: non la salva e non porta alla 3.
    await utente.type(campo('SPAD'), '42')
    await utente.click(pulsante('Salva e vai alla #3'))
    await act(async () => {})
    expect(salvaMisura).toHaveBeenCalledTimes(1)
    expect(posizione()).toBe(percorso('SPAD', '2'))

    piuTardi()
    await utente.click(pulsante('Salva e vai alla #3'))
    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '3')))
    expect(salvate().map(m => m.pianta_id)).toEqual([idPianta('1'), idPianta('2')])
    expect(archivio).toHaveLength(2)
  })
})

describe('MisuraPianta: arrivo su una pianta già misurata', () => {
  it('"Vai alla pianta" 2 chiede "Correggere quella delle 09:12 o aggiungerne una nuova?", senza modulo', async () => {
    archivio = [misura('2'), misura('3')]
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('Vai alla pianta'), '2{Enter}')

    await pianta('2')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
    expect(pulsante('Correggi')).toBeInTheDocument()
    expect(pulsante('Nuova misura')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
  })

  it('"Correggi" apre la misura delle 09:12 e la salva con lo stesso id: nessun doppione', async () => {
    const esistente = misura('2')
    archivio = [esistente, misura('3')]
    const utente = userEvent.setup()
    apri('2')
    await scegli(utente, 'Correggi')

    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('38,1')
    await utente.clear(campo('SPAD'))
    await utente.type(campo('SPAD'), '39')
    await utente.click(pulsante('Salva e vai alla #4'))

    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '4')))
    expect(salvate()).toHaveLength(1)
    expect(salvate()[0]).toMatchObject({ id: esistente.id, ora: '09:12' })
    expect(archivio.filter(m => m.pianta_id === idPianta('2'))).toHaveLength(1)
    expect(archivio.find(m => m.id === esistente.id)?.valori[par('SPAD').id]).toEqual([39])
  })

  it('"Nuova misura" apre un modulo vuoto con un id nuovo, mai quello della misura esistente', async () => {
    const esistente = misura('2')
    archivio = [esistente]
    const utente = userEvent.setup()
    apri('2')
    await scegli(utente, 'Nuova misura')

    expect(campo('SPAD')).toHaveValue('')
    expect(screen.getByText('Nuova misura')).toBeInTheDocument()
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).toMatch(UUID)
    expect(salvate()[0].id).not.toBe(esistente.id)
    expect(archivio.find(m => m.id === esistente.id)).toEqual(esistente)
  })

  it('con più misure nel giorno le elenca per ora, ciascuna con il suo "Correggi"', async () => {
    const mattina = misura('2')
    const pomeriggio = misura('2', { ora: '15:40', valori: { [par('SPAD').id]: [41] } })
    archivio = [pomeriggio, mattina]
    const utente = userEvent.setup()
    apri('2')

    expect(await screen.findByText('Correggere una di quelle delle 09:12 e 15:40 o aggiungerne una nuova?')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Correggi/ }).map(b => b.textContent)).toEqual(['Correggi 09:12', 'Correggi 15:40'])
    await scegli(utente, 'Correggi 15:40')
    expect(screen.getByText('Modifica della misura delle 15:40')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('41')
  })

  it('due misure alla stessa ora si distinguono: "09:12 (1)" e "09:12 (2)" nella domanda, nell\'elenco e nei pulsanti', async () => {
    const prima = misura('2')
    const seconda = misura('2', { valori: { [par('SPAD').id]: [41] } })
    archivio = [prima, seconda]
    const utente = userEvent.setup()
    apri('2')

    expect(await screen.findByText('Correggere una di quelle delle 09:12 (1) e 09:12 (2) o aggiungerne una nuova?')).toBeInTheDocument()
    const elenco = screen.getByRole('list', { name: 'Misure già registrate' })
    expect(within(elenco).getAllByRole('listitem').map(li => li.textContent?.split(' · ')[0])).toEqual(['09:12 (1)', '09:12 (2)'])
    expect(screen.getAllByRole('button', { name: /^Correggi/ }).map(b => b.textContent)).toEqual(['Correggi 09:12 (1)', 'Correggi 09:12 (2)'])
    await scegli(utente, 'Correggi 09:12 (2)')
    expect(campo('SPAD')).toHaveValue('41')
  })

  it('una pianta fatta aperta apposta (da un collegamento) chiede anche lei', async () => {
    archivio = [misura('7')]
    apri('7')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
  })

  it('le misure di un altro strumento o di un altro giorno non contano: nessuna domanda', async () => {
    archivio = [
      misura('2', { strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24] } }),
      misura('2', { data_rilievo: IERI }),
    ]
    apri('2')
    await pronta()
    expect(screen.queryByText(/aggiungerne una nuova/)).not.toBeInTheDocument()
  })

  it('nel giro, arrivando su una pianta incompleta (Ciras con solo A e gs) si chiede', async () => {
    aggiungiCiras()
    archivio = [misura('33', {
      strumento_id: idStrumento('Ciras'), valori: { [par('A').id]: [12.3], [par('gs').id]: [0.21] },
    })]
    const utente = userEvent.setup()
    apri('32', 'Ciras')
    await pronta()
    expect(pulsante('Salva e vai alla #33')).toBeInTheDocument()
    await utente.type(campo('A'), '11')
    await utente.click(pulsante('Salva e vai alla #33'))

    await pianta('33')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
    expect(screen.queryByLabelText('E')).not.toBeInTheDocument()
  })

  it('arrivando dopo "Salva e vai", un tocco immediato sulla scelta è il secondo di un doppio tocco: non sceglie', async () => {
    // La 2 ha solo Temp aria: è incompleta, il giro ci passa e chiede.
    archivio = [misura('2', { strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24] } })]
    const utente = userEvent.setup()
    apri('1', 'Termometro')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(pulsante('Salva e vai alla #2'))
    await screen.findByText(UNA)

    await utente.click(pulsante('Nuova misura'))
    expect(screen.getByText(UNA)).toBeInTheDocument()

    piuTardi()
    await utente.click(pulsante('Nuova misura'))
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
    expect(campo('Temp pianta')).toHaveValue('')
  })

  it('"Vai alle mancanti" dalla fine del giro porta alla pianta incompleta e chiede', async () => {
    aggiungiCiras()
    const completa = (etichetta: string) => misura(etichetta, {
      strumento_id: idStrumento('Ciras'),
      valori: Object.fromEntries(['A', 'gs', 'E', 'Ci'].map(n => [par(n).id, [1]])),
    })
    archivio = [
      ...config.piante.filter(p => p.etichetta !== '33').map(p => completa(p.etichetta)),
      misura('33', { strumento_id: idStrumento('Ciras'), valori: { [par('A').id]: [12.3], [par('gs').id]: [0.21] } }),
    ]
    const utente = userEvent.setup()
    apri('', 'Ciras', `/esperimenti/E/misura/${idStrumento('Ciras')}/fine`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Ciras: 55/56' })).toBeInTheDocument()
    piuTardi()
    await utente.click(pulsante('Vai alle mancanti'))

    await pianta('33')
    expect(await screen.findByText(UNA)).toBeInTheDocument()
  })

  it('anche arrivando da "Vai alle mancanti" un doppio tocco non salta la domanda', async () => {
    const termometro = (etichetta: string, valori: ValoriMisura) => misura(etichetta, { strumento_id: idStrumento('Termometro'), valori })
    archivio = [
      ...config.piante.filter(p => p.etichetta !== '2').map(p => termometro(p.etichetta, { [par('Temp aria').id]: [24], [par('Temp pianta').id]: [25] })),
      termometro('2', { [par('Temp aria').id]: [24] }),
    ]
    const utente = userEvent.setup()
    apri('', 'Termometro', `/esperimenti/E/misura/${idStrumento('Termometro')}/fine`)
    const vai = await screen.findByRole('button', { name: 'Vai alle mancanti' })
    piuTardi()
    await utente.click(vai)
    await pianta('2')

    // Il secondo tocco cade su "Nuova misura", che è al posto di "Vai alle mancanti": la domanda resta.
    await utente.click(await screen.findByRole('button', { name: 'Nuova misura' }))
    expect(screen.getByText(UNA)).toBeInTheDocument()
    piuTardi()
    await utente.click(pulsante('Nuova misura'))
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
  })

  it('il modulo scelto compare dove c\'era la scelta: un doppio tocco su "Nuova misura" non salva i valori mantenuti', async () => {
    mantenutaTempAria(26)
    archivio = [misura('2', { strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24] } })]
    const utente = userEvent.setup()
    apri('2', 'Termometro')
    await screen.findByText(UNA)
    piuTardi()
    const nuova = pulsante('Nuova misura')
    act(() => {
      fireEvent.click(nuova)
    })
    // Il modulo nuovo ha già Temp aria (mantenuta): il secondo tocco cade su "Salva e vai alla #3".
    await utente.click(pulsante('Salva e vai alla #3'))
    await act(async () => {})
    expect(salvaMisura).not.toHaveBeenCalled()
    expect(campo('Temp aria')).toHaveValue('26')
    expect(posizione()).toBe(percorso('Termometro', '2'))
  })

  it('"Vai alle mancanti" porta su una pianta da fare protetta dal doppio tocco: un secondo tocco non la salva', async () => {
    mantenutaTempAria(26)
    archivio = config.piante.filter(p => p.etichetta !== '5').map(p => misura(p.etichetta, {
      strumento_id: idStrumento('Termometro'), valori: { [par('Temp aria').id]: [24], [par('Temp pianta').id]: [25] },
    }))
    const utente = userEvent.setup()
    apri('', 'Termometro', `/esperimenti/E/misura/${idStrumento('Termometro')}/fine`)
    const vai = await screen.findByRole('button', { name: 'Vai alle mancanti' })
    piuTardi()
    await utente.click(vai)
    await pianta('5')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('26')
    // Si continua a misurare: il cursore è nel primo campo da compilare.
    await waitFor(() => expect(campo('Temp pianta')).toHaveFocus())
    await utente.click(pulsante('Salva e termina'))
    await act(async () => {})
    expect(salvaMisura).not.toHaveBeenCalled()
  })
})

describe('MisuraPianta: valori non salvati e bozze', () => {
  it('una bozza non salvata ha la precedenza sulla domanda: si riprende con i suoi valori', async () => {
    archivio = [misura('2')]
    const utente = userEvent.setup()
    const primo = apri('2')
    await scegli(utente, 'Nuova misura')
    await utente.type(campo('SPAD'), '44')
    // Uscita senza passare dall'app (gesto indietro, ricarica): i valori restano nella bozza.
    primo.unmount()

    apri('2')
    await pronta()
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
    expect(screen.getByText('Bozza ripristinata.')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('44')
  })

  it('anche la bozza di una correzione si riprende senza domanda, sulla stessa misura', async () => {
    const esistente = misura('2')
    archivio = [esistente]
    const utente = userEvent.setup()
    const primo = apri('2')
    await scegli(utente, 'Correggi')
    await utente.clear(campo('SPAD'))
    await utente.type(campo('SPAD'), '45')
    primo.unmount()

    apri('2')
    await pronta()
    expect(screen.queryByText(UNA)).not.toBeInTheDocument()
    expect(screen.getByText('Modifica della misura delle 09:12')).toBeInTheDocument()
    expect(campo('SPAD')).toHaveValue('45')
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].id).toBe(esistente.id)
  })

  it('la freccia indietro con valori scritti chiede se scartarli', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.click(screen.getByRole('link', { name: 'Indietro' }))

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(percorso('SPAD', '1'))
    expect(campo('SPAD')).toHaveValue('41')

    await utente.click(screen.getByRole('link', { name: 'Indietro' }))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe('/esperimenti/E/misura'))
  })

  it('"Vai alla pianta" con valori scritti chiede se scartarli prima di cambiare pianta', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.type(campo('Vai alla pianta'), '5{Enter}')

    await utente.click(within(await dialogo()).getByRole('button', { name: 'Continua a modificare' }))
    await chiudiDialogo()
    expect(posizione()).toBe(percorso('SPAD', '1'))

    await utente.click(pulsante('Vai'))
    await utente.click(within(await dialogo()).getByRole('button', { name: 'Scarta' }))
    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '5')))
    expect(salvaMisura).not.toHaveBeenCalled()
  })
})

describe('MisuraPianta: vai alla pianta', () => {
  it('"Vai alla pianta" sulla pianta attuale non chiede e non tocca i valori scritti: svuota solo il campo', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')
    await utente.type(campo('Vai alla pianta'), '01{Enter}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campo('Vai alla pianta')).toHaveValue('')
    expect(campo('SPAD')).toHaveValue('41')
    expect(posizione()).toBe(percorso('SPAD', '1'))
  })

  it('" 01 " apre la pianta 1', async () => {
    const utente = userEvent.setup()
    apri('5')
    await pronta()
    await utente.type(campo('Vai alla pianta'), ' 01 ')
    await utente.click(pulsante('Vai'))
    await waitFor(() => expect(posizione()).toBe(percorso('SPAD', '1')))
    await pianta('1')
  })

  it('con etichette numeriche la tastiera è numerica, con il tasto "Vai"', async () => {
    apri('1')
    await pronta()
    expect(campo('Vai alla pianta')).toHaveAttribute('inputmode', 'numeric')
    expect(campo('Vai alla pianta')).toHaveAttribute('enterkeyhint', 'go')
  })

  it('una pianta che non c\'è: resta qui e lo dice, con il testo selezionato', async () => {
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('Vai alla pianta'), ' 999 {Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Nessuna pianta con etichetta «999» in questo esperimento.')
    expect(campo('Vai alla pianta')).toHaveAttribute('aria-invalid', 'true')
    expect(posizione()).toBe(percorso('SPAD', '1'))
    await utente.keyboard('7')
    expect(campo('Vai alla pianta')).toHaveValue('7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a campo vuoto "Vai" è spento', async () => {
    apri('1')
    await pronta()
    expect(pulsante('Vai')).toBeDisabled()
  })
})

describe('MisuraPianta: mantieni', () => {
  it('spuntata Temp aria nel giro Termometro, la pianta dopo la ha già compilata con il segno "mantenuto"', async () => {
    const utente = userEvent.setup()
    apri('1', 'Termometro')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.type(campo('Temp pianta'), '25')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #2'))

    await pianta('2')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')
    expect(campo('Temp aria')).toHaveAccessibleDescription(expect.stringContaining('mantenuto'))
    expect(campo('Temp pianta')).toHaveValue('')
    await waitFor(() => expect(campo('Temp pianta')).toHaveFocus())
  })

  it('cambiando strumento la spunta si azzera: tornando al Termometro la pianta non è precompilata', async () => {
    const utente = userEvent.setup()
    const primo = apri('1', 'Termometro')
    await pronta()
    await utente.type(campo('Temp aria'), '24,5')
    await utente.click(mantieni('Temp aria'))
    await utente.click(pulsante('Salva e vai alla #2'))
    await pianta('2')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('24,5')
    primo.unmount()

    // Un giro con lo SPAD, poi di nuovo il Termometro.
    const secondo = apri('3', 'SPAD')
    await pronta()
    secondo.unmount()
    apri('3', 'Termometro')
    await pronta()
    expect(campo('Temp aria')).toHaveValue('')
    expect(mantieni('Temp aria')).not.toBeChecked()
    expect(screen.queryByText('mantenuto')).not.toBeInTheDocument()
  })

  it('una lista (Palchi) non ha la casella', async () => {
    apri('1', 'Tabella fenologica')
    await pronta()
    const palchi = screen.getByRole('group', { name: 'Palchi' })
    expect(within(palchi).queryByRole('checkbox', { name: MANTIENI })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: MANTIENI }).length).toBeGreaterThan(0)
  })
})

describe('MisuraPianta: data di rilievo', () => {
  it('con la data di ieri c\'è l\'avviso, il giro guarda le misure di ieri e la misura si salva con quella data', async () => {
    useCampoStore.getState().setData('E', IERI)
    // Oggi la 2 è fatta, ieri no: il giro di ieri passa dalla 2.
    archivio = [misura('2')]
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    expect(screen.getByText('Stai registrando con data 27/10/2026, non oggi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '27/10/2026 · 💚 SPAD' })).toBeInTheDocument()
    expect(misureDelGiorno).toHaveBeenCalledWith('E', IERI)
    await utente.type(campo('SPAD'), '40')
    await utente.click(pulsante('Salva e vai alla #2'))

    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe(IERI)
    // La 2 ha una misura di oggi, non di ieri: nessuna domanda.
    await pianta('2')
    await pronta()
    expect(screen.queryByText(/aggiungerne una nuova/)).not.toBeInTheDocument()
  })

  it('a mezzanotte con valori scritti il modulo resta sul giorno in cui li si è scritti', async () => {
    vi.setSystemTime(new Date(2026, 9, 28, 23, 50))
    const utente = userEvent.setup()
    apri('1')
    await pronta()
    await utente.type(campo('SPAD'), '41')

    vi.setSystemTime(new Date(2026, 9, 29, 7, 30))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    Reflect.deleteProperty(document, 'visibilityState')

    expect(campo('SPAD')).toHaveValue('41')
    expect(screen.getByText('Stai registrando con data 28/10/2026, non oggi.')).toBeInTheDocument()
    await utente.click(pulsante('Salva'))
    await waitFor(() => expect(salvaMisura).toHaveBeenCalledTimes(1))
    expect(salvate()[0].data_rilievo).toBe(OGGI)
  })
})

describe('MisuraPianta: casi limite', () => {
  it('uno strumento archiviato lo dice, senza modulo, e riporta alla scelta', async () => {
    config.strumenti.find(s => s.nome === 'SPAD')!.archiviato = true
    useCampoStore.getState().setStrumento('E', idStrumento('Termometro'))
    apri('1', 'SPAD')
    expect(await screen.findByText('Lo strumento «SPAD» è archiviato: non si misura più.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scegli un altro strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('SPAD')).not.toBeInTheDocument()
    // La scelta di prima resta com'era.
    expect(useCampoStore.getState().dati('E').strumentoId).toBe(idStrumento('Termometro'))
  })

  it('uno strumento che non c\'è lo dice e riporta alla scelta', async () => {
    apri('1', 'SPAD', `/esperimenti/E/misura/strumento-cancellato/${idPianta('1')}`)
    expect(await screen.findByText('Questo strumento non esiste in questo esperimento.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scegli un altro strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
  })

  it('una pianta che non c\'è lo dice, senza modulo', async () => {
    apri('inesistente')
    expect(await screen.findByText('Questa pianta non esiste in questo esperimento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salva/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla scelta dello strumento' })).toHaveAttribute('href', '/esperimenti/E/misura')
  })

  it('se la configurazione non si carica spiega cosa è successo, con "Riprova"', async () => {
    vi.mocked(caricaConfig).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const utente = userEvent.setup()
    apri('1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Il server non risponde')
    await utente.click(pulsante('Riprova'))
    expect(await pronta()).toBeInTheDocument()
  })
})
